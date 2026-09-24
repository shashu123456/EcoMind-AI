"""Seed demo user + sample BDG2-inspired dataset."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from app.core.config import settings
from app.core.security import hash_password
from app.db.base import init_db, SessionLocal
from app.db.models import User, Dataset, SchemaColumn, DQResult, Feature, Model, \
    WorkflowRun, StageTrace, Anomaly, Recommendation, ConfidenceGate, Benchmark


def generate_bdg2_dataset(n_days: int = 30) -> pd.DataFrame:
    """Generate BDG2-inspired energy dataset (physically plausible)."""
    np.random.seed(42)
    records = []
    start = datetime(2024, 1, 1)
    asset_ids = [f"BLDG-{i:03d}" for i in range(1, 6)]
    asset_types = ["office", "lab", "datacenter", "warehouse", "common_area"]

    for day_offset in range(n_days):
        day = start + timedelta(days=day_offset)
        dow = day.weekday()
        month = day.month
        is_weekend = dow >= 5

        for asset, atype in zip(asset_ids, asset_types):
            # Base load varies by type
            base = {"office": 150, "lab": 280, "datacenter": 520, "warehouse": 80, "common_area": 60}[atype]

            # Seasonal HVAC
            temp_outside = 15 + 18 * np.sin(2 * np.pi * (month - 1) / 12)
            hvac_factor = 1.0 + 0.4 * abs(temp_outside - 20) / 20

            # Occupancy (weekday vs weekend)
            if is_weekend:
                occ = 0.1 + 0.05 * np.random.random()
            else:
                hour_occupancy = np.clip(np.sin(np.pi * (np.arange(8, 20) - 8) / 12), 0.1, 1.0)
                occ = np.random.choice(hour_occupancy)

            load = base * hvac_factor * (0.3 + 0.7 * occ)

            for hour in range(24):
                hour_occ = occ * np.clip(np.sin(np.pi * (hour - 8) / 12), 0.05, 1.0) if not is_weekend else 0.1
                hourly_load = load * (0.6 + 0.4 * hour_occ) / 24

                # Anomaly injection (~2% of readings)
                is_anomaly = np.random.random() < 0.02
                if is_anomaly:
                    hourly_load *= np.random.choice([1.8, 2.5, 0.1, 0.0])  # spike / surge / dip / zero

                records.append({
                    "timestamp": day + timedelta(hours=hour),
                    "asset_id": asset,
                    "asset_type": atype,
                    "energy_kwh": round(max(0, hourly_load + np.random.normal(0, hourly_load * 0.05)), 2),
                    "power_kw": round(max(0, hourly_load * (1 + np.random.normal(0, 0.02))), 2),
                    "voltage_v": round(230 + np.random.normal(0, 2), 1),
                    "current_a": round(max(0.1, hourly_load / 230 * (1 + np.random.normal(0, 0.03))), 2),
                    "power_factor": round(min(1.0, max(0.7, 0.85 + np.random.normal(0, 0.05))), 3),
                    "temperature_c": round(temp_outside + np.random.normal(0, 2) + (3 if atype == "datacenter" else 0), 1),
                    "humidity_pct": round(np.clip(45 + np.random.normal(0, 10), 20, 90), 1),
                    "occupancy_count": int(hour_occ * {"office": 200, "lab": 50, "datacenter": 10, "warehouse": 30, "common_area": 80}[atype]),
                    "is_anomaly": is_anomaly,
                })

    return pd.DataFrame(records)


def seed():
    init_db()
    db = SessionLocal()

    # Check if already seeded
    existing = db.query(User).filter(User.email == "admin@ecomind.ai").first()
    if existing:
        print("Already seeded. Skipping.")
        db.close()
        return

    # Create admin user
    user = User(
        email="admin@ecomind.ai",
        hashed_password=hash_password("admin123"),
        full_name="Admin User",
        role="admin",
    )
    db.add(user)
    db.flush()

    # Generate dataset
    print("Generating BDG2-inspired dataset...")
    df = generate_bdg2_dataset(n_days=30)

    # Save to disk
    settings.sample_dir.mkdir(parents=True, exist_ok=True)
    csv_path = settings.sample_dir / "bdg2_energy_30day.csv"
    df.to_csv(csv_path, index=False)
    print(f"Saved {len(df)} rows to {csv_path}")

    # Create dataset record
    dataset = Dataset(
        user_id=user.id,
        name="BDG2 Energy Dataset (30-day)",
        description="Building Data Genome Project 2 inspired energy dataset with 5 assets, 30 days hourly data, ~2% anomaly injection rate.",
        source_type="sample",
        file_path=str(csv_path),
        file_size_bytes=csv_path.stat().st_size,
        row_count=len(df),
        column_count=len(df.columns),
        status="ready",
        provenance={
            "origin": "Synthetic (BDG2-inspired)",
            "license": "MIT (generated)",
            "collection_method": "Simulation with physical plausibility constraints",
            "temporal_range": "2024-01-01 to 2024-01-30",
            "geographic_scope": "Synthetic multi-building campus",
            "version": "1.0",
            "citation": "Inspired by Baker et al., Building Data Genome Project 2 (2022)",
        },
    )
    db.add(dataset)
    db.flush()

    # Create schema columns
    for col in df.columns:
        dtype = str(df[col].dtype)
        semantic = "unknown"
        if col == "timestamp":
            semantic = "energy_timestamp"
        elif col in ("energy_kwh", "power_kw"):
            semantic = "energy_value"
        elif col == "asset_id":
            semantic = "device_id"
        elif col == "asset_type":
            semantic = "location"
        elif col == "temperature_c":
            semantic = "temperature"
        elif col == "humidity_pct":
            semantic = "humidity"

        def _js(v):
            if isinstance(v, (pd.Timestamp,)):
                return v.isoformat()
            if hasattr(v, "item") and not isinstance(v, (str, bool)):
                try:
                    return v.item()
                except Exception:
                    return str(v)
            return v

        sc = SchemaColumn(
            dataset_id=dataset.id,
            name=col,
            data_type=dtype,
            nullable=bool(df[col].isnull().any()),
            unique_count=int(df[col].nunique()),
            null_count=int(df[col].isnull().sum()),
            sample_values=[_js(v) for v in df[col].dropna().head(5).tolist()],
            semantic_type=semantic,
            statistics={
                "mean": float(df[col].mean()) if df[col].dtype in ("float64", "int64") else None,
                "std": float(df[col].std()) if df[col].dtype in ("float64", "int64") else None,
                "min": float(df[col].min()) if df[col].dtype in ("float64", "int64") else None,
                "max": float(df[col].max()) if df[col].dtype in ("float64", "int64") else None,
            },
        )
        db.add(sc)

    # Create features
    feature_cols = ["energy_kwh", "power_kw", "voltage_v", "current_a", "power_factor",
                    "temperature_c", "humidity_pct", "occupancy_count"]
    for fc in feature_cols:
        ft = Feature(
            dataset_id=dataset.id,
            name=fc,
            feature_type="numerical" if df[fc].dtype in ("float64", "int64") else "categorical",
            source_columns=[fc],
            description=f"Feature: {fc}",
        )
        db.add(ft)

    # Create a workflow run (completed)
    wr = WorkflowRun(
        dataset_id=dataset.id,
        user_id=user.id,
        status="completed",
        current_stage=18,
        stages_completed=list(range(1, 19)),
        completed_at=datetime.utcnow(),
    )
    db.add(wr)
    db.flush()

    # Create some anomalies
    anomaly_records = df[df["is_anomaly"] == True].head(20)
    for _, row in anomaly_records.iterrows():
        a = Anomaly(
            dataset_id=dataset.id,
            timestamp=row["timestamp"],
            asset_id=row["asset_id"],
            anomaly_type=np.random.choice(["energy_spike", "phantom_load", "continuous_overconsumption"]),
            severity=np.random.choice(["low", "medium", "high"]),
            score=round(np.random.uniform(0.5, 1.0), 3),
            confidence=round(np.random.uniform(0.6, 0.95), 3),
            description=f"Anomalous {row['asset_id']} reading: {row['energy_kwh']} kWh at {row['timestamp']}",
        )
        db.add(a)

    db.commit()
    print(f"Seeded: 1 user, 1 dataset ({len(df)} rows), {len(feature_cols)} features, {len(anomaly_records)} anomalies")
    db.close()


if __name__ == "__main__":
    seed()
