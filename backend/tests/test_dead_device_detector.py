"""Tests for the dead-device detector.

`equipment_failure` sat in the taxonomy for months and could never be produced.
The reason was structural, not a tuning mistake: the overuse scanner flags the
upper tail (`_z >= threshold`), and a meter that has stopped is far *below* its
own baseline. No threshold makes that appear.

These tests prove the replacement actually fires, which is the point -- a
detector nobody has seen produce a finding is exactly the failure being fixed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domain.anomaly_service import (  # noqa: E402
    DEAD_MIN_EXPECTED_KWH,
    DEAD_MIN_HOURS,
    DEAD_RATIO,
    _build_baseline,
    _scan_dead_devices,
    _is_dead,
)


def readings(values: list[float]) -> pd.DataFrame:
    """A single device's hourly series, starting on a Monday 00:00."""
    stamps = pd.date_range("2026-01-05 00:00", periods=len(values), freq="h")
    return pd.DataFrame(
        {
            "device_code": "MTR-A101",
            "device_category": "meter",
            "building_code": "BLD-A",
            "floor_no": "1",
            "room_code": "A101",
            "timestamp": stamps,
            "_value": values,
        }
    )


def based(values: list[float]) -> pd.DataFrame:
    return _build_baseline(readings(values))


class TestDeadMask:
    def test_flags_a_flatlined_device(self):
        # 30 readings drawing something real, then 10 at essentially nothing.
        values = [5.0] * 30 + [0.0] * 10
        mask = _is_dead(based(values))
        assert bool(mask.iloc[35])   # inside the outage
        assert not bool(mask.iloc[5])  # before it

    def test_ignores_a_device_merely_running_below_baseline(self):
        # 20% under is efficiency, and the module refuses to call it a fault.
        values = [4.0] * 30
        block = based(values)
        mask = _is_dead(block)
        assert mask.iloc[-1] < DEAD_RATIO

    def test_ignores_a_device_baselined_at_nothing(self):
        # A tiny load reading zero is working exactly as expected.
        values = [0.001] * 40
        block = based(values)
        assert not _is_dead(block).any()
        assert DEAD_MIN_EXPECTED_KWH > 0.001


class TestDetectorFires:
    def test_reports_a_stopped_meter_as_equipment_failure(self):
        values = [5.0] * 40 + [0.0] * 12
        found = _scan_dead_devices(readings(values), "energy_kwh")
        assert found, "a meter flatlined for 12 hours must be reported"
        assert found[0]["anomaly_class"] == "equipment_failure"

    def test_the_finding_carries_no_waste(self):
        # Nothing is being wasted here, so claiming an excess would make the
        # waste arithmetic on the page stop meaning what it says.
        values = [5.0] * 40 + [0.0] * 12
        found = _scan_dead_devices(readings(values), "energy_kwh")
        assert found[0]["excess_kwh"] == 0.0
        assert found[0]["excess_cost"] == 0.0
        assert found[0]["excess_co2_kg"] == 0.0

    def test_the_finding_still_states_how_much_monitoring_was_lost(self):
        values = [5.0] * 40 + [0.0] * 12
        found = _scan_dead_devices(readings(values), "energy_kwh")
        assert found[0]["expected_kwh"] > 0
        assert "expected" in found[0]["evidence"].lower()

    def test_names_the_device(self):
        values = [5.0] * 40 + [0.0] * 12
        found = _scan_dead_devices(readings(values), "energy_kwh")
        assert found[0]["device_code"] == "MTR-A101"

    def test_readings_are_counted(self):
        values = [5.0] * 40 + [0.0] * 12
        found = _scan_dead_devices(readings(values), "energy_kwh")
        assert found[0]["readings"] == 12


class TestDetectorStaysQuiet:
    def test_a_short_outage_is_not_a_fault(self):
        # Three hours is a scheduled shutdown, not a failed asset.
        values = [5.0] * 40 + [0.0] * 3
        assert _scan_dead_devices(readings(values), "energy_kwh") == []

    def test_a_healthy_device_produces_nothing(self):
        assert _scan_dead_devices(readings([5.0] * 50), "energy_kwh") == []

    def test_an_overconsuming_device_is_not_reported_as_dead(self):
        # The dead detector must not double-report the overuse scan's work.
        values = [5.0] * 20 + [40.0] * 20
        assert _scan_dead_devices(readings(values), "energy_kwh") == []

    def test_an_empty_block_is_handled(self):
        assert _scan_dead_devices(readings([]), "energy_kwh") == []

    @pytest.mark.parametrize("hours", [DEAD_MIN_HOURS - 1, DEAD_MIN_HOURS, DEAD_MIN_HOURS + 1])
    def test_the_sustain_threshold_is_the_documented_one(self, hours):
        values = [5.0] * 40 + [0.0] * hours
        found = _scan_dead_devices(readings(values), "energy_kwh")
        assert bool(found) is (hours >= DEAD_MIN_HOURS)


class TestDetectorIsSeparateFromOveruse:
    """
    The reason this is a second pass rather than a lower z threshold.
    """

    def test_a_device_below_baseline_is_not_flagged_by_either(self):
        # 20% under, sustained. Neither an anomaly nor a fault, by design.
        values = [4.0] * 50
        assert _scan_dead_devices(readings(values), "energy_kwh") == []
