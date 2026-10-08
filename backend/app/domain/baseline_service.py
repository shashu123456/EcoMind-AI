# Baseline service: generate adaptive baseline from dataset history.
# Core principle: baselines are generated from the dataset itself, never external.
#
# The baseline answers "what does normal look like here?" for three downstream
# consumers: anomaly (deviation from normal), forecast (what to build on), and
# recommendations (what to compare against). It is versioned: each regeneration
# bumps `version` and keeps the previous snapshot payload in `history` so an
# older analysis can still be reopened against the baseline it was scored with.
def generate_baseline(db, dataset_id, params=None):
    """Generate adaptive baseline from dataset historical data.

    Produces: overall statistics, per-device hour-of-week patterns, trend
    (short vs long window), seasonality (daily/weekly/yearly strength), and
    operational patterns (active hours, weekend factor, peak period).
    """
    from app.domain import snapshots
    from app.domain.dataset_service import audit, load_dataframe
    from app.workflow.events import emit
    from datetime import datetime, timezone
    import pandas as pd

    params = params or {}
    ds, df = load_dataframe(db, dataset_id, use_processed=True)
    target = None
    for c in ['energy_kwh', 'power_kw', 'energy']:
        if c in df.columns:
            target = c
            break
    if not target:
        raise ValueError(f"No energy column found in dataset {dataset_id}")

    ts = None
    for c in ['timestamp', 'ts', 'datetime', 'date_time']:
        if c in df.columns:
            ts = c
            break
    if not ts:
        raise ValueError("No timestamp column found")

    device_col = None
    for c in ['device_id', 'device_code', 'asset_id', 'meter_id']:
        if c in df.columns:
            device_col = c
            break

    frame = df.copy()
    frame[ts] = pd.to_datetime(frame[ts], errors='coerce')
    frame[target] = pd.to_numeric(frame[target], errors='coerce')
    frame = frame.dropna(subset=[ts, target]).sort_values(ts)

    values = frame[target]
    hour = frame[ts].dt.hour
    dow = frame[ts].dt.dayofweek  # 0=Mon .. 6=Sun

    # ── overall statistics ──
    stats = {
        'mean': float(values.mean()),
        'median': float(values.median()),
        'std': float(values.std()),
        'min': float(values.min()),
        'max': float(values.max()),
        'p25': float(values.quantile(0.25)),
        'p75': float(values.quantile(0.75)),
        'p95': float(values.quantile(0.95)),
    }

    # ── hour-of-week pattern: the core "normal at this moment" table ──
    # 168 cells (7 days x 24 hours); cells without data stay null so consumers
    # know "no evidence" rather than silently averaging a sparse cell.
    how = {}
    grouped = frame.groupby([dow, hour])[target]
    for (d, h), g in grouped:
        how[f"{int(d)}-{int(h)}"] = {
            'median': round(float(g.median()), 4),
            'mean': round(float(g.mean()), 4),
            'count': int(len(g)),
        }

    # ── per-device hour-of-week medians (anomaly engine input) ──
    per_device = {}
    if device_col:
        for dev, g in frame.groupby(device_col):
            dev_how = {}
            for (d, h), gg in g.groupby([g[ts].dt.dayofweek, g[ts].dt.hour])[target]:
                dev_how[f"{int(d)}-{int(h)}"] = round(float(gg.median()), 4)
            per_device[str(dev)] = {
                'hour_of_week': dev_how,
                'median': round(float(g[target].median()), 4),
                'row_count': int(len(g)),
            }

    # ── trend: split the range in half, compare like-for-like daily means ──
    mid = frame[ts].min() + (frame[ts].max() - frame[ts].min()) / 2
    first_half = frame[frame[ts] < mid][target]
    second_half = frame[frame[ts] >= mid][target]
    trend = {'direction': 'flat', 'slope_pct': 0.0}
    if len(first_half) >= 2 and len(second_half) >= 2 and first_half.mean():
        slope = (second_half.mean() - first_half.mean()) / abs(first_half.mean()) * 100.0
        trend = {
            'direction': 'rising' if slope > 3 else ('falling' if slope < -3 else 'flat'),
            'slope_pct': round(float(slope), 2),
            'first_half_mean': round(float(first_half.mean()), 4),
            'second_half_mean': round(float(second_half.mean()), 4),
        }

    # ── seasonality: how much of the variance the hour-of-week table explains ──
    # Strength near 1 = rigid schedule, near 0 = no recurring shape.
    seasonality = {'daily_strength': 0.0, 'weekly_strength': 0.0}
    if len(values) >= 48:
        overall_var = float(values.var()) if float(values.var()) > 0 else 1.0
        hourly_means = frame.groupby(hour)[target].transform('mean')
        seasonality['daily_strength'] = round(
            max(0.0, 1.0 - float(((values - hourly_means) ** 2).mean()) / overall_var), 3
        )
        how_means = frame.groupby([dow, hour])[target].transform('mean')
        seasonality['weekly_strength'] = round(
            max(0.0, 1.0 - float(((values - how_means) ** 2).mean()) / overall_var), 3
        )

    # ── operational patterns: when this site actually runs ──
    hourly_means = values.groupby(hour).mean()
    active_hours = sorted(int(h) for h in hourly_means.index if hourly_means.loc[h] > stats['median'] * 0.5)
    weekday_mask = dow < 5
    weekend_mask = ~weekday_mask
    ops = {
        'active_hours': active_hours,
        'weekday_mean': round(float(frame.loc[weekday_mask, target].mean()), 4)
        if weekday_mask.any() else None,
        'weekend_mean': round(float(frame.loc[weekend_mask, target].mean()), 4)
        if weekend_mask.any() else None,
        'weekend_factor': None,
        'peak_hour': int(values.groupby(hour).mean().idxmax()),
    }
    if ops['weekday_mean'] and ops['weekend_mean'] is not None:
        ops['weekend_factor'] = round(ops['weekend_mean'] / ops['weekday_mean'], 3)

    # ── versioning: bump version, keep prior payload reachable ──
    prev = snapshots.latest_snapshot(db, 'baseline', dataset_id)
    version = int(prev.get('version', 0)) + 1 if prev else 1
    history = list(prev.get('history', []))[-9:] if prev else []
    if prev:
        history.append({
            'version': prev.get('version'),
            'generated_at': prev.get('generated_at'),
            'statistics': prev.get('statistics'),
            'method': prev.get('method'),
        })

    baseline = {
        'dataset_id': dataset_id,
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'target_column': target,
        'unit': 'kWh' if 'kwh' in target.lower() else ('kW' if 'kw' in target.lower() else ''),
        'device_column': device_col,
        'row_count': int(len(frame)),
        'date_range': {
            'start': frame[ts].min().isoformat(),
            'end': frame[ts].max().isoformat(),
        },
        'statistics': stats,
        'hour_of_week': how,
        'per_device': per_device,
        'trend': trend,
        'seasonality': seasonality,
        'operational_patterns': ops,
        'method': 'adaptive_dataset_driven',
        'version': version,
        'history': history,
    }
    snapshots.snapshot(db, dataset_id, 'baseline', baseline)
    audit(db, None, "execute", "baseline", dataset_id,
          {"version": version, "method": "adaptive_dataset_driven", "rows": int(len(frame))})
    emit(params.get('run'), "baseline_generated",
         version=version, target=target, rows=int(len(frame)))
    return baseline
