"""gRPC async server factory and startup helper."""
from __future__ import annotations

import logging

import grpc
from grpc import aio as grpc_aio
from grpc_reflection.v1alpha import reflection

from app.core.config import settings
from app.grpc.generated import edf_stream_pb2, edf_stream_pb2_grpc
from app.grpc.servicer import EDFStreamServicer
from app.services.edf_service import EDFService

logger = logging.getLogger(__name__)


def build_server() -> grpc_aio.Server:
    """Create and configure the gRPC async server.

    Returns:
        A configured (but not yet started) ``grpc.aio.Server`` instance.
    """
    max_bytes = settings.grpc_max_message_size_mb * 1024 * 1024
    options = [
        ("grpc.max_send_message_length", max_bytes),
        ("grpc.max_receive_message_length", max_bytes),
    ]

    server = grpc_aio.server(options=options)

    edf_svc = EDFService(settings.edf_file_path)
    servicer = EDFStreamServicer(edf_svc)

    edf_stream_pb2_grpc.add_EDFStreamServiceServicer_to_server(servicer, server)

    # Enable server reflection (useful for grpcurl / Postman)
    service_names = (
        edf_stream_pb2.DESCRIPTOR.services_by_name["EDFStreamService"].full_name,
        reflection.SERVICE_NAME,
    )
    reflection.enable_server_reflection(service_names, server)

    address = "%s:%d" % (settings.grpc_host, settings.grpc_port)
    server.add_insecure_port(address)

    return server


__all__ = ["build_server"]
