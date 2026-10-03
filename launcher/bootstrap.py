"""Idempotent, cross-platform bootstrap for EcoMind AI.

Turns a fresh clone into a runnable install with a single call:

    ensure_all()  ->  runtime -> venv -> python deps -> node deps -> .env -> seed

Every step is keyed on a hash stamp, so normal launches only pay a hash
comparison. Pass ``force=True`` to redo everything, or ``install=False`` to
only report what is missing (used by the system checker).
"""
from __future__ import annotations

import hashlib
import os
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

from launcher.config import (
    load_config,
    project_root,
    python_executable,
    venv_dir,
    venv_python,
)
from launcher.logutil import get_logger

log = get_logger()


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def _say(msg: str) -> None:
    print(msg, flush=True)
    try:
        log.info(msg)
    except Exception:
        pass


def _stamp_dir() -> Path:
    cfg = load_config()
    d = project_root() / cfg["paths"].get("pid_dir", "backend/data/launcher")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _stamp_path(name: str) -> Path:
    return _stamp_dir() / f".deps-{name}.stamp"


def _up_to_date(name: str, signature: str) -> bool:
    p = _stamp_path(name)
    try:
        return p.exists() and p.read_text(encoding="utf-8").strip() == signature
    except Exception:
        return False


def _write_stamp(name: str, signature: str) -> None:
    try:
        _stamp_path(name).write_text(signature, encoding="utf-8")
    except Exception:
        pass


