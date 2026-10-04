#!/usr/bin/env bash
# EcoMind AI - shared interpreter discovery for the bash entry points.
#
# Sourced by ecomind.sh. On success it sets PY_BIN.
# On failure it prints the platform-specific remedy and sets PY_BIN to empty,
# so the caller decides how to exit. It never calls `exit` itself.
#
# Why this file exists rather than three copies of four lines each: every copy
# in the tree checked only `.venv/bin/python`, which is the POSIX venv layout.
# On Windows the interpreter is at `.venv/Scripts/python.exe`, so all three
# scripts fell through to `command -v python3` -- which on Windows is a
# Microsoft Store App Execution Alias that prints a store message and exits.
# The launcher "did nothing" for a reason that had nothing to do with the app.
#
# The constructs below are deliberately plain: no nested quotes inside command
# substitution, no `return` at file scope, no line continuations inside `for`
# lists. Git Bash rejects several of the tidier spellings.

# MIN_PY_MAJOR / MIN_PY_MINOR may be set by the caller before sourcing.
: "${MIN_PY_MAJOR:=3}"
: "${MIN_PY_MINOR:=10}"

# Candidate venv interpreters, both OS layouts. A repo cloned on Windows and
# opened in a WSL shell still finds its venv, and the reverse also holds.
ECOMIND_VENV_CANDIDATES='.venv/Scripts/python.exe .venv/bin/python venv/Scripts/python.exe venv/bin/python'
ECOMIND_PY_NAMES='python3 python py'

# A candidate counts only if it actually runs and reports a parseable version.
# That is what filters out the Microsoft Store stub, which exits non-zero.
ecomind_usable_python() {
  local candidate
  local raw
  local major
  local minor

  candidate=$1
  if [ -z "$candidate" ]; then
    return 1
  fi
  if [ ! -x "$candidate" ] && ! command -v "$candidate" > /dev/null 2>&1; then
    return 1
  fi

  raw=$("$candidate" -c 'import sys; print(sys.version_info[0], sys.version_info[1])' 2> /dev/null)
  if [ -z "$raw" ]; then
    return 1
  fi

  major=${raw%% *}
  minor=${raw##* }
  case "$major$minor" in
    *[!0-9]*) return 1 ;;
  esac

  if [ "$major" -gt "$MIN_PY_MAJOR" ]; then
    return 0
  fi
  [ "$major" -eq "$MIN_PY_MAJOR" ] && [ "$minor" -ge "$MIN_PY_MINOR" ]
}

# 1. An existing virtualenv wins.
PY_BIN=''
for candidate in $ECOMIND_VENV_CANDIDATES; do
  if ecomind_usable_python "$candidate"; then
    PY_BIN=$candidate
    break
  fi
done

# 2. Otherwise a system interpreter.
if [ -z "$PY_BIN" ]; then
  for name in $ECOMIND_PY_NAMES; do
    if ecomind_usable_python "$name"; then
      PY_BIN=$(command -v "$name")
      break
    fi
  done
fi

# 3. Nothing usable. Advise, and leave PY_BIN empty for the caller to handle.
if [ -z "$PY_BIN" ]; then
  echo "[!] Python $MIN_PY_MAJOR.$MIN_PY_MINOR+ is required but no working interpreter was found." >&2
  case $(uname -s 2> /dev/null || echo unknown) in
    MINGW* | MSYS* | CYGWIN*)
      echo "    Windows: install Python from python.org and tick 'Add python.exe to PATH'," >&2
      echo "    then reopen the terminal. Or run ecomind.bat, which finds it for you." >&2
      ;;
    Darwin)
      echo "    macOS:  brew install python@$MIN_PY_MAJOR" >&2
      ;;
    *)
      echo "    Linux:  sudo apt install python$MIN_PY_MAJOR python$MIN_PY_MAJOR-venv" >&2
      ;;
  esac
  return 0 2> /dev/null || true
fi

# 4. No virtualenv at all: create one, so the first run never installs packages
#    into the user's system Python. A failure here is a warning, not a fatal
#    error -- the launcher re-checks and reports properly.
ecomind_has_venv=0
for candidate in $ECOMIND_VENV_CANDIDATES; do
  if [ -x "$candidate" ]; then
    ecomind_has_venv=1
    break
  fi
done

if [ -z "${SKIP_VENV_BOOTSTRAP:-}" ] && [ "$ecomind_has_venv" -eq 0 ]; then
  echo "[..] No virtualenv found - creating .venv (first run, may take a minute) ..."
  if "$PY_BIN" -m venv .venv; then
    for candidate in .venv/Scripts/python.exe .venv/bin/python; do
      if ecomind_usable_python "$candidate"; then
        PY_BIN=$candidate
        break
      fi
    done
  else
    echo "[!] Could not create a virtualenv." >&2
    echo "    On Debian/Ubuntu install it first: sudo apt install python3-venv" >&2
  fi
fi

return 0 2> /dev/null || true