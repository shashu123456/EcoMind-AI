"""
Tests for the anomaly detector's reachability.

These exist because the product showed `critical: 0` with no explanation, which
reads as a broken detector rather than as a calibration fact. The tests pin what
the detector can and cannot emit, so the explanation published in the stage
output cannot silently drift away from the code that produces it.

Nothing here asserts that the current calibration is *right* -- that is a model
decision. These assert that it is *stated*, and that the known-unreachable
classes are declared rather than left to look like zeros.
"""

from app.domain.anomaly_service import (
    SEVERITY_BANDS,
    Z_SATURATE,
    _severity,
    _z_for,
)


def test_severity_bands_are_ordered_highest_first():
    floors = [floor for floor, _ in SEVERITY_BANDS]
    assert floors == sorted(floors, reverse=True)


def test_critical_requires_a_nine_sigma_deviation():
    """The headline finding: critical is not a near-miss, it is a 9-sigma event."""
    floor, name = SEVERITY_BANDS[0]
    assert name == "critical"
    assert floor == 0.90
    # A score is a fraction of Z_SATURATE, so 0.90 of 10 is 9 sigma.
    assert floor * Z_SATURATE == 9.0


def test_severity_boundaries_are_inclusive_at_the_floor():
    assert _severity(0.90) == "critical"
    assert _severity(0.8999) == "high"
    assert _severity(0.75) == "high"
    assert _severity(0.60) == "moderate"
    assert _severity(0.59) == "low"
    assert _severity(0.0) == "low"


def test_detection_floor_is_expressed_in_sigma():
    # A configured threshold of 0.6 means six sigma.
    assert _z_for(0.6) == 6.0
    # The mapping is clamped, so a nonsense threshold cannot exceed saturation.
    assert _z_for(5.0) == Z_SATURATE
    assert _z_for(-1.0) == 0.0


def test_every_band_is_above_the_detection_floor():
    """Otherwise the lowest band could be configured into existence and vanish."""
    detection = _z_for(0.6)
    assert min(floor * Z_SATURATE for floor, _ in SEVERITY_BANDS) >= detection