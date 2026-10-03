"""Central configuration loader for the launcher system.

All configurable values live in a single file: launcher/config.json.
Edit that file only - everything else reads from it.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

LAUNCHER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = LAUNCHER_DIR.parent
CONFIG_PATH = LAUNCHER_DIR / "config.json"

_cache: dict | None = None


def load_config() -> dict:
    global _cache
    if _cache is None:
        if not CONFIG_PATH.exists():
            sys.exit(f"Config not found: {CONFIG_PATH}")
        _cache = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        _cache["__root"] = str(PROJECT_ROOT)
    return _cache


def project_root() -> Path:
    return PROJECT_ROOT


def venv_dir() -> Path:
    cfg = load_config()
    return PROJECT_ROOT / cfg.get("python", {}).get("venv_dir", ".venv")


def venv_python() -> Path | None:
    """Path to the venv interpreter, or None if the venv does not exist yet."""
    d = venv_dir()
    p = d / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    return p if p.exists() else None


def python_executable() -> str:
    cfg = load_config()
    if cfg.get("python", {}).get("use_venv", True):
        p = venv_python()
        if p:
            return str(p)
    return sys.executable or "python"


def npm_executable() -> str:
    """Return the correct npm shim for this OS (npm.cmd on Windows)."""
    if os.name == "nt":
        return shutil.which("npm.cmd") or shutil.which("npm") or "npm.cmd"
    return shutil.which("npm") or "npm"


def resolve_path(raw: str) -> Path:
    cfg = load_config()
    root = Path(cfg.get("__root", str(PROJECT_ROOT)))
    p = Path(raw)
    if not p.is_absolute():
        p = root / p
    return p