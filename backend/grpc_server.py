"""Standalone gRPC server entry point.

Run with:
    source .venv/bin/activate
    python grpc_server.py

The server starts on the port configured by GRPC_PORT (default 50051)
and exposes the EDFStreamService with gRPC server reflection enabled.

For browser clients using ConnectRPC / gRPC-Web, a proxy such as
grpcwebproxy or Envoy is required. For CLI tools such as grpcurl, connect
directly to this server.
"""
from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time
from pathlib import Path

# Allow running from any working directory
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from app.core.config import settings
from app.grpc.server import build_server

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

_SHUTDOWN_GRACE_SECONDS = 5


async def _serve() -> None:
    """Start the gRPC server and block until interrupted."""
    server = build_server()
    address = "%s:%d" % (settings.grpc_host, settings.grpc_port)

    start = time.perf_counter()
    await server.start()
    elapsed = time.perf_counter() - start

    logger.info(
        "gRPC server listening on %s  (EDF: %s)  [%.3fs startup]",
        address,
        settings.edf_file_path,
        elapsed,
    )

    # Handle SIGINT / SIGTERM gracefully
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _handle_signal() -> None:
        logger.info("Shutdown signal received — stopping server …")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal)

    await stop_event.wait()
    await server.stop(grace=_SHUTDOWN_GRACE_SECONDS)
    logger.info("gRPC server stopped cleanly.")


def main() -> None:
    """Entry point."""
    logger.info("Starting EDF gRPC server …")
    asyncio.run(_serve())


if __name__ == "__main__":
    main()
