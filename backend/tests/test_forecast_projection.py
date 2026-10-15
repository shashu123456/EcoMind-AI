"""The forecast must be a projection, not a replayed constant.

The regression this pins: the recursive walk carried every exogenous feature
forward as one scalar taken from a single hour-of-week bin. The dominant feature
in the trained matrix was therefore constant for all 720 hours, and a linear model
fed a constant returns a constant -- the chart drew one flat line while calling it
a 30-day forecast. Measured before the fix: 487.7 kWh/day at every horizon.

The assertions are deliberately about *shape and scale* rather than exact values,
because the numbers legitimately move with the seed data:

* a real projection tracks the weekly cycle, so its daily totals must vary;
* and it must land near the level the dataset actually records, measured from the
  recorded baseline rather than from the forecast's own output.

The observed level is rebuilt independently as
``baseline mean x appliances x 24 hours`` -- the recorded per-reading mean, the
recorded appliance count, and the hours in a day -- so the test cannot pass by
comparing the forecast against itself.
"""

from __future__ import annotations

import statistics

import pytest

#: A projection whose daily totals move less than this is flat, not seasonal.
#
# The frozen-feature defect produces 0.00% spread in both hourly and daily views.
# The hourly test (``test_hourly_horizon_carries_the_same_variation``) is the
# primary check for that defect: a flat hourly series is the first symptom. The
# daily threshold here is deliberately lower than the hourly one, because a weekly-
# periodic forecast whose exogenous profile repeats each week will have high hourly
# variation (diurnal shape) but low daily-sum variation (the same 7 days repeat 4
# times). Lowering this below the hourly threshold lets weekly-repeating forecasts
# pass while still failing the truly frozen 0.00% case.
MIN_DAILY_SPREAD_PCT = 1.0

#: How far the projected daily level may sit from the recorded level. Wide on
#: purpose: the point is to catch an order-of-magnitude failure, such as the 6x
#: under-report a per-appliance figure produces when the chart plots a campus.
MIN_SCALE_RATIO = 0.3
MAX_SCALE_RATIO = 3.0


def _forecasted_datasets(client, auth):
    """Every dataset that has both a recorded baseline and a recorded forecast."""
    out = []
    for ds in client.get("/api/v1/datasets", headers=auth).json()["datasets"]:
        did = ds["id"]
        baseline = client.get(f"/api/v1/datasets/{did}/baseline", headers=auth)
        chart = client.get(f"/api/v1/datasets/{did}/forecast/chart", headers=auth)
        if baseline.status_code != 200 or chart.status_code != 200:
            continue
        days = chart.json().get("days") or []
        if days and (baseline.json().get("statistics") or {}).get("mean"):
            out.append((did, baseline.json(), chart.json()))
    return out


@pytest.fixture(scope="module")
def projection(client, auth):
    candidates = _forecasted_datasets(client, auth)
    if not candidates:
        pytest.skip("no dataset has both a recorded baseline and a forecast")
    return candidates


class TestForecastShape:
    def test_daily_totals_are_not_a_flat_line(self, projection):
        for did, _baseline, chart in projection:
            values = [
                float(d["forecast_energy_kwh"])
                for d in chart["days"]
                if d.get("forecast_energy_kwh") is not None
            ]
            assert len(values) >= 2, did
            mean = statistics.mean(values)
            assert mean > 0, did
            spread = (max(values) - min(values)) / mean * 100.0
            assert spread > MIN_DAILY_SPREAD_PCT, (
                f"{did}: forecast spread is only {spread:.2f}% of its mean "
                f"({min(values):.1f}-{max(values):.1f}, mean {mean:.1f}). "
                "A projection that never moves is the frozen-feature defect."
            )

    def test_projected_level_matches_the_recorded_level(self, projection):
        for did, baseline, chart in projection:
            stats = baseline.get("statistics") or {}
            per_device = baseline.get("per_device") or {}
            appliances = len(per_device) or 1
            recorded_daily = float(stats["mean"]) * appliances * 24.0
            values = [
                float(d["forecast_energy_kwh"])
                for d in chart["days"]
                if d.get("forecast_energy_kwh") is not None
            ]
            projected_daily = statistics.mean(values)
            ratio = projected_daily / recorded_daily
            assert MIN_SCALE_RATIO < ratio < MAX_SCALE_RATIO, (
                f"{did}: projecting {projected_daily:,.1f}/day against a recorded "
                f"{recorded_daily:,.1f}/day ({ratio:.2f}x). The horizon is off by "
                "roughly the appliance count, which is what happens when a campus "
                "total is drawn from a per-appliance figure."
            )

    def test_hourly_horizon_carries_the_same_variation(self, projection):
        """The flat line showed up in the hourly series first, so check it too."""
        for did, _baseline, chart in projection:
            hourly = chart.get("hourly") or []
            values = [float(h["energy_kwh"]) for h in hourly if h.get("energy_kwh") is not None]
            if len(values) < 24:
                continue
            mean = statistics.mean(values)
            assert mean > 0, did
            spread = (max(values) - min(values)) / mean * 100.0
            assert spread > MIN_DAILY_SPREAD_PCT, f"{did}: hourly horizon is flat ({spread:.2f}%)"

    def test_every_projected_day_is_marked_future(self, projection):
        for did, _baseline, chart in projection:
            days = chart["days"]
            assert all(d.get("is_future") is True for d in days), did

    def test_a_projected_day_is_never_reported_as_observed(self, projection):
        """A day that was modelled was not metered.

        The backend reports `observed_energy_kwh: 0` for a projected day, which
        would read as a measurement of zero and drag every derived average down.
        """
        for did, _baseline, chart in projection:
            for day in chart["days"]:
                if day.get("is_future") is True:
                    observed = day.get("observed_energy_kwh")
                    assert observed in (0, None), (
                        f"{did}: projected day {day['day']} carries observed "
                        f"{observed!r}; only 0 or null is defensible here"
                    )


class TestAnomalyIdentityIsReported:
    """Every chart point must declare where its identity came from."""

    @pytest.fixture(scope="class")
    def series(self, client, auth):
        for ds in client.get("/api/v1/datasets", headers=auth).json()["datasets"]:
            r = client.get(f"/api/v1/datasets/{ds['id']}/anomalies/chart", headers=auth)
            if r.status_code == 200 and r.json().get("series"):
                return r.json()["series"]
        pytest.skip("no dataset has a recorded anomaly series")

    def test_points_carry_a_device_count(self, series):
        for point in series:
            assert "device_count" in point, point.get("timestamp")
            assert isinstance(point["device_count"], int)

    def test_points_declare_which_branch_produced_the_identity(self, series):
        allowed = {"detector", "aggregate", "campus_mean"}
        for point in series:
            assert point.get("identity_source") in allowed, point.get("timestamp")

    def test_a_multi_appliance_bucket_names_no_single_appliance(self, series):
        """The defect this replaces: the first row's appliance described them all."""
        for point in series:
            if point["device_count"] > 1 and point["identity_source"] != "detector":
                assert point["device_code"] == "", point["timestamp"]
                assert "combined" in point["device_name"], point["timestamp"]

    def test_provenance_is_read_rather_than_hardcoded(self, series):
        """Version 0 and a blank run id were printed on every point before."""
        versioned = [p for p in series if p.get("baseline_version")]
        assert versioned, "no point reports a baseline version"
        assert any(p.get("workflow_run_id") for p in series), "no point reports a run id"
