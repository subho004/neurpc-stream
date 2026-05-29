#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# generate_proto.sh — regenerate Python gRPC stubs from .proto files
#
# Usage:
#   cd backend
#   source .venv/bin/activate
#   bash scripts/generate_proto.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROTO_DIR="$BACKEND_DIR/proto"
OUT_DIR="$BACKEND_DIR/app/grpc/generated"

echo "▸ Backend  : $BACKEND_DIR"
echo "▸ Proto dir: $PROTO_DIR"
echo "▸ Out dir  : $OUT_DIR"

mkdir -p "$OUT_DIR"

# Write an __init__.py so Python treats it as a package
touch "$OUT_DIR/__init__.py"

python -m grpc_tools.protoc \
  --proto_path="$PROTO_DIR" \
  --python_out="$OUT_DIR" \
  --grpc_python_out="$OUT_DIR" \
  "$PROTO_DIR/edf_stream.proto"

# ── Post-process: fix bare import in _grpc.py to use package-relative import ──
GRPC_FILE="$OUT_DIR/edf_stream_pb2_grpc.py"
sed -i.bak \
  -e 's/^import edf_stream_pb2 as edf__stream__pb2$/from app.grpc.generated import edf_stream_pb2 as edf__stream__pb2/' \
  -e '/GRPC_GENERATED_VERSION.*1\.[0-9]/,/raise RuntimeError/d' \
  "$GRPC_FILE"
rm -f "${GRPC_FILE}.bak"
echo "  patched: bare import → package-relative import"

echo "✔ Stubs generated in $OUT_DIR"
ls "$OUT_DIR"
