#!/usr/bin/env bash
# EcoMind AI - the one entry point (macOS / Linux / Windows Git Bash + WSL).
#
#   ./ecomind.sh            start the app (installs anything missing)
#   ./ecomind.sh stop       stop every service
#   ./ecomind.sh check      report on the machine without changing it
#   ./ecomind.sh help       this list
#
# Why one file and not launch.sh / stop.sh / check.sh: three scripts meant three
# copies of interpreter discovery, and they had already drifted apart -- every
# copy in the tree checked `.venv/bin/python`, which is the POSIX layout, so on
# Windows all three fell through to the Microsoft Store's `python3` alias and
# appeared to do nothing. Discovery now happens once, here, and the three
# actions differ only in the module they hand off to.
#
# Everything real lives in the `launcher` package; this file finds a Python that
# actually runs and gets out of the way.
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  # The command list only -- the rationale below it is for whoever edits this
  # file, not for whoever runs it.
  sed -n '4,7p' "$0" | sed 's/^# \{0,1\}//'
}

COMMAND=${1:-start}
[ $# -gt 0 ] && shift || true

case "$COMMAND" in
  help | -h | --help)
    usage
    exit 0
    ;;
  start | stop | check) ;;
  *)
    echo "[!] Unknown command '$COMMAND'." >&2
    echo >&2
    usage >&2
    exit 2
    ;;
esac

# Stopping must never depend on the install having succeeded, so neither
# `stop` nor `check` is allowed to create a virtualenv on its way to running.
case "$COMMAND" in
  stop | check) SKIP_VENV_BOOTSTRAP=1 ;;
esac
export SKIP_VENV_BOOTSTRAP=${SKIP_VENV_BOOTSTRAP:-}

# shellcheck source=scripts/find_python.sh
. "./scripts/find_python.sh"

PY_BIN=${PY_BIN:-}
if [ -z "$PY_BIN" ]; then
  echo "[!] No working Python interpreter, so there is nothing to run." >&2
  exit 1
fi

if [ "$COMMAND" = "start" ]; then
  echo ""
  echo "  ============================================================"
  echo "   EcoMind AI - One-click Launcher"
  echo "   (installs everything required on first run)"
  echo "  ============================================================"
  echo "    command:     $COMMAND"
  echo "    interpreter: $PY_BIN ($("$PY_BIN" -V 2>&1))"
  echo ""
  # `exec` so the launcher owns the terminal and Ctrl-C reaches it directly.
  # Without it a stray Ctrl-C kills only the shell and leaves orphaned servers
  # holding ports 8000 and 5173, which is what makes the next launch look broken.
  exec "$PY_BIN" -m launcher.start "$@"
fi

if [ "$COMMAND" = "check" ]; then
  exec "$PY_BIN" -m launcher.start --check "$@"
fi

exec "$PY_BIN" -m launcher.stop "$@"
