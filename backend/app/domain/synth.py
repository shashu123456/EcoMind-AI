"""Deterministic synthetic campus datasets.

Two estates are generated from the same schema so the platform can be shown
on clean data and on broken data without either one being a toy:

``healthy``
    A realistic quarter of hourly readings with only a handful of subtle
    outliers, a light scattering of missing sensor cells and a few repeated
    rows. The quality and anomaly stages should mostly return green.

``faulty``
    The same estate with power spikes, night-time waste, a failed HVAC zone,
    sensor dropouts, voltage sag, occupancy/load mismatches and stuck meters
    injected on purpose. The stages should have plenty to find.

Anomalies are injected into the frame, never labelled. The anomaly stage has
to earn the finding from the data alone, which is the only way the screen can
be honest.

Everything is seeded, so the same estate on every machine and every run.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from app.core.config import settings
from app.domain.hierarchy import CRITICAL_DEVICE_CATEGORIES, METER_CATEGORY

SEED = 42
HOURS_PER_DAY = 24
START = datetime(2025, 1, 1)

#: The two-building estate. Kept deliberately small on buildings and wide on
#: rooms so the drill-down has depth without exploding into noise.
BUILDINGS = [
    {
        "code": "BLD-A",
        "name": "Riverside Office",
        "building_type": "office",
        "gross_area_sqm": 8400.0,
        "commissioned_year": 2015,
        "floors": 3,
        "rooms_per_floor": 4,
        "occupancy_capacity": 180,
        "base_kw": 260.0,
    },
    {
        "code": "BLD-B",
        "name": "Northgate Labs",
        "building_type": "laboratory",
        "gross_area_sqm": 5200.0,
        "commissioned_year": 2019,
        "floors": 3,
        "rooms_per_floor": 4,
        "occupancy_capacity": 90,
        "base_kw": 340.0,
    },
]

FLOOR_LABELS = ["Ground", "First", "Second"]

#: One measurement point plus the room loads. The meter carries the whole room.
ROOM_DEVICES = [
    ("MTR-{room}", "meter", "Room Meter"),
    ("HVAC-{room}", "hvac", "Rooftop AHU"),
    ("LGT-{room}", "lighting", "Lighting Circuit"),
    ("PC-{room}", "plug_load", "Workstation Bank"),
]

#: Building-level plant, gathered into each building's plant room.
PLANT_DEVICES = [
    ("PV-{code}", "solar", "Rooftop PV Array"),
    ("GEN-{code}", "generator", "Standby Generator"),
    ("LFT-{code}", "elevator", "Passenger Lift"),
]

LOAD_SHARE = {
    "meter": 1.0,
    "hvac": 0.50,
    "lighting": 0.15,
    "plug_load": 0.25,
    "solar": 0.35,
    "generator": 0.0,
    "elevator": 0.06,
}

CURVE_OFFICE = [
    0.34, 0.31, 0.30, 0.30, 0.32, 0.38, 0.52, 0.74, 0.95, 1.08, 1.12, 1.10,
    1.06, 1.09, 1.11, 1.05, 0.92, 0.74, 0.62, 0.56, 0.50, 0.45, 0.41, 0.37,
]
CURVE_LAB = [
    0.62, 0.60, 0.58, 0.58, 0.60, 0.66, 0.78, 0.88, 0.98, 1.06, 1.10, 1.08,
    1.02, 1.08, 1.10, 1.04, 0.96, 0.88, 0.80, 0.74, 0.70, 0.68, 0.66, 0.64,
]


def _curve(building_type: str, hour: int) -> float:
    return CURVE_LAB[hour] if building_type == "laboratory" else CURVE_OFFICE[hour]


def _estate() -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict]]:
    """Build the four hierarchy tables plus the flat device list."""
    buildings, floors, rooms, devices, flat = [], [], [], [], []
    for b in BUILDINGS:
        code = b["code"]
        tag = code[-1]
        buildings.append(
            {
                "building_code": code,
                "name": b["name"],
                "building_type": b["building_type"],
                "gross_area_sqm": b["gross_area_sqm"],
                "commissioned_year": b["commissioned_year"],
                "rated_kw": b["base_kw"],
            }
        )
        room_area = b["gross_area_sqm"] / b["floors"] / b["rooms_per_floor"]
        for floor_index in range(b["floors"]):
            floor_no = floor_index + 1
            floors.append(
                {
                    "building_code": code,
                    "floor_no": floor_no,
                    "label": FLOOR_LABELS[floor_index],
                    "floor_type": "open_plan" if floor_index else "lobby",
                    "area_sqm": room_area * b["rooms_per_floor"],
                }
            )
            for r in range(1, b["rooms_per_floor"] + 1):
                room_code = f"{tag}{floor_no}{r:02d}"
                rooms.append(
                    {
                        "building_code": code,
                        "floor_no": floor_no,
                        "room_code": room_code,
                        "name": f"Zone {room_code}",
                        "room_type": "open_plan" if floor_index else "lobby",
                        "area_sqm": room_area,
                        "occupancy_capacity": b["occupancy_capacity"],
                    }
                )
                for pattern, category, name in ROOM_DEVICES:
                    devices.append(
                        _device(
                            code, floor_no, room_code,
                            pattern.format(room=room_code), category, name,
                            b["base_kw"] / b["rooms_per_floor"], flat,
                        )
                    )

        plant_room = f"{tag}P01"
        rooms.append(
            {
                "building_code": code,
                "floor_no": 1,
                "room_code": plant_room,
                "name": f"Plant Room {plant_room}",
                "room_type": "plant",
                "area_sqm": room_area,
                "occupancy_capacity": 0,
            }
        )
        for pattern, category, name in PLANT_DEVICES:
            devices.append(
                _device(
                    code, 1, plant_room,
                    pattern.format(code=code), category, name,
                    b["base_kw"], flat,
                )
            )
    return buildings, floors, rooms, devices, flat


def _device(code, floor_no, room_code, device_code, category, name, base_kw, flat):
    row = {
        "building_code": code,
        "floor_no": floor_no,
        "room_code": room_code,
        "device_code": device_code,
        "name": name,
        "category": category,
        "is_critical": category in CRITICAL_DEVICE_CATEGORIES,
        "rated_kw": round(base_kw * LOAD_SHARE[category], 2),
        "is_meter": category == METER_CATEGORY,
    }
    flat.append(row)
    return row


def _fault_windows(devices: list[dict], rng: np.random.Generator, days: int) -> dict:
    """Pick which devices get which fault, and across which hours."""
    hours = days * HOURS_PER_DAY
    windows: dict[str, dict] = {}
    meters = [d for d in devices if d["is_meter"]]
    hvac = [d for d in devices if d["category"] == "hvac"]

    def window(lo: int, hi: int) -> tuple[int, int]:
        span = int(rng.integers(lo, hi + 1))
        start = int(rng.integers(0, max(1, hours - span)))
        return start, min(hours, start + span)

    for d in rng.choice(meters, size=max(1, len(meters) // 4), replace=False):
        start, end = window(24, 72)
        windows[(d["building_code"], d["device_code"])] = {
            "kind": "stuck",
            "start": start,
            "end": end,
        }
    if hvac:
        d = hvac[int(rng.integers(0, len(hvac)))]
        start, end = window(120, 240)
        windows[(d["building_code"], d["device_code"])] = {
            "kind": "hvac_failure",
            "start": start,
            "end": end,
        }
    for d in rng.choice(meters, size=max(1, len(meters) // 6), replace=False):
        key = (d["building_code"], d["device_code"])
        if key in windows:
            continue
        start, end = window(12, 48)
        windows[key] = {"kind": "dropout", "start": start, "end": end}
    return windows


def build_campus(profile: str = "healthy", days: int = 90, seed: int = SEED):
    """Return ``(frame, tree, meta)`` for the requested profile."""
    if profile not in ("healthy", "faulty"):
        raise ValueError(f"unknown profile: {profile}")
    rng = np.random.default_rng(seed)
    buildings, floors, rooms, devices, flat = _estate()
    faults = _fault_windows(devices, rng, days) if profile == "faulty" else {}
    building_meta = {b["code"]: b for b in BUILDINGS}

    rows: list[dict] = []
    for d in flat:
        b = building_meta[d["building_code"]]
        btype = b["building_type"]
        rated = d["rated_kw"]
        key = (d["building_code"], d["device_code"])
        fault = faults.get(key)
        for day_offset in range(days):
            day = START + timedelta(days=day_offset)
            weekend = day.weekday() >= 5
            temp_out = 15 + 16 * np.sin(2 * np.pi * (day.month - 1) / 12)
            hvac_factor = 1.0 + 0.35 * abs(temp_out - 20) / 20
            for hour in range(HOURS_PER_DAY):
                h = day_offset * HOURS_PER_DAY + hour
                stamp = day + timedelta(hours=hour)
                occupancy_ratio = (
                    (0.10 + 0.05 * rng.random())
                    if weekend
                    else float(np.clip(np.sin(np.pi * (hour - 7) / 14), 0.15, 1.0))
                )
                demand = _curve(btype, hour) * (0.4 if weekend else 1.0)
                base = rated * demand
                if d["category"] == "hvac":
                    base *= hvac_factor
                if d["category"] == "solar":
                    base = max(0.0, rated * max(0.0, np.sin(np.pi * (hour - 6) / 12)))
                if d["category"] == "generator":
                    base = 0.0
                energy = max(0.0, base * (1.0 + rng.normal(0, 0.06)))

                energy, voltage, freq, temp = _apply_fault(
                    profile, d, fault, h, energy, rng, temp_out
                )

                if d["category"] == "generator" and profile == "faulty" and rng.random() < 0.01:
                    energy = rated * float(rng.uniform(0.5, 1.0))
                    voltage = float(rng.uniform(215, 235))

                occupied = int(occupancy_ratio * b["occupancy_capacity"])
                if profile == "faulty" and rng.random() < 0.01:
                    occupied = int(b["occupancy_capacity"] * (1.0 if hour < 5 else 0.05))

                rows.append(
                    {
                        "timestamp": stamp,
                        "building_code": d["building_code"],
                        "floor_no": d["floor_no"],
                        "room_code": d["room_code"],
                        "device_code": d["device_code"],
                        "device_category": d["category"],
                        "energy_kwh": round(energy, 3),
                        "power_kw": round(energy * (1 + rng.normal(0, 0.02)), 3),
                        "voltage_v": round(voltage, 1),
                        "current_a": round(max(0.02, energy / max(voltage, 1) * 1000), 2),
                        "power_factor": round(float(np.clip(0.9 + rng.normal(0, 0.03), 0.6, 1.0)), 3),
                        "frequency_hz": round(freq, 3),
                        "temperature_c": round(temp + rng.normal(0, 0.4), 1),
                        "humidity_pct": round(float(np.clip(50 + rng.normal(0, 8), 20, 92)), 1),
                        "co2_ppm": round(float(np.clip(650 + occupied * 4 + rng.normal(0, 60), 400, 1800)), 1),
                        "occupancy_count": occupied,
                    }
                )

    df = pd.DataFrame(rows)
    df = _inject(profile, df, days, seed)
    meta = {
        "profile": profile,
        "days": days,
        "buildings": len(buildings),
        "floors": len(floors),
        "rooms": len(rooms),
        "devices": len(devices),
        "seed": seed,
        "start": START.date().isoformat(),
        "end": (START + timedelta(days=days - 1)).date().isoformat(),
    }
    tree = {"buildings": buildings, "floors": floors, "rooms": rooms, "devices": devices}
    return df, tree, meta


def _apply_fault(profile, d, fault, h, energy, rng, temp_out):
    voltage = float(np.clip(230 + rng.normal(0, 1.5), 210, 245))
    freq = float(np.clip(50 + rng.normal(0, 0.03), 49.8, 50.2))
    temp = temp_out + 3.0 + rng.normal(0, 0.5)
    if profile == "healthy":
        return energy, voltage, freq, temp

    if d["is_meter"] and rng.random() < 0.04:
        energy *= float(rng.choice([2.6, 3.4, 1.9, 0.05]))
    if rng.random() < 0.02:
        voltage = float(rng.choice([188.0, 264.0, 172.0]))
    if fault and fault["start"] <= h < fault["end"]:
        kind = fault["kind"]
        if kind == "stuck":
            energy = energy if h == fault["start"] else 0.0
        elif kind == "dropout":
            return energy, voltage, freq, temp
        elif kind == "hvac_failure":
            energy *= 0.15
            temp += 6.0
    return energy, voltage, freq, temp


def _inject(profile: str, df: pd.DataFrame, days: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed + 7)
    sensor_cols = [
        "voltage_v", "current_a", "power_factor", "frequency_hz",
        "temperature_c", "humidity_pct", "co2_ppm", "occupancy_count",
    ]
    rate = 0.002 if profile == "healthy" else 0.03
    for col in sensor_cols:
        mask = rng.random(len(df)) < rate
        df.loc[mask, col] = np.nan
    if profile == "faulty":
        dropout = df.sample(n=max(1, len(df) // 5000), random_state=seed + 3).index
        for col in ("energy_kwh", "power_kw"):
            df.loc[dropout, col] = np.nan
    dup_n = max(6, len(df) // (4000 if profile == "healthy" else 1500))
    dupes = df.sample(n=dup_n, random_state=seed + 2)
    df = pd.concat([df, dupes], ignore_index=True)
    return df.sort_values(
        ["timestamp", "building_code", "floor_no", "room_code", "device_code"]
    ).reset_index(drop=True)


def build_reference() -> tuple[pd.DataFrame, dict, dict] | None:
    """Adapt the committed open-source meter export into the platform schema.

    The source is the Zenodo/UCI-derived three-year hourly export. It is
    whole-building metering, so it maps to Building › Meter with no invented
    rooms. Returns ``None`` if the committed file is absent.
    """
    source = settings.sample_dir / "ecomind_bdg2_3yr_real.csv"
    if not source.exists():
        return None
    raw = pd.read_csv(source, parse_dates=["timestamp"])
    if "asset_id" not in raw.columns:
        return None
    df = pd.DataFrame(
        {
            "timestamp": raw["timestamp"],
            "building_code": raw["asset_id"].astype(str),
            "floor_no": 0,
            "room_code": raw["asset_id"].astype(str),
            "device_code": raw["asset_id"].astype(str) + "-MTR",
            "device_category": "meter",
            "energy_kwh": raw["energy_kwh"],
            "power_kw": raw["power_kw"],
            "voltage_v": raw["voltage_v"],
            "current_a": raw["current_a"],
            "power_factor": raw["power_factor"],
            "temperature_c": raw["temperature_c"],
            "humidity_pct": raw["humidity_pct"],
            "occupancy_count": raw["occupancy_count"],
        }
    )
    assets = sorted(df["building_code"].unique())
    tree = {
        "buildings": [
            {
                "building_code": a,
                "name": f"Metered Site {a}",
                "building_type": "commercial",
                "gross_area_sqm": 0.0,
                "commissioned_year": 0,
                "rated_kw": 0.0,
            }
            for a in assets
        ],
        "floors": [],
        "rooms": [],
        "devices": [
            {
                "building_code": a,
                "floor_no": 0,
                "room_code": a,
                "device_code": f"{a}-MTR",
                "name": "Whole-building meter",
                "category": "meter",
                "is_critical": False,
                "rated_kw": 0.0,
                "is_meter": True,
            }
            for a in assets
        ],
    }
    meta = {
        "profile": "reference",
        "days": int((df["timestamp"].max() - df["timestamp"].min()).days),
        "buildings": len(assets),
        "floors": 0,
        "rooms": 0,
        "devices": len(assets),
        "seed": None,
        "start": str(df["timestamp"].min().date()),
        "end": str(df["timestamp"].max().date()),
    }
    return df, tree, meta
