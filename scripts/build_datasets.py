"""Generate the EcoMind starter dataset catalog to CSV without touching the database.

The launcher/seed registers these datasets automatically at setup, so a fresh
clone always has data. This CLI is the offline escape hatch: it writes the same
deterministic CSVs straight to disk so they can be inspected, re-used, or
imported manually through the Library.

Usage:
    python scripts/build_datasets.py                # all datasets, 90 days
    python scripts/build_datasets.py --dataset faulty --days 30
    python scripts/build_datasets.py --out backend/data/generated
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import settings  # noqa: E402
from app.domain.synth import build_campus, build_reference  # noqa: E402

CATALOG = {
    "healthy": ("ecomind_healthy_campus.csv", "healthy"),
    "faulty": ("ecomind_fault_campus.csv", "faulty"),
    "reference": ("ecomind_reference_meters.csv", "reference"),
}


def _build(name: str, days: int, seed: int):
    if name == "reference":
        built = build_reference()
        if built is None:
            print(
                "skipped reference: backend/data/sample/"
                "ecomind_bdg2_3yr_real.csv not found"
            )
            return None
        return built
    return build_campus(profile=name, days=days, seed=seed)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the EcoMind dataset catalog")
    parser.add_argument(
        "--dataset",
        choices=[*CATALOG, "all"],
        default="all",
        help="which dataset to build",
    )
    parser.add_argument("--days", type=int, default=90, help="days of hourly history")
    parser.add_argument("--seed", type=int, default=42, help="random seed")
    parser.add_argument(
        "--out",
        type=Path,
        default=settings.generated_dir,
        help="output directory for the CSV files",
    )
    args = parser.parse_args()

    names = list(CATALOG) if args.dataset == "all" else [args.dataset]
    args.out.mkdir(parents=True, exist_ok=True)

    written = 0
    for name in names:
        built = _build(name, args.days, args.seed)
        if built is None:
            continue
        frame, _tree, _meta = built
        csv_name = CATALOG[name][0]
        target = args.out / csv_name
        frame.to_csv(target, index=False)
        written += 1
        print(f"wrote {target}  ({len(frame):,} rows x {frame.shape[1]} cols)")

    print(f"done: {written} dataset(s) written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
