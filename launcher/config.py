"""Central configuration loader for the launcher system.

All configurable values live in a single file: launcher/config.json.
Edit that file only - everything else reads from it.
"""
from __future__ import annotations

import json
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


def python_executable() -> str:
    cfg = load_config()
    if cfg.get("python", {}).get("use_venv", True):
        venv = PROJECT_ROOT / cfg["python"].get("venv_dir", ".venv") / "Scripts" / "python.exe"
        if venv.exists():
            return str(venv)
    return sys.executable if sys.executable and "python" in sys.executable.lower() else "python"


def resolve_path(raw: str) -> Path:
    cfg = load_config()
    root = Path(cfg.get("__root", str(PROJECT_ROOT)))
    p = Path(raw)
    if not p.is_absolute():
        p = root / p
    return p