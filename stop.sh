#!/usr/bin/env bash
# EcoMind AI - stop all services (macOS / Linux / Windows Git Bash + WSL).
#
# Works without a virtualenv as well as with one: stopping the app must never
# depend on the install having succeeded.
set -euo pipefail
cd "$(dirname "$0")"

# Stopping does not need a venv, and should not try to create one.
SKIP_VENV_BOOTSTRAP=1
# shellcheck source=scripts/find_python.sh
. "./scripts/find_python.sh"

PY_BIN=${PY_BIN:-}
[ -n "$PY_BIN" ] || { echo "[!] Could not find a Python interpreter; nothing to run." >&2; exit 1; }

exec "$PY_BIN" -m launcher.stop "$@"