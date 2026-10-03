#!/usr/bin/env bash
# EcoMind AI - one-click launcher (macOS / Linux).
# Installs everything required on first run.
set -euo pipefail
cd "$(dirname "$0")"

PY_BIN=""
if [ -x ".venv/bin/python" ]; then
  PY_BIN=".venv/bin/python"
else
  PY_BIN="$(command -v python3 || command -v python || true)"
fi

if [ -z "$PY_BIN" ]; then
  echo "[!] Python 3.11+ is required but was not found on PATH."
  echo "    macOS:  brew install python@3.11      Linux:  sudo apt install python3 python3-venv"
  exit 1
fi

echo
echo "  ============================================================"
echo "   EcoMind AI - One-click Launcher"
echo "   (installs everything required on first run)"
echo "  ============================================================"
echo

exec "$PY_BIN" -m launcher.start "$@"
