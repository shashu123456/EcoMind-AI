#!/usr/bin/env bash
# EcoMind AI - system health check (macOS / Linux).
set -euo pipefail
cd "$(dirname "$0")"

PY_BIN=""
if [ -x ".venv/bin/python" ]; then
  PY_BIN=".venv/bin/python"
else
  PY_BIN="$(command -v python3 || command -v python || true)"
fi
[ -n "$PY_BIN" ] || { echo "[!] Python not found on PATH."; exit 1; }

exec "$PY_BIN" -m launcher.start --check
