"""An empty series must never win a horizon on recency alone.

A build shipped 30-day forecast rows with ``points == []`` and a plausible total
beside them. ``latest_row`` decided by timestamp, so those rows were the newest
thing for that horizon forever: the prediction page rendered "No points in this
horizon" underneath "457 kWh projected", and regenerating could not help,
because a new row is only newer — the page still read the empty one first.

These tests pin the two halves of the fix: a row without a series is not a
candidate, and a horizon that has only such rows reads as missing rather than as
a forecast with nothing in it.
"""

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Dataset, Forecast
from app.domain import forecast_service


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _dataset(db, name: str) -> Dataset:
    ds = Dataset(name=name)
    db.add(ds)
    db.commit()
    return ds


def _forecast(db, ds: Dataset, horizon: str, points, generated_at: datetime) -> Forecast:
    row = Forecast(
        dataset_id=ds.id,
        tier="short",
        horizon=horizon,
        points=points,
        generated_at=generated_at,
    )
    db.add(row)
    db.commit()
    return row


REAL_POINT = {"timestamp": "2026-01-01T00:00:00", "energy_kwh": 12.5}


def test_empty_row_does_not_shadow_a_real_forecast(db):
    ds = _dataset(db, "campus with history")
    real = _forecast(db, ds, "30d", [REAL_POINT], datetime(2026, 1, 1))
    _forecast(db, ds, "30d", [], datetime(2026, 2, 1))

    found = forecast_service.latest_row(db, ds.id, "30d")

    assert found is not None, "a real forecast existed and was skipped"
    assert found.id == real.id


def test_horizon_with_only_empty_rows_reads_as_missing(db):
    ds = _dataset(db, "campus without a series")
    _forecast(db, ds, "30d", [], datetime(2026, 2, 1))

    assert forecast_service.latest_row(db, ds.id, "30d") is None


def test_newest_real_row_still_wins(db):
    ds = _dataset(db, "campus regenerated")
    _forecast(db, ds, "30d", [REAL_POINT], datetime(2026, 1, 1))
    newer = _forecast(db, ds, "30d", [REAL_POINT], datetime(2026, 2, 1))

    found = forecast_service.latest_row(db, ds.id, "30d")

    assert found is not None and found.id == newer.id
