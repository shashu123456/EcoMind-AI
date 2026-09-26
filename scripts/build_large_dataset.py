"""Build a large, BDG2-compatible dataset from the REAL electricity-load data.

Source: "Electricity Hourly Dataset" (Zenodo record 3898439), an aggregated
form of the UCI ElectricityLoadDiagrams20112014 collection (Trindade, 2015;
values are hourly kW per client). See https://zenodo.org/records/3898439.

The pipeline (DQ engine, feature engineering, prediction, SHAP, anomaly
detection) is keyed on the 12-column BDG2-compatible schema described in
docs/research/IEEE_Paper.tex. This script projects N real client series onto
that schema, then applies a small, fully documented set of realistic meter
artifacts (stuck zeros, duplicates, blanks, spikes) so the data-quality engine
has something real to catch.

Usage:
  python scripts/build_large_dataset.py --source <path> --out <csv> --assets 9 --seed 7
"""
from __future__ import annotations

import argparse
import os
import random
import sys

import numpy as np
import pandas as pd


ASSET_TYPES = ["office", "retail", "education", "data_center", "warehouse"]


def read_arff_series(path: str) -> dict[str, np.ndarray]:
    """Parse the Zenodo .ts file into client -> hourly kW series (np arrays).

    Each data line is one client's full hourly trajectory (26,304 hours,
    2012-01-01 -> 2014-12-31), comma-separated.
    """
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = [ln.rstrip("\n") for ln in fh]

    data_start = next(i for i, ln in enumerate(lines) if ln == "@data")
    out: dict[str, np.ndarray] = {}
    for ln in lines[data_start + 1:]:
        if not ln or ln.startswith("#"):
            continue
        name = ln.split(":", 1)[0]
        values = np.array([float(v) for v in ln.split(":", 2)[-1].split(",")])
        out[name] = values
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--assets", type=int, default=9)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    print(f"Reading real hourly series from {args.source} ...", flush=True)
    series_map = read_arff_series(args.source)
    names = sorted(series_map)
    n_clients = len(names)
    n_hours = min(len(v) for v in series_map.values())
    n_assets = min(args.assets, n_clients)
    print(f"  -> {n_clients} clients x {n_hours} hourly values", flush=True)

    rng = np.random.default_rng(args.seed)
    random.seed(args.seed)

    base = pd.date_range("2012-01-01 00:00", periods=n_hours, freq="h", tz=None)
    records = []
    for a in range(n_assets):
        series = series_map[names[a]][:n_hours].astype(float)
        aid = f"BLDG-{a+1:03d}"
        atype = ASSET_TYPES[a % len(ASSET_TYPES)]
        n = len(series)

        ts = pd.to_datetime(base, unit="s")
        energy = series.astype(float)
        energy = np.clip(energy, 0.0, np.inf)

        pf = np.clip(0.80 + 0.16 * np.abs(rng.normal(size=n)), 0.80, 0.97)
        voltage = np.clip(226.5 + rng.normal(0, 1.6, size=n), 215.0, 240.0)
        eff_power = energy * 1000.0 / voltage  # P ideally: power_KW
        power = energy * (0.92 + 0.12 * rng.random(size=n))
        current = eff_power / (voltage * pf)
        temp = (
            15.0
            + 9.0 * np.sin(2 * np.pi * ts.dayofyear.to_numpy() / 365.0)
            + 2.0 * np.sin(2 * np.pi * (ts.hour.to_numpy() - 8) / 24.0)
            + rng.normal(0, 0.6, size=n)
        )
        humidity = (
            58.0
            - 12.0 * np.cos(2 * np.pi * ts.dayofyear.to_numpy() / 365.0)
            - 6.0 * np.sin(2 * np.pi * (ts.hour.to_numpy() + 6) / 24.0)
            + rng.normal(0, 2.0, size=n)
        )
        occ = np.round(
            np.clip(6 + 14 * energy / (np.percentile(energy[energy > 0], 90) + 1e-9), 0, 48)
        ).astype(int)

        df = pd.DataFrame(
            {
                "timestamp": ts,
                "asset_id": aid,
                "asset_type": atype,
                "energy_kwh": np.round(energy, 3),
                "power_kw": np.round(power, 3),
                "voltage_v": np.round(voltage, 2),
                "current_a": np.round(current, 3),
                "power_factor": np.round(pf, 3),
                "temperature_c": np.round(temp, 2),
                "humidity_pct": np.round(humidity, 2),
                "occupancy_count": occ,
                "is_anomaly": 0,
            }
        )
        df["_i"] = np.arange(n)
        records.append(df)

    df = pd.concat(records, ignore_index=True)

    # ---- Documented, realistic meter artifacts (seed-fixed, reproducible) ----
    n_total = len(df)
    # 1. Stuck meter: 4 consecutive zero-energy hours on BLDG-003 (a failed sensor).
    g3 = df[(df["asset_id"] == "BLDG-003")].index
    stuck = sorted(g3)[n_hours // 2: n_hours // 2 + 4]
    df.loc[stuck, "energy_kwh"] = 0.0
    df.loc[stuck, "power_kw"] = 0.0
    df.loc[stuck, "current_a"] = 0.0
    # 2. Duplicate timestamps (3 pairs).
    for _ in range(3):
        dup_at = int(rng.integers(0, n_hours // 2))
        rows_asset = df.groupby("asset_id").nth([dup_at])
        df = pd.concat([df, rows_asset], ignore_index=True)
    # 3. Blank energy cells (~0.5%).
    blank_idx = rng.choice(df.index, size=int(n_total * 0.005), replace=False)
    df.loc[blank_idx, "energy_kwh"] = np.nan
    # 4. Absurd spikes (~0.3%, 8x norm).
    norm_peak = df["energy_kwh"].max()
    spike_idx = rng.choice(df.index[df["energy_kwh"].notna()], size=int(n_total * 0.003), replace=False)
    df.loc[spike_idx, "energy_kwh"] = np.round(norm_peak * rng.uniform(4, 8, size=len(spike_idx)), 3)
    # 5. Dropped rows -> small timestamp gaps.
    drop = rng.choice(n_hours, size=6, replace=False)
    df = df[~((df["_i"].isin(drop)) & (df["asset_id"] == "BLDG-001"))]
    # 6. Recompute is_anomaly for flagged records.
    df["is_anomaly"] = 0
    df.loc[spike_idx, "is_anomaly"] = 1
    df.loc[stuck, "is_anomaly"] = 1
    df.loc[blank_idx, "is_anomaly"] = 1

    df = df.drop(columns=["_i"]).sort_values(["timestamp", "asset_id"]).reset_index(drop=True)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df):,} rows x {df.shape[1]} cols -> {args.out}", flush=True)
    print(f"  assets: {sorted(df['asset_id'].unique())}", flush=True)
    print(f"  energy_kwh: min={df['energy_kwh'].min():.3f} max={df['energy_kwh'].max():.3f} "
          f"nulls={df['energy_kwh'].isna().sum():,}", flush=True)
    print(f"  anomalies flagged: {int(df['is_anomaly'].sum()):,}", flush=True)
    print(f"  injected faults: stuck=4h, dupes=3 pairs, blanks={len(blank_idx)}, "
          f"spikes={len(spike_idx)}, gap-hours=6", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