def _stream(cmd: list[str], cwd: Path | None = None) -> int:
    _say("    $ " + " ".join(str(c) for c in cmd))
    try:
        proc = subprocess.Popen(
            [str(c) for c in cmd],
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
    except FileNotFoundError as exc:
        _say(f"    ! {exc}")
        return 127
    assert proc.stdout is not None
    for line in proc.stdout:
        print("    " + line.rstrip(), flush=True)
    return proc.wait()


def _first_line(cmd: list[str]) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        out = (r.stdout or r.stderr or "").strip()
        return out.splitlines()[0] if out else ""
    except Exception:
        return ""


def _os() -> str:
    if os.name == "nt":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def _major(version: str) -> int:
    try:
        return int(version.lstrip("v").split(".")[0])
    except Exception:
        return 0


# --------------------------------------------------------------------------- #
# runtime
# --------------------------------------------------------------------------- #
def node_version() -> str:
    return _first_line(["node", "--version"])


def npm_version() -> str:
    from launcher.config import npm_executable

    return _first_line([npm_executable(), "--version"])


def ensure_python_runtime() -> bool:
    minv = tuple(int(x) for x in str(load_config().get("python", {}).get("min_version", "3.10")).split(".")[:2])
    ok = sys.version_info[:2] >= minv
    if ok:
        _say(f"[OK] Python {sys.version.split()[0]} (running the launcher).")
    else:
        _say(f"[!] Python {sys.version.split()[0]} is older than {'.'.join(map(str, minv))}. Install a newer Python.")
    return ok


def _install_node() -> bool:
    osname = _os()
    if osname == "windows":
        if shutil.which("winget"):
            _say("[..] Installing Node.js LTS via winget ...")
            _stream([
                "winget", "install", "-e", "--id", "OpenJS.NodeJS.LTS",
                "--accept-source-agreements", "--accept-package-agreements", "--silent",
            ])
        elif shutil.which("choco"):
            _stream(["choco", "install", "nodejs-lts", "-y"])
        else:
            _say("[!] Could not auto-install Node.js (no winget/choco).")
            return False
        # winget installs to a fixed location; make it visible to this process.
        for candidate in (r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs"):
            if Path(candidate, "node.exe").exists():
                os.environ["PATH"] = candidate + os.pathsep + os.environ.get("PATH", "")
                break
        return bool(shutil.which("node"))
    if osname == "macos":
        if shutil.which("brew"):
            _say("[..] Installing Node.js via Homebrew ...")
            return _stream(["brew", "install", "node"]) == 0
        _say("[!] Homebrew not found. Install it (https://brew.sh) or Node.js 18+ manually.")
        return False
    # linux
    sudo = [] if os.geteuid() == 0 else (["sudo"] if shutil.which("sudo") else [])
    if shutil.which("apt-get"):
        _stream([*sudo, "apt-get", "update", "-y"])
        return _stream([*sudo, "apt-get", "install", "-y", "nodejs", "npm"]) == 0
    if shutil.which("dnf"):
        return _stream([*sudo, "dnf", "install", "-y", "nodejs", "npm"]) == 0
    if shutil.which("pacman"):
        return _stream([*sudo, "pacman", "-S", "--noconfirm", "nodejs", "npm"]) == 0
    _say("[!] No supported package manager found. Install Node.js 18+ manually.")
    return False


def ensure_node_runtime(install: bool = True) -> bool:
    min_major = int(load_config().get("node", {}).get("min_version", 18))
    have = _major(node_version())
    if have >= min_major and npm_version():
        _say(f"[OK] Node {node_version()} / npm {npm_version()}.")
        return True
    if not install:
        _say("[!] Node.js/npm missing or too old.")
        return False
    if not _install_node():
        _say("[!] Node.js install failed. Install Node.js 18+ from nodejs.org and re-run.")
        return False
    have = _major(node_version())
    if have >= min_major:
        _say(f"[OK] Node {node_version()} / npm {npm_version()} installed.")
        return True
    _say("[!] Node installed but not visible yet. Close this window and re-run.")
    return False


# --------------------------------------------------------------------------- #
# dependencies
# --------------------------------------------------------------------------- #
def ensure_venv(force: bool = False) -> bool:
    if venv_python() and not force:
        return True
    _say("[..] Creating virtual environment (.venv) ...")
    rc = _stream([sys.executable, "-m", "venv", str(venv_dir())])
    if rc != 0 or not venv_python():
        _say("[!] venv creation failed. Ensure the 'venv' module is available (python3-venv).")
        return False
    _say("[OK] .venv created.")
    return True


def ensure_python_deps(force: bool = False) -> bool:
    req = project_root() / "backend" / "requirements.txt"
    if not req.exists():
        _say("[!] backend/requirements.txt not found.")
        return False
    sig = f"{_sha(req)}|py{sys.version_info.major}.{sys.version_info.minor}"
    if venv_python() and not force and _up_to_date("python", sig):
        return True
    if not venv_python():
        return False
    py = python_executable()
    _say("[..] Installing Python dependencies (first run can take a minute) ...")
    if _stream([py, "-m", "pip", "install", "--upgrade", "pip", "--quiet"]) != 0:
        _say("    (pip upgrade skipped)")
    rc = _stream([py, "-m", "pip", "install", "-r", str(req)])
    if rc != 0:
        _say("[!] pip install failed - see output above.")
        return False
    _write_stamp("python", sig)
    _say("[OK] Python dependencies ready.")
    return True


def ensure_node_deps(force: bool = False) -> bool:
    from launcher.config import npm_executable

    frontend = project_root() / "frontend"
    lock = frontend / "package-lock.json"
    pkg = frontend / "package.json"
    manifest = lock if lock.exists() else pkg
    if not manifest.exists():
        return True
    sig = _sha(manifest)
    modules = frontend / "node_modules"
    if modules.exists() and not force and _up_to_date("node", sig):
        return True
    _say("[..] Installing frontend dependencies (npm install) ...")
    rc = _stream([npm_executable(), "install", "--no-audit", "--no-fund"], cwd=frontend)
    if rc != 0:
        _say("[!] npm install failed - see output above.")
        return False
    _write_stamp("node", sig)
    _say("[OK] Frontend dependencies ready.")
    return True


def ensure_env_file(force: bool = False) -> bool:
    env = project_root() / "backend" / ".env"
    if env.exists() and not force:
        return True
    example = project_root() / "backend" / ".env.example"
    lines = [
        "# Auto-generated by launcher/bootstrap.py - safe to edit.",
        "ECOMIND_ENV=local",
        f"ECOMIND_SECRET_KEY={secrets.token_urlsafe(48)}",
    ]
    if example.exists():
        for raw in example.read_text(encoding="utf-8").splitlines():
            s = raw.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            key = s.split("=", 1)[0].strip()
            if key in {"ECOMIND_ENV", "ECOMIND_SECRET_KEY"}:
                continue
            lines.append(s)
    env.write_text("\n".join(lines) + "\n", encoding="utf-8")
    _say("[OK] Created backend/.env (generated secret key).")
    return True


def ensure_db(force: bool = False) -> bool:
    cfg = load_config()
    db = project_root() / cfg["paths"]["database_file"]
    if db.exists() and not force:
        return True
    seed = project_root() / cfg["paths"]["seed_script"]
    if not seed.exists():
        _say("[!] Seed script not found.")
        return False
    _say("[..] Creating database and sample datasets (this can take a moment) ...")
    log_file = project_root() / cfg["paths"]["logs_dir"] / "launcher.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    with open(log_file, "a", encoding="utf-8") as fh:
        rc = subprocess.run([python_executable(), str(seed)], cwd=str(project_root()),
                            stdout=fh, stderr=subprocess.STDOUT, timeout=900).returncode
    if rc == 0 and db.exists():
        _say("[OK] Database ready.")
        return True
    _say("[!] Seeding failed - see logs/launcher.log.")
    return False


# --------------------------------------------------------------------------- #
# orchestrator
# --------------------------------------------------------------------------- #
def ensure_all(install: bool = True, force: bool = False) -> bool:
    """Run every bootstrap step. Returns True when the app is ready to start."""
    cfg = load_config()
    auto = bool(cfg.get("startup", {}).get("auto_install", True))
    do_install = install and auto

    if force:
        _say("[..] Force install requested - rebuilding environments.\n")

    ok = True
    _say("\n== Runtime ==")
    ok &= ensure_python_runtime()
    ok &= ensure_node_runtime(install=do_install)

    _say("\n== Python environment ==")
    if ensure_venv(force=force):
        ok &= ensure_python_deps(force=force)
    else:
        ok = False

    _say("\n== Frontend environment ==")
    ok &= ensure_node_deps(force=force)

    _say("\n== Configuration & data ==")
    ensure_env_file(force=False)
    if ok:
        ok &= ensure_db(force=False)
    else:
        _say("[!] Skipping data seed until dependencies install cleanly.")

    return bool(ok)
