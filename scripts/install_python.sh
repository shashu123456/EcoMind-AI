#!/usr/bin/env bash
# EcoMind AI - install a Python interpreter when the machine has none.
#
# Sourced by ecomind.sh, and only ever called when scripts/find_python.sh came
# back empty. That case cannot be handled inside the launcher: `python -m
# launcher.start` is precisely what is unavailable. So this lives one level up,
# where a shell is all that is guaranteed to exist.
#
# Sets INSTALL_PYTHON_OK=1 on success. Never calls `exit` -- the caller decides.

# shellcheck disable=SC2034  # read by the caller after sourcing
INSTALL_PYTHON_OK=0

_ecomind_py_major=3
_ecomind_py_minor=12

# Deliberately plain constructs: no nested quotes inside command substitution,
# no `return` at file scope, no line continuations inside `for` lists. Git Bash
# rejects several of the tidier spellings. See scripts/find_python.sh.
_ecomind_install_with_winget() {
  command -v winget > /dev/null 2>&1 || return 1
  echo "[..] Installing Python ${_ecomind_py_major}.${_ecomind_py_minor} via winget (this takes a minute) ..."
  winget install -e --id "Python.Python.${_ecomind_py_major}${_ecomind_py_minor}" \
    --accept-source-agreements --accept-package-agreements --scope user --silent
}

_ecomind_install_with_choco() {
  command -v choco > /dev/null 2>&1 || return 1
  echo "[..] Installing Python via Chocolatey (this takes a minute) ..."
  choco install python${_ecomind_py_major} -y
}

_ecomind_install_with_brew() {
  command -v brew > /dev/null 2>&1 || return 1
  echo "[..] Installing Python via Homebrew (this takes a minute) ..."
  brew install "python@${_ecomind_py_major}.${_ecomind_py_minor}"
}

_ecomind_install_with_apt() {
  command -v apt-get > /dev/null 2>&1 || return 1
  local sudo=""
  if [ "$(id -u)" != "0" ] && command -v sudo > /dev/null 2>&1; then
    sudo="sudo"
  fi
  echo "[..] Installing Python via apt (may ask for your password) ..."
  $sudo apt-get update -y && $sudo apt-get install -y python3 python3-venv python3-pip
}

_ecomind_install_with_dnf() {
  command -v dnf > /dev/null 2>&1 || return 1
  local sudo=""
  if [ "$(id -u)" != "0" ] && command -v sudo > /dev/null 2>&1; then
    sudo="sudo"
  fi
  echo "[..] Installing Python via dnf ..."
  $sudo dnf install -y python3 python3-pip
}

_ecomind_install_with_pacman() {
  command -v pacman > /dev/null 2>&1 || return 1
  local sudo=""
  if [ "$(id -u)" != "0" ] && command -v sudo > /dev/null 2>&1; then
    sudo="sudo"
  fi
  echo "[..] Installing Python via pacman ..."
  $sudo pacman -S --needed --noconfirm python python-pip
}

# Where a freshly installed interpreter lands, which the running shell does not
# know about yet. Without this the install succeeds and the launcher is still
# told there is no Python.
_ecomind_refresh_path() {
  case $(uname -s 2> /dev/null || echo unknown) in
    MINGW* | MSYS* | CYGWIN*)
      for dir in "$HOME/AppData/Local/Programs/Python"/*; do
        [ -d "$dir" ] && PATH="$dir:$dir/Scripts:$PATH"
      done
      for dir in "/c/Program Files/Python"*; do
        [ -d "$dir" ] && PATH="$dir:$dir/Scripts:$PATH"
      done
      ;;
    Darwin)
      for dir in /opt/homebrew/bin /usr/local/bin; do
        [ -d "$dir" ] && PATH="$dir:$PATH"
      done
      ;;
    *)
      for dir in /usr/local/bin; do
        [ -d "$dir" ] && PATH="$dir:$PATH"
      done
      ;;
  esac
  export PATH
}

ecomind_install_python() {
  local osname
  osname=$(uname -s 2> /dev/null || echo unknown)

  echo ""
  echo "  [!] No Python interpreter found on this machine."
  echo "      Installing one now, so this stays a one-click setup ..."
  echo ""

  case "$osname" in
    MINGW* | MSYS* | CYGWIN*)
      _ecomind_install_with_winget || _ecomind_install_with_choco
      ;;
    Darwin)
      _ecomind_install_with_brew
      ;;
    *)
      _ecomind_install_with_apt || _ecomind_install_with_dnf || _ecomind_install_with_pacman
      ;;
  esac

  _ecomind_refresh_path

  # Re-probe rather than assume: an installer can exit 0 and still leave nothing
  # runnable, which is exactly the Microsoft Store case this tree already fell
  # into once.
  if [ -n "$(command -v python3 2> /dev/null || command -v python 2> /dev/null || true)" ]; then
    INSTALL_PYTHON_OK=1
    echo ""
    echo "[OK] Python installed."
    return 0
  fi

  echo "" >&2
  echo "[!] The install did not produce a runnable interpreter." >&2
  echo "    Windows: python.org -> tick 'Add python.exe to PATH', then reopen this window." >&2
  echo "    macOS:   brew install python@3.12   (or install from python.org)" >&2
  echo "    Linux:   sudo apt install python3 python3-venv" >&2
  return 1
}

return 0 2> /dev/null || true
