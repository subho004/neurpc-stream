"""FastAPI routes for EDF streaming via SSE + JSON.

Since browsers cannot speak raw gRPC (HTTP/2 binary framing), this
module exposes two HTTP endpoints that wrap the internal gRPC service:

  GET /edf/metadata           → JSON (unary)
  GET /edf/stream             → Server-Sent Events (chunked float data)

The frontend uses the ConnectRPC @connectrpc/connect-web transport which
speaks the Connect protocol. For simplicity, these REST/SSE endpoints
mirror the proto schema as JSON, which @connectrpc/connect-web can
consume via the ``createConnectTransport`` with HTTP/1.1.

These endpoints delegate to ``EDFService`` directly — no gRPC hop needed
in-process.
"""
from __future__ import annotations

import asyncio
import json
import logging
import struct
from typing import AsyncGenerator

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, StreamingResponse

from app.services.edf_service import EDFService
from app.core.config import settings
from utils.response import success_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/edf", tags=["edf_stream"])

# Shared EDF service instance (loaded once, lazy)
_edf_service: EDFService | None = None


def _get_edf_service() -> EDFService:
    """Return (or create) the shared EDFService instance."""
    global _edf_service  # noqa: PLW0603
    if _edf_service is None:
        _edf_service = EDFService(settings.edf_file_path)
    return _edf_service


# ── Metadata ─────────────────────────────────────────────────────────────────

@router.get("/metadata")
async def get_metadata() -> JSONResponse:
    """Return EDF file metadata as JSON."""
    svc = _get_edf_service()
    meta = await asyncio.to_thread(svc.get_metadata)
    return success_response(data=meta, message="EDF metadata retrieved")


# ── SSE Streaming ─────────────────────────────────────────────────────────────

@router.get("/stream")
async def stream_edf_window(
    start_sample: int = Query(0, ge=0, description="First sample index (absolute)"),
    chunk_size: int = Query(2048, ge=64, le=65536, description="Samples per chunk per channel"),
    window_samples: int = Query(0, ge=0, description="Samples to stream (0 = to end of file)"),
    channel_indices: str = Query("", description="Comma-separated channel indices (empty = all)"),
) -> StreamingResponse:
    """Stream EDF data as Server-Sent Events.

    Each SSE ``data:`` line is a JSON object matching the EDFChunk proto
    schema, with ``samples`` encoded as a base-64 string of float32 bytes.
    The frontend decodes it with ``Float32Array``.
    """
    import base64

    parsed_channels: list[int] = []
    if channel_indices:
        try:
            parsed_channels = [int(x.strip()) for x in channel_indices.split(",") if x.strip()]
        except ValueError:
            parsed_channels = []

    svc = _get_edf_service()

    async def _event_generator() -> AsyncGenerator[str, None]:
        """Yield SSE-formatted lines."""
        # Yield a keep-alive comment immediately so the browser connection stays open
        yield ": connected\n\n"

        def _run_stream() -> list[dict]:
            return list(
                svc.stream_window(
                    start_sample=start_sample,
                    chunk_size=chunk_size,
                    window_samples=window_samples,
                    channel_indices=parsed_channels,
                )
            )

        try:
            chunks = await asyncio.to_thread(_run_stream)
        except FileNotFoundError as exc:
            yield "data: %s\n\n" % json.dumps({"error": str(exc)})
            return
        except Exception as exc:  # noqa: BLE001
            logger.exception("EDF stream error: %s", exc)
            yield "data: %s\n\n" % json.dumps({"error": "Internal error"})
            return

        for chunk in chunks:
            payload = {
                "samples": base64.b64encode(chunk["samples"]).decode("ascii"),
                "n_channels": chunk["n_channels"],
                "n_samples": chunk["n_samples"],
                "start_sample": chunk["start_sample"],
                "chunk_index": chunk["chunk_index"],
                "is_last": chunk["is_last"],
                "channel_names": chunk["channel_names"],
                "sfreq": chunk["sfreq"],
            }
            yield "data: %s\n\n" % json.dumps(payload)
            # Small yield point so the event loop can handle other requests
            await asyncio.sleep(0)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
