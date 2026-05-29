"""gRPC servicer implementing EDFStreamService.

Bridges the gRPC proto interface to the business-logic ``EDFService``
layer. All MNE I/O runs in a thread-pool executor via
``asyncio.to_thread`` so the async gRPC server loop never blocks.
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

import grpc

from app.grpc.generated import edf_stream_pb2, edf_stream_pb2_grpc
from app.services.edf_service import EDFService

logger = logging.getLogger(__name__)

# Thread pool for synchronous MNE calls
_THREAD_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mne-io")


class EDFStreamServicer(edf_stream_pb2_grpc.EDFStreamServiceServicer):
    """Implements the EDFStreamService gRPC service."""

    def __init__(self, edf_service: EDFService) -> None:
        self._svc = edf_service

    # ── Unary ─────────────────────────────────────────────────────────────

    async def GetMetadata(
        self,
        request: edf_stream_pb2.EDFMetadataRequest,  # type: ignore[name-defined]
        context: grpc.aio.ServicerContext,  # type: ignore[name-defined]
    ) -> edf_stream_pb2.EDFMetadataResponse:  # type: ignore[name-defined]
        """Return EDF file metadata."""
        logger.info("GetMetadata called")
        try:
            meta = await asyncio.to_thread(self._svc.get_metadata)
        except FileNotFoundError as exc:
            await context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
            raise

        channels = [
            edf_stream_pb2.ChannelInfo(
                name=ch["name"],
                type=ch["type"],
                unit=ch["unit"],
                low_freq=ch["low_freq"],
                high_freq=ch["high_freq"],
            )
            for ch in meta["channels"]
        ]

        return edf_stream_pb2.EDFMetadataResponse(
            channels=channels,
            sfreq=meta["sfreq"],
            n_samples=meta["n_samples"],
            duration_seconds=meta["duration_seconds"],
            subject_info=meta["subject_info"],
            annotations=meta["annotations"],
        )

    # ── Server-streaming ──────────────────────────────────────────────────

    async def StreamEDFWindow(
        self,
        request: edf_stream_pb2.StreamEDFRequest,  # type: ignore[name-defined]
        context: grpc.aio.ServicerContext,  # type: ignore[name-defined]
    ) -> None:
        """Stream EDF data chunks back to the client."""
        logger.info(
            "StreamEDFWindow: start=%d chunk=%d window=%d channels=%s",
            request.start_sample,
            request.chunk_size,
            request.window_samples,
            list(request.channel_indices),
        )

        chunk_size = request.chunk_size if request.chunk_size > 0 else 2048
        channel_indices = list(request.channel_indices)

        # Run the synchronous generator in a thread, yield results to the
        # async stream one at a time.
        loop = asyncio.get_event_loop()

        def _generate():
            return list(
                self._svc.stream_window(
                    start_sample=request.start_sample,
                    chunk_size=chunk_size,
                    window_samples=request.window_samples,
                    channel_indices=channel_indices,
                )
            )

        try:
            # For large files we fetch all chunks of the window at once in a
            # thread.  For true progressive streaming (huge windows) this
            # could be refactored to a queue-based producer.
            chunks = await loop.run_in_executor(_THREAD_POOL, _generate)
        except FileNotFoundError as exc:
            await context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
            return
        except Exception as exc:  # noqa: BLE001
            logger.exception("Error reading EDF: %s", exc)
            await context.abort(grpc.StatusCode.INTERNAL, "EDF read error")
            return

        for chunk_dict in chunks:
            proto_chunk = edf_stream_pb2.EDFChunk(
                samples=chunk_dict["samples"],
                n_channels=chunk_dict["n_channels"],
                n_samples=chunk_dict["n_samples"],
                start_sample=chunk_dict["start_sample"],
                chunk_index=chunk_dict["chunk_index"],
                is_last=chunk_dict["is_last"],
                channel_names=chunk_dict["channel_names"],
                sfreq=chunk_dict["sfreq"],
            )
            await context.write(proto_chunk)

        logger.info("StreamEDFWindow completed — %d chunks sent", len(chunks))
