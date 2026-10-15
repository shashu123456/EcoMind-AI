"""Building → Floor → Room → Device hierarchy.

Every analytics screen in the platform resolves its drill-down path through
this module, so the join order and the granularity rules live in one place.

Granularity
-----------
``asset``
    Building › Floor › Room › Device. Full drill-down. Used by the synthetic
    campus datasets.

``meter``
    Building › Meter. Real open-source data (BDG2) meters whole buildings and
    has no room-level instrumentation. Floor count is known real metadata, so
    per-floor normalisation is legitimate; rooms and devices are **not**
    invented to fill a panel.

Model imports are deferred so this module can be imported before the schema
exists during a fresh build.
"""

from __future__ import annotations

GRANULARITY_ASSET = "asset"
GRANULARITY_METER = "meter"
GRANULARITIES = (GRANULARITY_ASSET, GRANULARITY_METER)

# Ordered from the outside in. The UI uses this to render breadcrumbs and to
# know which drill levels exist for a dataset.
HIERARCHY_LEVELS_ASSET = ("building_code", "floor_no", "room_code", "device_code")
HIERARCHY_LEVELS_METER = ("building_code", "device_code")

# Which levels each granularity can actually resolve to.
LEVELS_BY_GRANULARITY = {
    GRANULARITY_ASSET: HIERARCHY_LEVELS_ASSET,
    GRANULARITY_METER: HIERARCHY_LEVELS_METER,
}

# Human labels for each level, used in breadcrumbs and table headers.
LEVEL_LABELS = {
    "building_code": "Building",
    "floor_no": "Floor",
    "room_code": "Room",
    "device_code": "Appliance",
}

# Categories that represent measurement points rather than loads. A meter
# reports a total; it does not consume power in its own right.
METER_CATEGORY = "meter"

DEVICE_CATEGORIES = (
    "meter",
    "hvac",
    "lighting",
    "chiller",
    "generator",
    "server",
    "ups",
    "pump",
    "elevator",
    "plug_load",
    "solar",
    "cctv",
    "coffee_machine",
)

# Devices whose failure or overuse is worth a maintenance action.
CRITICAL_DEVICE_CATEGORIES = ("generator", "chiller", "hvac", "ups", "pump", "server")


#: Canonical identity columns, in drill order. Every analytics screen reads its
#: estate context through these names.
CANONICAL_IDENTITY = (
    "building_code",
    "floor_no",
    "room_code",
    "device_code",
    "device_category",
    "device_name",
)

# Which column names each export actually uses for a canonical concept, most
# preferred first. Resolution is a rename of a column that already exists in the
# uploaded file: it is never a value this platform invents to fill a panel, so a
# dataset that genuinely records no floor still reports no floor.
IDENTITY_ALIASES: dict[str, tuple[str, ...]] = {
    "building_code": ("building_code", "building_id", "building", "site_id", "site_code", "site"),
    "floor_no": ("floor_no", "floor_code", "floor_id", "floor", "level", "storey"),
    "room_code": ("room_code", "room_id", "room_name", "room", "zone_code", "zone"),
    "device_code": ("device_code", "device_id", "meter_code", "meter_id", "asset_id"),
    "device_category": (
        "device_category",
        "device_type",
        "category",
        "equipment_type",
        "asset_type",
    ),
    # Deliberately excludes a bare `equipment` column: exported files use it for
    # both a display name and a numeric group code, and reading a group code as a
    # name prints "0" as an appliance. A name is only taken from a column that
    # says it holds one.
    "device_name": (
        "device_name",
        "device_label",
        "appliance",
        "equipment_name",
        "asset_name",
    ),
}


def resolve_identity_columns(columns) -> dict[str, str]:
    """Map each canonical identity name to the column this export uses for it.

    Returns only the concepts the file actually carries, so a caller can tell
    "this dataset has no room column" apart from "the room column was empty".
    """
    present = {str(c) for c in columns}
    out: dict[str, str] = {}
    for canonical in CANONICAL_IDENTITY:
        for alias in IDENTITY_ALIASES.get(canonical, ()):
            if alias in present:
                out[canonical] = alias
                break
    return out


def levels_for(granularity: str) -> tuple[str, ...]:
    """Resolvable hierarchy levels for a dataset granularity."""
    return LEVELS_BY_GRANULARITY.get(granularity, HIERARCHY_LEVELS_ASSET)


