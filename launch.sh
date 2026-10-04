#!/usr/bin/env bash
# EcoMind AI - one-click launcher (macOS / Linux / Windows Git Bash + WSL).
#
# Installs everything required on first run, then hands control to the Python
# launcher in launcher/start.py, which owns the bootstrap and supervises the
# backend and frontend. This file's only job is to find a Python that genuinely
# works, which is subtler than it sounds: on Windows the Microsoft Store ships
# an App Execution Alias named `python3` that prints a store message and exits
# non-zero instead of failing loudly. Discovery lives in
# scripts/find_python.sh, shared with stop.sh and check.sh so it is fixed once.
set -euo pipefail
cd "$(dirname "$0")"

# shellcheck source=scripts/find_python.sh
. "./scripts/find_python.sh"

PY_BIN=${PY_BIN:-}
[ -n "$PY_BIN" ] || exit 1

echo ""
echo "  ============================================================"
echo "   EcoMind AI - One-click Launcher"
echo "   (installs everything required on first run)"
echo "  ============================================================"
echo "    interpreter: $PY_BIN ($("$PY_BIN" -V 2>&1))"
echo ""

# `exec` so the launcher owns the terminal and Ctrl-C reaches it directly.
# Without it a stray Ctrl-C kills only the shell and leaves orphaned servers
# holding ports 8000 and 5173, which is what makes the next launch look broken.
exec "$PY_BIN" -m launcher.start "$@"