"""Logging to console + logs/launcher.log."""
from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path

from launcher.config import load_config

_configured = False


def get_logger(name: str = "launcher") -> logging.Logger:
    global _configured
    if not _configured:
        cfg = load_config()
        logs_dir = Path(cfg.get("__root", ".")) / cfg["paths"]["logs_dir"]
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / "launcher.log"

        logger = logging.getLogger("ecomind-launcher")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            fh = logging.FileHandler(log_path, encoding="utf-8")
            fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
            logger.addHandler(fh)
            sh = logging.StreamHandler(sys.stdout)
            sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
            logger.addHandler(sh)
        _configured = True
    return logging.getLogger("ecomind-launcher")