def supports_rooms(granularity: str) -> bool:
    return granularity == GRANULARITY_ASSET


def supports_floors(granularity: str) -> bool:
    # Both granularities carry floor metadata: asset datasets natively, meter
    # datasets via the real number_of_floors field.
    return True


#: Canonical display labels. A device with no recognised category still has to
#: render as something, so unknown categories fall back to a tidied version of
#: the key rather than to a blank or a crash.
DEVICE_LABELS = {
    "meter": "Energy Meter",
    "hvac": "HVAC",
    "lighting": "Lighting",
    "chiller": "Chiller",
    "generator": "Generator",
    "server": "Server",
    "ups": "UPS",
    "pump": "Water Pump",
    "elevator": "Elevator",
    "plug_load": "Plug Load",
    "solar": "Solar Inverter",
    "cctv": "CCTV",
    "coffee_machine": "Coffee Machine",
}


def device_label(category: str | None, fallback: str | None = None) -> str:
    """Display label for a device category.

    `category` is None or unrecognised often enough to matter — a flat
    electricity dataset has no device taxonomy at all, and a meter row can carry
    an empty category. Both used to raise, which took down the anomaly page and
    the hierarchy picker for a whole dataset over a missing string.
    """
    if isinstance(category, bytes):
        category = category.decode("utf-8", "replace")
    if not isinstance(category, str) or not category.strip():
        return fallback or "Unclassified"
    if category in DEVICE_LABELS:
        return DEVICE_LABELS[category]
    return category.replace("_", " ").strip().title() or (fallback or "Unclassified")


def is_meter(category: str | None) -> bool:
    return category == METER_CATEGORY


def is_critical(category: str | None) -> bool:
    return category in CRITICAL_DEVICE_CATEGORIES


def breadcrumb(parts: dict) -> list[dict]:
    """Build a breadcrumb trail from a hierarchy filter dict.

    Only includes levels that actually carry a value, so a meter dataset
    renders ``Building › Meter`` rather than an empty ``Floor`` step.
    """
    trail: list[dict] = []
    for level in HIERARCHY_LEVELS_ASSET:
        value = parts.get(level)
        if value in (None, "", []):
            continue
        if isinstance(value, (list, tuple)):
            if not value:
                continue
            value = value[0]
        trail.append({"level": level, "label": LEVEL_LABELS[level], "value": str(value)})
    return trail


def empty_filter() -> dict:
    """A filter with every level present and unconstrained."""
    return {level: None for level in HIERARCHY_LEVELS_ASSET}


def normalise_filter(raw: dict | None) -> dict:
    """Coerce user-supplied filters into a complete, well-typed filter dict."""
    out = empty_filter()
    if not raw:
        return out
    for level in HIERARCHY_LEVELS_ASSET:
        value = raw.get(level)
        if value in ("", "all", "All", "ALL"):
            value = None
        if level == "floor_no" and value is not None:
            try:
                value = int(value)
            except (TypeError, ValueError):
                value = None
        out[level] = value
    return out


def filter_is_empty(flt: dict) -> bool:
    return all(v in (None, "", []) for v in (flt or {}).values())


def active_levels(flt: dict) -> list[str]:
    """Levels currently constraining a query, outermost first."""
    out: list[str] = []
    for level in HIERARCHY_LEVELS_ASSET:
        value = (flt or {}).get(level)
        if value not in (None, "", []):
            out.append(level)
    return out


def drill_from(level: str, flt: dict) -> dict:
    """Return the filter for the next drill level below ``level``.

    Deeper values are cleared so drilling from Floor 2 does not retain a
    Room selected on Floor 3.
    """
    order = list(HIERARCHY_LEVELS_ASSET)
    if level not in order:
        return normalise_filter(flt)
    idx = order.index(level)
    out = normalise_filter(flt)
    for deeper in order[idx + 1 :]:
        out[deeper] = None
    return out


def levels_available(granularity: str) -> list[dict]:
    """UI descriptor for which drill panels to render."""
    avail = set(levels_for(granularity))
    out = []
    for level in HIERARCHY_LEVELS_ASSET:
        if level not in avail:
            continue
        out.append(
            {
                "level": level,
                "label": LEVEL_LABELS[level],
                "drillable": level != HIERARCHY_LEVELS_ASSET[-1],
            }
        )
    return out
