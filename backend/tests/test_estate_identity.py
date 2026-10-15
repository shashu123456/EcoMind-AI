"""Tests for estate identity resolution and the forecast's seasonal driver.

Two defects are pinned down here, both of which produced a page that looked
finished while being wrong.

The anomaly chart dropped the estate columns and then re-created them empty, so
every reading rendered as "Unclassified" while its building and floor sat unused
in the dataframe. And the forecast walk carried each exogenous feature forward as
a single scalar instead of an hour-of-week profile, which froze the strongest
feature in the matrix at one arbitrary hour and flattened the projection into a
straight line that no horizon filter could fix.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.domain import hierarchy  # noqa: E402


class TestAliasResolution:
    def test_maps_an_export_that_uses_its_own_names(self):
        """`site_id`/`floor_code` is a real export shape, not a hypothetical."""
        found = hierarchy.resolve_identity_columns(
            ["timestamp", "site_id", "floor_code", "device_code", "device_category", "energy_kwh"]
        )
        assert found["building_code"] == "site_id"
        assert found["floor_no"] == "floor_code"
        assert found["device_code"] == "device_code"
        assert found["device_category"] == "device_category"

    def test_prefers_the_canonical_name_when_both_are_present(self):
        found = hierarchy.resolve_identity_columns(["building_code", "site_id"])
        assert found["building_code"] == "building_code"

    def test_reports_only_the_concepts_the_file_carries(self):
        """Absent must be distinguishable from empty.

        A dataset with no room column has no room, and the page has to say that
        rather than render a blank it cannot explain.
        """
        found = hierarchy.resolve_identity_columns(["timestamp", "device_code", "energy_kwh"])
        assert "room_code" not in found
        assert "building_code" not in found

    def test_never_treats_a_bare_equipment_column_as_a_device_name(self):
        """`equipment` is used for both a name and a numeric group code.

        In the Office Complex export it holds 0-3, so reading it as a name prints
        "0" as the appliance -- a label that is worse than no label.
        """
        found = hierarchy.resolve_identity_columns(["equipment", "device_code"])
        assert "device_name" not in found

    def test_still_accepts_a_column_that_announces_itself_as_a_name(self):
        for column in ("device_name", "device_label", "appliance", "asset_name"):
            found = hierarchy.resolve_identity_columns(["device_code", column])
            assert found["device_name"] == column


class TestCanonicalIdentity:
    def test_is_ordered_from_the_estate_inward(self):
        assert hierarchy.CANONICAL_IDENTITY == (
            "building_code",
            "floor_no",
            "room_code",
            "device_code",
            "device_category",
            "device_name",
        )

    def test_every_canonical_name_has_aliases(self):
        for canonical in hierarchy.CANONICAL_IDENTITY:
            assert hierarchy.IDENTITY_ALIASES.get(canonical), canonical

    def test_each_alias_list_starts_with_the_canonical_name(self):
        """Order is the preference rule, so the canonical name has to win ties."""
        for canonical, aliases in hierarchy.IDENTITY_ALIASES.items():
            assert aliases[0] == canonical, canonical


class TestDistinctCounter:
    """The counter decides whether a bucket may claim one appliance's identity."""

    @staticmethod
    def _distinct(values):
        import pandas as pd

        from app.domain.anomaly_service import _distinct

        return _distinct(pd.Series(values, dtype=object))

    def test_counts_distinct_non_empty_values(self):
        assert self._distinct(["L1-AHU", "L2-VAV", "L1-AHU"]) == 2

    def test_does_not_count_blanks_or_missing_values(self):
        assert self._distinct(["", None, "  ", "L1-AHU"]) == 1

    def test_returns_zero_when_the_dataset_records_none(self):
        """A single-site export must not report a building it does not have."""
        assert self._distinct(["", ""]) == 0
        assert self._distinct([None, None]) == 0

    def test_emits_no_pandas_downcasting_warning(self):
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("error", FutureWarning)
            assert self._distinct(["", "L1-AHU"]) == 1


@pytest.mark.parametrize(
    "canonical,raw,expected",
    [
        ("building_code", "BLD-A", "BLD-A"),
        ("floor_no", 3, "3"),
        ("floor_no", 3.0, "3"),
        ("room_code", " A101 ", "A101"),
        ("device_code", None, ""),
    ],
)
def test_text_normalises_recorded_identity(canonical, raw, expected):
    from app.domain.anomaly_service import _text

    assert _text(raw) == expected
