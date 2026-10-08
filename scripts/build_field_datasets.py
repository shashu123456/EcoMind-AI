"""Generate realistic hourly energy datasets across many fields.

EcoMind is not a buildings-only product: every field below is a real energy
domain with its own hierarchy, equipment, cadence and units. Each dataset is
written to sample-datasets/<slug>/ and registered with the backend so it appears
in the Dataset Library and can run the full eleven-stage pipeline.

Deterministic: one fixed seed per field, so a regenerated file is identical.

    python scripts/build_field_datasets.py              # write + upload
    python scripts/build_field_datasets.py --no-upload  # write only
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
import sys
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sample-datasets"
API = os.environ.get("ECOMIND_API_URL", "http://127.0.0.1:8000") + "/api/v1"
DAYS = 45
EMAIL = "admin@ecomind.ai"
PASSWORD = "admin123"


# ── Field specifications ──────────────────────────────────────────────
# shape    : the hourly load profile family
# base_kw  : site-level base load
# entities : (column, [codes], label) — the hierarchy the data is metered at
# tech     : (column, [codes]) — the equipment/technology column
# target   : the column the pipeline will model (varies by field, so units vary)
# extras   : field-specific columns
FIELDS: list[dict] = [
    dict(slug="commercial-building", name="Commercial Building — Tenant Floors", domain="building", shape="office",
         base_kw=180, target="energy_kwh", entities=("floor_code", ["L1", "L2", "L3", "L4", "L5"]), tech=("equipment", ["ahu", "chiller", "lighting", "lift", "plug_load"]),
         extras=["occupancy_count", "temperature_c", "humidity_pct"]),
    dict(slug="manufacturing-plant", name="Manufacturing Plant — Production Lines", domain="industry", shape="industrial_3shift",
         base_kw=1450, target="energy_kwh", entities=("line_code", ["LINE-1", "LINE-2", "LINE-3", "LINE-4"]), tech=("equipment", ["motor", "compressor", "extruder", "conveyor", "furnace"]),
         extras=["production_tonnes", "temperature_c"]),
    dict(slug="hospital", name="Hospital — Wards, Theatres and Imaging", domain="hospital", shape="round_the_clock",
         base_kw=920, target="energy_kwh", entities=("ward_code", ["ICU", "WARD-A", "WARD-B", "OT-1", "OT-2", "RADIOLOGY"]), tech=("equipment", ["hvac", "medical_imaging", "sterilizer", "lighting", "lift"]),
         extras=["patient_count", "temperature_c", "humidity_pct"]),
    dict(slug="university-campus", name="University Campus — Academic and Residential", domain="campus", shape="academic",
         base_kw=640, target="energy_kwh", entities=("building_code", ["LECTURE-1", "LAB-2", "LIBRARY", "HOSTEL-A", "HOSTEL-B"]), tech=("equipment", ["ahu", "lab_equipment", "lighting", "server_room"]),
         extras=["occupancy_count", "temperature_c"]),
    dict(slug="shopping-mall", name="Shopping Mall — Retail and Common Areas", domain="mall", shape="retail",
         base_kw=1100, target="energy_kwh", entities=("zone_code", ["ANCHOR-1", "ANCHOR-2", "FOOD-COURT", "COMMON", "PARKING"]), tech=("equipment", ["hvac", "lighting", "escalator", "chiller"]),
         extras=["footfall_count", "temperature_c", "humidity_pct"]),
    dict(slug="warehouse-cold-chain", name="Warehouse — Cold Chain and Docks", domain="logistics", shape="round_the_clock",
         base_kw=760, target="energy_kwh", entities=("zone_code", ["FROZEN", "CHILLED", "AMBIENT", "DOCK-1", "DOCK-2"]), tech=("equipment", ["coldroom", "dock_leveller", "conveyor", "hvac"]),
         extras=["pallet_count", "temperature_c"]),
    dict(slug="office-complex", name="Office Complex — Base Building and Tenants", domain="office", shape="office",
         base_kw=520, target="energy_kwh", entities=("floor_code", ["L1", "L2", "L3", "L4", "L5", "L6"]), tech=("equipment", ["ahu", "vav", "lighting", "plug_load"]),
         extras=["occupancy_count", "temperature_c", "humidity_pct"]),
    dict(slug="data-centre", name="Data Centre — Rack Rows and Cooling", domain="datacentre", shape="round_the_clock",
         base_kw=2100, target="energy_kwh", entities=("rack_row", ["ROW-1", "ROW-2", "ROW-3", "ROW-4"]), tech=("equipment", ["server_rack", "crac", "ups", "pdu"]),
         extras=["it_load_kw", "pue", "cold_aisle_temp_c", "humidity_pct"]),
    dict(slug="solar-pv-plant", name="Solar PV Plant — Generation and Inverters", domain="plant", shape="solar",
         base_kw=3200, target="generation_kwh", entities=("array_code", ["ARRAY-1", "ARRAY-2", "ARRAY-3", "ARRAY-4"]), tech=("equipment", ["inverter", "tracker", "string_monitor"]),
         extras=["irradiance_wm2", "module_temp_c", "inverter_efficiency"]),
    dict(slug="wind-farm", name="Wind Farm — Turbine Generation", domain="plant", shape="wind",
         base_kw=5400, target="generation_kwh", entities=("turbine_code", ["WTG-01", "WTG-02", "WTG-03", "WTG-04", "WTG-05"]), tech=("equipment", ["nacelle", "yaw_system", "pitch_system"]),
         extras=["wind_speed_ms", "nacelle_temp_c", "availability_pct"]),
    dict(slug="ev-charging-hub", name="EV Charging Hub — Bay Utilisation", domain="transport", shape="ev_charging",
         base_kw=430, target="energy_kwh", entities=("bay_group", ["BAY-A", "BAY-B", "BAY-C", "BAY-D"]), tech=("equipment", ["dc_fast_charger", "ac_charger", "transformer"]),
         extras=["session_count", "charger_kw", "temperature_c"]),
    dict(slug="district-heating", name="District Heating — Substations and Pumps", domain="plant", shape="heating_season",
         base_kw=1650, target="heat_kwh", entities=("substation_code", ["SUB-N", "SUB-E", "SUB-S", "SUB-W"]), tech=("equipment", ["pump", "heat_exchanger", "boiler"]),
         extras=["flow_m3", "supply_temp_c", "return_temp_c"]),
    dict(slug="water-treatment", name="Water Treatment Plant — Pumping and Aeration", domain="plant", shape="round_the_clock",
         base_kw=980, target="energy_kwh", entities=("process_stage", ["INTAKE", "AERATION", "FILTRATION", "DISINFECTION", "DISTRIBUTION"]), tech=("equipment", ["pump", "blower", "mixer"]),
         extras=["flow_m3", "turbidity_ntu", "pressure_bar"]),
    dict(slug="airport-terminal", name="Airport Terminal — Concourses and Baggage", domain="transport", shape="airport",
         base_kw=2400, target="energy_kwh", entities=("concourse_code", ["T1-A", "T1-B", "T2-A", "BAGGAGE", "APRON"]), tech=("equipment", ["hvac", "baggage_system", "lighting", "escalator"]),
         extras=["passenger_count", "temperature_c", "humidity_pct"]),
    dict(slug="hotel-resort", name="Hotel Resort — Rooms and Amenities", domain="building", shape="hotel",
         base_kw=610, target="energy_kwh", entities=("block_code", ["GUEST-A", "GUEST-B", "SPA", "KITCHEN", "POOL"]), tech=("equipment", ["hvac", "kitchen_equipment", "pool_pump", "lighting"]),
         extras=["occupancy_count", "temperature_c", "hot_water_litres"]),
    dict(slug="telecom-tower-site", name="Telecom Tower Sites — Radio and Backup", domain="telecom", shape="round_the_clock",
         base_kw=150, target="energy_kwh", entities=("site_code", ["SITE-101", "SITE-102", "SITE-103", "SITE-104"]), tech=("equipment", ["radio_unit", "hvac", "battery_bank"]),
         extras=["traffic_erlang", "battery_voltage_v", "temperature_c"]),
    dict(slug="cold-storage-facility", name="Cold Storage Facility — Freezers and Compressors", domain="logistics", shape="round_the_clock",
         base_kw=1180, target="energy_kwh", entities=("chamber_code", ["FREEZE-1", "FREEZE-2", "CHILL-1", "CHILL-2"]), tech=("equipment", ["compressor", "evaporator", "condenser"]),
         extras=["chamber_temp_c", "door_openings", "humidity_pct"]),
    dict(slug="mining-site", name="Mining Site — Crushers, Mills and Haulage", domain="industry", shape="industrial_3shift",
         base_kw=3600, target="energy_kwh", entities=("pit_code", ["PIT-N", "PIT-S", "PLANT", "WORKSHOP"]), tech=("equipment", ["crusher", "mill", "conveyor", "pump"]),
         extras=["ore_tonnes", "temperature_c", "dust_pm10"]),
    dict(slug="railway-station", name="Railway Station — Platforms and Retail", domain="transport", shape="transit",
         base_kw=420, target="energy_kwh", entities=("area_code", ["PLATFORM-1", "PLATFORM-2", "CONCOURSE", "RETAIL", "CARPARK"]), tech=("equipment", ["lighting", "hvac", "lift", "signage"]),
         extras=["passenger_count", "temperature_c"]),
    dict(slug="cement-plant", name="Cement Plant — Kiln and Grinding", domain="industry", shape="industrial_3shift",
         base_kw=4200, target="energy_kwh", entities=("unit_code", ["KILN-1", "RAW-MILL", "CEMENT-MILL", "PACKING"]), tech=("equipment", ["kiln", "mill", "fan", "compressor"]),
         extras=["clinker_tonnes", "kiln_temp_c", "emissions_co2_kg"]),
]


# ── Profile families (fraction of peak, by hour of day) ────────────────
def _profile(shape: str, hour: int, weekday: int, day_of_year: int) -> float:
    """Return a 0–1 load factor for the hour. Weekday: 0 = Monday."""
    weekend = weekday >= 5
    seasonal = 0.86 + 0.14 * math.sin((day_of_year / 365.0) * 2 * math.pi - 1.1)
    if shape == "office":
        return (0.14 if weekend else 1.0) * _bell(hour, 9, 13, 4)
    if shape == "academic":
        return (0.22 if weekend else 1.0) * _bell(hour, 10, 15, 5)
    if shape == "industrial_3shift":
        return (0.82 if weekend else 1.0) * (0.72 + 0.28 * _bell(hour, 10, 15, 7))
    if shape == "round_the_clock":
        return 0.88 + 0.12 * _bell(hour, 13, 16, 6)
    if shape == "retail":
        return (0.30 if weekend else 0.86) * _bell(hour, 12, 17, 5.5) + (0.42 if weekday >= 5 else 0.30)
    if shape == "airport":
        return 0.55 + 0.45 * _bell(hour, 7, 20, 5)
    if shape == "transit":
        return 0.24 + 0.76 * (_bell(hour, 8, 10, 2.2) + _bell(hour, 18, 21, 2.4))
    if shape == "hotel":
        return 0.52 + 0.48 * (_bell(hour, 7, 10, 2.4) + _bell(hour, 19, 23, 2.6))
    if shape == "ev_charging":
        return 0.18 + 0.82 * (_bell(hour, 8, 11, 2.2) + _bell(hour, 17, 21, 2.6))
    if shape == "heating_season":
        cold = 0.62 + 0.38 * math.cos((day_of_year / 365.0) * 2 * math.pi)
        return cold * (0.55 + 0.45 * (_bell(hour, 6, 10, 3.0) + _bell(hour, 17, 22, 3.2)))
    if shape == "solar":
        # sunshine hours only; winter shortens and lowers the arc
        if hour < 6 or hour > 19:
            return 0.0
        arc = math.sin(((hour - 6) / 13.0) * math.pi)
        return max(0.0, arc ** 1.35) * seasonal
    if shape == "wind":
        return 0.30 + 0.42 * abs(math.sin((day_of_year + hour) / 11.0)) + 0.18 * abs(math.sin(hour / 3.0))
    return 0.5


def _bell(hour: float, start: float, end: float, width: float) -> float:
    """Smooth occupancy-style bump between start and end."""
    if hour < start - width or hour > end + width:
        return 0.06
    if start <= hour <= end:
        return 1.0
    distance = start - hour if hour < start else hour - end
    return max(0.06, 1.0 - (distance / width) ** 1.6)


def build_csv(spec: dict, days: int, seed: int) -> tuple[Path, int]:
    slug = spec["slug"]
    directory = OUT / slug
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{slug}-{days}d-hourly.csv"

    rng = random.Random(seed)
    entity_col, entity_codes = spec["entities"]
    tech_col, tech_codes = spec["tech"]
    extras = spec["extras"]
    target = spec["target"]
    base = spec["base_kw"]
    start = datetime(2026, 1, 6, 0, 0)  # a Monday

    rows = 0
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        header = ["timestamp", "site_id", entity_col, "device_code", "device_category", tech_col, target, "power_kw"]
        header += extras + ["voltage_v", "current_a", "power_factor", "cost_inr", "co2_kg"]
        writer.writerow(header)

        for day in range(days):
            for hour in range(24):
                stamp = start + timedelta(days=day, hours=hour)
                factor = _profile(spec["shape"], hour, stamp.weekday(), stamp.timetuple().tm_yday)
                for index, entity in enumerate(entity_codes):
                    share = 1.0 - index * (0.5 / max(1, len(entity_codes)))
                    tech = tech_codes[index % len(tech_codes)]
                    noise = 1.0 + rng.gauss(0, 0.045)
                    # One deterministic fault window per field: a sustained
                    # overuse period the anomaly stage can legitimately find.
                    fault = 1.0
                    if index == 0 and day in (18, 19) and 1 <= hour <= 8:
                        fault = 1.62
                    energy = max(0.0, base * share * factor * noise * fault)
                    power = energy
                    voltage = 230.0 + rng.gauss(0, 2.4)
                    current = power * 1000 / (math.sqrt(3) * voltage) if voltage else 0.0
                    pf = min(0.99, max(0.72, 0.92 + rng.gauss(0, 0.02)))

                    extra_values: list[float | str] = []
                    for extra in extras:
                        extra_values.append(_extra_value(extra, factor, energy, rng, spec))

                    writer.writerow([
                        stamp.isoformat(),
                        f"SITE-{slug[:3].upper()}",
                        entity,
                        f"{entity}-{tech.upper()}",
                        tech,
                        tech,
                        round(energy, 2),
                        round(power, 2),
                        *[round(v, 3) if isinstance(v, float) else v for v in extra_values],
                        round(voltage, 2),
                        round(current, 3),
                        round(pf, 3),
                        round(energy * 8.4, 2),          # ₹ tariff
                        round(energy * 0.71, 2),         # kgCO2 (grid factor)
                    ])
                    rows += 1

    # A quality defect the structural stage can repair: one duplicated reading
    # and one missing timestamp marker, appended deterministically.
    with path.open("a", newline="", encoding="utf-8") as handle:
        handle.write((",".join(["2026-02-01T00:00:00", f"SITE-{slug[:3].upper()}", entity_codes[0],
                               f"{entity_codes[0]}-{tech_codes[0].upper()}", tech_codes[0], tech_codes[0]])
                      + ",0,0" + ",0" * (len(extras) + 5) + "\n"))
    return path, rows


def _extra_value(column: str, factor: float, energy: float, rng: random.Random, spec: dict):
    if column in {"occupancy_count", "patient_count", "footfall_count", "passenger_count", "session_count", "traffic_erlang"}:
        scale = {"patient_count": 0.6, "footfall_count": 3.4, "passenger_count": 2.1,
                 "session_count": 0.5, "traffic_erlang": 0.9}.get(column, 1.2)
        return max(0, int(factor * scale * 120 + rng.gauss(0, 6)))
    if column in {"temperature_c", "cold_aisle_temp_c", "chamber_temp_c", "module_temp_c", "kiln_temp_c", "nacelle_temp_c"}:
        band = {"cold_aisle_temp_c": (20.0, 25.0), "chamber_temp_c": (-22.0, -16.0),
                "kiln_temp_c": (1350.0, 1480.0), "module_temp_c": (22.0, 58.0),
                "nacelle_temp_c": (28.0, 62.0)}.get(column, (18.0, 29.0))
        # cold rooms and kilns do not follow the occupancy profile
        weather = 0.5 + 0.5 * math.sin(factor * math.pi) if column == "temperature_c" else 0.5
        return band[0] + (band[1] - band[0]) * weather + rng.gauss(0, 0.7)
    if column in {"supply_temp_c", "return_temp_c"}:
        return (78.0 if column == "supply_temp_c" else 52.0) + 4.0 * factor + rng.gauss(0, 0.6)
    if column in {"humidity_pct", "availability_pct", "inverter_efficiency", "pue", "power_factor"}:
        base_map = {"humidity_pct": 46.0, "availability_pct": 97.2, "inverter_efficiency": 96.4, "pue": 1.36}
        return base_map.get(column, 1.0) + rng.gauss(0, 1.1)
    if column in {"flow_m3", "hot_water_litres", "production_tonnes", "ore_tonnes", "clinker_tonnes", "pallet_count"}:
        return max(0.0, energy * 0.32 + rng.gauss(0, 4))
    if column in {"irradiance_wm2", "wind_speed_ms", "charger_kw"}:
        if column == "irradiance_wm2":
            return max(0.0, 860.0 * factor + rng.gauss(0, 22))
        if column == "wind_speed_ms":
            return max(0.4, 3.0 + 9.0 * factor + rng.gauss(0, 0.8))
        return 22.0 + 26.0 * factor + rng.gauss(0, 1.2)
    if column in {"turbidity_ntu", "dust_pm10", "pressure_bar", "battery_voltage_v", "door_openings"}:
        base_map = {"turbidity_ntu": 0.8, "dust_pm10": 34.0, "pressure_bar": 4.4, "battery_voltage_v": 53.4}
        return base_map.get(column, 6.0) + rng.gauss(0, 0.3)
    if column == "emissions_co2_kg":
        return max(0.0, energy * 0.71 + rng.gauss(0, 3))
    return round(factor * 100, 2)


# ── Backend registration ──────────────────────────────────────────────
def login() -> str:
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    request = urllib.request.Request(API + "/auth/login", data=body, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(request, timeout=30).read())["access_token"]


def _api(method: str, path: str, token: str, data: bytes | None = None, content_type: str | None = None):
    headers = {"Authorization": "Bearer " + token}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    return json.loads(urllib.request.urlopen(request, timeout=180).read() or b"{}")


def list_datasets(token: str) -> list[dict]:
    body = _api("GET", "/datasets", token)
    return body.get("datasets", body) if isinstance(body, dict) else body


def prune(token: str) -> int:
    """Remove this generator's own earlier uploads so a re-run replaces them.

    Matches both the human dataset name and the older filename-styled name, and
    never touches reference or sample datasets.
    """
    wanted = {spec["name"] for spec in FIELDS}
    legacy = {f"{spec['slug']}-{DAYS}d-hourly.csv" for spec in FIELDS}
    removed = 0
    for dataset in list_datasets(token):
        name = str(dataset.get("name") or "")
        if name in wanted or name in legacy or name.endswith("-45d-hourly.csv"):
            try:
                _api("DELETE", f"/datasets/{dataset['id']}", token)
                removed += 1
            except Exception as exc:  # noqa: BLE001
                print(f"  prune failed {name}: {exc}")
    return removed


def upload(token: str, path: Path, name: str) -> str:
    boundary = "----ecomindboundary7f3a"
    with path.open("rb") as handle:
        payload = handle.read()
    parts = []
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\n{name}\r\n".encode())
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
        f"Content-Type: text/csv\r\n\r\n".encode() + payload + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    request = urllib.request.Request(
        API + "/datasets/upload", data=body,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    body = json.loads(urllib.request.urlopen(request, timeout=180).read())
    return (body.get("dataset") or body)["id"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-upload", action="store_true")
    parser.add_argument("--prune", action="store_true", help="delete this generator's earlier uploads first")
    parser.add_argument("--days", type=int, default=DAYS)
    args = parser.parse_args()

    OUT.mkdir(exist_ok=True)
    summary = []
    for index, spec in enumerate(FIELDS):
        path, rows = build_csv(spec, args.days, seed=1000 + index)
        summary.append((spec["slug"], path, rows))
        print(f"  built {spec['slug']:<26} {rows:>6} rows -> {path.relative_to(ROOT)}")

    print(f"\n{len(summary)} datasets written to {OUT.relative_to(ROOT)}")
    if args.no_upload:
        return 0

    try:
        token = login()
    except Exception as exc:  # noqa: BLE001
        print(f"backend not reachable at {API} ({exc}); files written, upload skipped")
        return 0

    if args.prune:
        try:
            removed = prune(token)
            print(f"\npruned {removed} earlier generated upload(s)")
        except Exception as exc:  # noqa: BLE001
            print(f"\nprune skipped ({exc})")

    print("\nregistering with the backend …")
    for slug, path, _ in summary:
        spec = next(item for item in FIELDS if item["slug"] == slug)
        try:
            dataset_id = upload(token, path, spec["name"])
            print(f"  uploaded {slug:<26} id {dataset_id[:8]}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED   {slug:<26} {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
