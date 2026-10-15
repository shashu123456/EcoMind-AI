"""Rebuild the 19ba4a66 forecast snapshot so the rolling revalidation test can
check it against the freshly-recovered hourly series.

Run:  python scripts/recompute_19ba4a66.py
"""
from __future__ import annotations

import os
import sys
import json
import sqlite3

sys.path.insert(0, os.path.abspath(os.path.join(__file__, "..", "backend")))

from app.core.config import settings
from app.domain.forecast_service import forecast
from app.db.base import SessionLocal

WIN = "19ba4a66-8ea1-4339-a2b9-9fdc7286fe17"

if __name__ == "__main__":
    db = SessionLocal()
    try:
        for _ in range(3):
            forecast(db, WIN)
    finally:
        db.close()
    print("19ba4a66 recompute complete.")
