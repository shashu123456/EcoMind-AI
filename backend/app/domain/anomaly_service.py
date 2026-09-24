"""Anomaly detection service (ensemble: IsolationForest + zscore + rules).

Ownership: S4. Contract: docs/API_CONTRACT.md §3.10.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import Anomaly
from app.domain.data import json_safe
from app.domain.dataset_service import load_dataframe, audit


def _anomaly_payload(a: Anomaly) -> dict:
    return {
        "id": a.id, "dataset_id": a.dataset_id, "timestamp": a.timestamp.isoformat() if a.timestamp else None,
        "asset_id": a.asset_id, "anomaly_type": a.anomaly_type, "severity": a.severity,
        "score": round(float(a.score or 0.0), 3), "confidence": round(float(a.confidence or 0.0), 3),
        "is_confirmed": bool(a.is_confirmed), "description": a.description or "",
        "context": a.context or {}, "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def list_anomalies(db: Session, dataset_id: str, limit: int = 200, severity: str | None = None):
    q = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id)
    if severity:
        q = q.filter(Anomaly.severity == severity)
    rows = q.order_by(Anomaly.timestamp.desc()).limit(limit).all()
    by_type, by_sev = {}, {}
    for r in rows:
        by_type[r.anomaly_type] = by_type.get(r.anomaly_type, 0) + 1
        by_sev[r.severity] = by_sev.get(r.severity, 0) + 1
    return {"anomalies": json_safe([_anomaly_payload(r) for r in rows]), "total": len(rows),
            "by_type": by_type, "by_severity": by_sev}


def confirm(db: Session, dataset_id: str, anomaly_id: str, is_confirmed: bool) -> Anomaly:
    a = db.query(Anomaly).filter(Anomaly.id == anomaly_id,
                                 Anomaly.dataset_id == dataset_id).first()
    if not a:
        raise ValueError(f"Anomaly '{anomaly_id}' not found")
    a.is_confirmed = bool(is_confirmed)
    db.commit()
    db.refresh(a)
    return a


def _scores(df: pd.DataFrame) -> pd.DataFrame:
    """Return updated df with columns _iso, _z, _rule, _score."""
    out = df.copy()
    feats = ["energy_kwh", "power_kw", "voltage_v", "current_a", "power_factor",
             "temperature_c", "humidity_pct", "occupancy_count"]
    feats = [c for c in feats if c in out.columns]
    X = pd.to_numeric(out[feats].stack(), errors="coerce").unstack().ffill().fillna(0)
    if len(feats):
        from sklearn.ensemble import IsolationForest
        iso = IsolationForest(contamination=0.05, random_state=7)
        try:
            out["_iso"] = -iso.fit_predict(X.values)
        except Exception:
            out["_iso"] = 0.0
    else:
        out["_iso"] = 0.0

    zs = np.zeros(len(out))
    energy = pd.to_numeric(out.get("energy_kwh", out.get("power_kw", pd.Series(0.0, index=out.index))),
                           errors="coerce")
    if "asset_id" in out.columns:
        for _, grp in out.groupby("asset_id"):
            s = pd.to_numeric(grp.get("energy_kwh", grp.get("power_kw")), errors="coerce")
            mean, std = s.mean(), s.std()
            if std and std > 0:
                zs[grp.index] = (s - mean).abs() / std
    else:
        mean, std = energy.mean(), energy.std()
        if std and std > 0:
            zs = (energy - mean).abs() / std
    out["_z"] = zs

    rule = np.zeros(len(out), dtype=int)
    occupancy = out.get("occupancy_count")
    if occupancy is not None and ("timestamp" in out.columns or len(out.columns) and pd.api.types.is_datetime64_any_dtype(out.iloc[:, 0].dtype)):
        ts_col = "timestamp" if "timestamp" in out.columns else out.columns[0]
        dt = pd.to_datetime(out[ts_col])
        night = np.asarray((dt.dt.hour >= 23) | (dt.dt.hour <= 5), dtype=bool)
        enum = pd.to_numeric(occupancy, errors="coerce")
        nz = np.asarray(enum.fillna(0).astype(int))
        rule[night] |= (nz[night] > 2).astype(int)
        dev = np.asarray(np.abs(pd.to_numeric(energy, errors="coerce") - float(np.nanmean(energy))) > 2 * float(np.nanstd(energy) or 0))
        rule[night] |= ((nz[night] == 0) & dev[night]).astype(int)
    out["_rule"] = rule

    out["_score"] = ((out["_iso"] * 0.4 + out["_z"].clip(0, 4) / 4 * 0.4 + out["_rule"] * 0.5) / 1.3).clip(0, 1)
    out["_iso"] = out["_iso"].clip(0, 1)
    return out


def _type_of(score, z, rule, energy):
    if rule:
        return "night_usage" if rule else "phantom_load"
    if z > 3.5:
        return "energy_spike"
    if z > 2.5:
        return "continuous_overconsumption"
    return "energy_spike"


def detect(db: Session, dataset_id: str, params: dict | None = None):
    from app.db.models import Dataset
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    df = load_dataframe(db, dataset_id, use_processed=True)[1]
    if "is_anomaly" not in df.columns:
        df["is_anomaly"] = 0
    t0 = time.time()
    scored = _scores(df)
    thr = (params or {}).get("threshold") or 0.6

    mask = scored["_score"] >= thr
    rows = []
    positions = [p for p in range(len(scored)) if mask.iloc[p]]
    for pos in positions:
        row = scored.iloc[pos]
        ts = pd.to_datetime(row.get("timestamp", pd.Timestamp("now")))
        sev = _severity(row["_score"], row["_z"])
        energy = float(row.get("energy_kwh", row.get("power_kw", 0.0)) or 0.0)
        expected = float(row.get("rolling_mean_24h", 0.0) or 0.0)
        dev = ((energy - expected) / max(abs(expected), 1e-9)) * 100 if expected else 0.0
        ctx = {
            "reading_value": round(energy, 3),
            "expected_value": round(expected, 3),
            "deviation_pct": round(dev, 1),
            "nearby_readings": [round(float(v), 2) for v in
                                scored.iloc[max(pos - 3, 0):max(pos - 1, 0), :]["energy_kwh"].tolist()]
            if "energy_kwh" in scored.columns else [],
        }
        rows.append({
            "dataset_id": dataset_id,
            "timestamp": ts.to_pydatetime(),
            "asset_id": str(row.get("asset_id")) if row.get("asset_id") is not None else None,
            "anomaly_type": _type_of(row["_score"], row["_z"], row["_rule"], energy),
            "severity": sev,
            "score": round(float(row["_score"]), 3),
            "confidence": round(float(min(1.0, 0.5 + row["_score"])), 3),
            "is_confirmed": False,
            "description": f"Score {row['_score']:.2f} (z={row['_z']:.1f}, iso={row['_iso']:.2f}); expected {expected:.2f} vs {energy:.2f}",
            "context": ctx,
        })

    # replace prior unconfirmed rows for this dataset
    prior = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id,
                                     Anomaly.is_confirmed.is_(False)).all()
    for p in prior:
        db.delete(p)
    for r in rows:
        db.add(Anomaly(**r))
    audit(db, None, "execute", "anomaly", dataset_id, {"detected": len(rows)})
    db.commit()

    ground = None
    if "is_anomaly" in scored.columns:
        try:
            ground = pd.to_numeric(scored["is_anomaly"], errors="coerce").fillna(0).astype(int)
        except Exception:
            ground = None
    prec, rec = None, None
    if ground is not None and int(ground.sum()) > 0:
        pred = (scored["_score"] >= thr).astype(int)
        tp = int(((pred == 1) & (ground == 1)).sum())
        prec = round(tp / max(int(pred.sum()), 1), 3)
        rec = round(tp / int(ground.sum()), 3)

    stored = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id) \
        .order_by(Anomaly.timestamp.desc()).limit(200).all()
    by_type, by_sev = {}, {}
    for s in stored:
        by_type[s.anomaly_type] = by_type.get(s.anomaly_type, 0) + 1
        by_sev[s.severity] = by_sev.get(s.severity, 0) + 1
    return {"anomalies": json_safe([_anomaly_payload(s) for s in stored]),
            "detected_count": len(rows), "total": len(stored),
            "by_type": by_type, "by_severity": by_sev,
            "precision": prec, "recall": rec,
            "elapsed_ms": round((time.time() - t0) * 1000, 1)}


def _severity(score, z):
    if score > 0.9 or z > 4:
        return "critical"
    if score > 0.8 or z > 3:
        return "high"
    if score > 0.7:
        return "medium"
    return "low"


def anomaly_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = detect(db, dataset_id, params)
    return {"output": result,
            "confidence": float(result.get("precision") or 0.7),
            "decision": f"Detected {result['detected_count']} anomalies (precision={result.get('precision')}, recall={result.get('recall')})"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("anomaly")(anomaly_stage)