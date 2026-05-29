
"""Application configuration and environment loading.

Loads environment variables from `.env` and exposes a small
`Settings` object that other modules can import.
"""
from __future__ import annotations

import os
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel


# Load environment variables from .env (if present) into os.environ
load_dotenv()


class Settings(BaseModel):
	"""Configuration values for the application.

	Values are loaded from environment variables (already loaded from
	`.env` by `load_dotenv()` above) with sensible defaults.
	"""

	app_name: str = os.getenv("APP_NAME", "EDF gRPC Viewer")
	debug: bool = os.getenv("DEBUG", "False").lower() in ("1", "true", "yes")
	host: str = os.getenv("HOST", "127.0.0.1")
	port: int = int(os.getenv("PORT", "8000"))
	cors_origins: List[str] = [s.strip() for s in os.getenv("CORS_ORIGINS", "*").split(",") if s.strip()]
	database_url: str = os.getenv("DATABASE_URL", "")

	# gRPC server settings
	grpc_host: str = os.getenv("GRPC_HOST", "0.0.0.0")
	grpc_port: int = int(os.getenv("GRPC_PORT", "50051"))
	grpc_max_workers: int = int(os.getenv("GRPC_MAX_WORKERS", "10"))
	grpc_max_message_size_mb: int = int(os.getenv("GRPC_MAX_MESSAGE_MB", "50"))

	# EDF data source
	edf_file_path: str = os.getenv("EDF_FILE_PATH", "aaaaamrj_s001_t000.edf")


# Single settings instance used by the app
settings = Settings()


__all__ = ["Settings", "settings"]

