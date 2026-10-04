#!/usr/bin/env bash
# EcoMind AI - system health check (macOS / Linux / Windows Git Bash + WSL).
#
# Read-only in intent: it reports what is and is not present without changing
# anything, so it is safe to run on someone else's machine when diagnosing a
# bad clone.
set -euo pipefail
cd "$(dirname "$0")"

SKIP_VENV_BOOTSTRAP=1
# shellcheck source=scripts/find_python.sh
. "./scripts/find_python.sh"

PY_BIN=${PY_BIN:-}
[ -n "$PY_BIN" ] || { echo "[!] Could not find a Python interpreter." >&2; exit 1; }

exec "$PY_BIN" -m launcher.start --check "$@"