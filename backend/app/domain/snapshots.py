"""AnalyticsSnapshot reads and writes.

Ownership: S3.

Five stages (transformation, model selection, anomaly, forecast,
recommendation) each compute an expensive derived answer and each need to serve
it again on page load, on a re-run, and inside a stage trace. Recomputing on
read would mean a page load re-runs a model race.

So each stage writes one `analytics_snapshots` row under a (kind, scope) and
reads it back. The snapshot is the answer; the tables the stage wrote (models,
anomalies, forecasts) are the working set behind it. When they disagree the
snapshot is the one the user was shown, which is the one that has to be
defensible.

`ix_analytics_snapshots_unique` is on (dataset_id, kind, scope), so this module
replaces rather than appends: re-running a stage overwrites the previous answer
instead of leaving a pile of stale ones for a reader to choose between. The
per-stage tables keep the history; the snapshot is the current answer.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.db.models import AnalyticsSnapshot, ArtifactVersion
from app.domain.data import json_safe
from sqlalchemy.orm import Session

#: Every snapshot kind the platform writes, so a typo is a loud failure rather
#: than a row nobody ever reads.
SNAPSHOT_KINDS = (
    "transformation",
    "model_selection",
    "anomaly",
    "forecast",
    "recommendation",
    "report",
    "hierarchy",
    "baseline",
)

#: Scope used when a kind has exactly one answer per dataset.
DEFAULT_SCOPE = "__all__"


def snapshot(
    db: Session,
    dataset_id: str,
    kind: str,
    payload: dict,
    scope: str = DEFAULT_SCOPE,
    row_count: int | None = None,
    run_id: str | None = None,
) -> dict:
    """Persist one derived answer, replacing any previous answer for the slot.

    The slot replacement keeps one current answer; the append-only
    `artifact_versions` ledger written alongside it keeps every previous one,
    so an old analysis can be reopened against the exact artifact it used.
    """
    if kind not in SNAPSHOT_KINDS:
        raise ValueError(f"Unknown snapshot kind '{kind}'. Known: {SNAPSHOT_KINDS}")
    scope = scope or DEFAULT_SCOPE
    db.query(AnalyticsSnapshot).filter(
        AnalyticsSnapshot.dataset_id == dataset_id,
        AnalyticsSnapshot.kind == kind,
        AnalyticsSnapshot.scope == scope,
    ).delete(synchronize_session=False)
    now = datetime.now(timezone.utc)
    db.add(
        AnalyticsSnapshot(
            dataset_id=dataset_id,
            run_id=run_id,
            kind=kind,
            scope=scope,
            payload=json_safe(payload),
            row_count=row_count,
            computed_at=now,
        )
    )
    # Append-only version ledger: monotonic per (dataset, kind, scope).
    last = (
        db.query(ArtifactVersion.version)
        .filter(
            ArtifactVersion.dataset_id == dataset_id,
            ArtifactVersion.kind == kind,
            ArtifactVersion.scope == scope,
        )
        .order_by(ArtifactVersion.version.desc())
        .first()
    )
    db.add(
        ArtifactVersion(
            dataset_id=dataset_id,
            run_id=run_id,
            kind=kind,
            scope=scope,
            version=(last[0] if last else 0) + 1,
            payload=json_safe(payload),
            row_count=row_count,
            computed_at=now,
        )
    )
    return payload


def _query(db: Session, kind: str, dataset_id: str | None, scope: str | None):
    q = db.query(AnalyticsSnapshot).filter(AnalyticsSnapshot.kind == kind)
    if dataset_id is not None:
        q = q.filter(AnalyticsSnapshot.dataset_id == dataset_id)
    if scope is not None:
        q = q.filter(AnalyticsSnapshot.scope == scope)
    return q


def latest_row(
    db: Session, kind: str, dataset_id: str | None = None, scope: str | None = None
) -> AnalyticsSnapshot | None:
    """The snapshot row itself, for callers that need its timestamps."""
    return (
        _query(db, kind, dataset_id, scope)
        .order_by(AnalyticsSnapshot.computed_at.desc(), AnalyticsSnapshot.id.desc())
        .first()
    )


def latest_snapshot(
    db: Session, kind: str, dataset_id: str | None = None, scope: str | None = None
) -> dict | None:
    """The newest snapshot payload for a kind."""
    row = latest_row(db, kind, dataset_id, scope)
    return (row.payload or {}) if row else None


def all_scopes(db: Session, kind: str, dataset_id: str) -> list[AnalyticsSnapshot]:
    """Every scope written for a kind, newest first.

    Forecast writes one snapshot per horizon and recommendation one per device
    group, so a reader asking for "the forecast" has to know which scopes exist.
    """
    return _query(db, kind, dataset_id, None).order_by(AnalyticsSnapshot.computed_at.desc()).all()


def payload_of(row: AnalyticsSnapshot | None) -> dict[str, Any] | None:
    return (row.payload or {}) if row else None


def clear(db: Session, dataset_id: str, kinds: tuple[str, ...] | None = None) -> None:
    """Drop snapshots for a dataset. Called by the dataset cascade.

    Left in place, these outlive the dataset they describe and keep serving a
    deleted dataset's numbers. The version ledger is cleared with them for the
    same reason.
    """
    q = db.query(AnalyticsSnapshot).filter(AnalyticsSnapshot.dataset_id == dataset_id)
    vq = db.query(ArtifactVersion).filter(ArtifactVersion.dataset_id == dataset_id)
    if kinds:
        q = q.filter(AnalyticsSnapshot.kind.in_(kinds))
        vq = vq.filter(ArtifactVersion.kind.in_(kinds))
    q.delete(synchronize_session=False)
    vq.delete(synchronize_session=False)


def list_versions(
    db: Session, dataset_id: str, kind: str, scope: str = DEFAULT_SCOPE
) -> list[dict]:
    """Every stored version of one artifact, newest first (metadata only)."""
    rows = (
        db.query(ArtifactVersion)
        .filter(
            ArtifactVersion.dataset_id == dataset_id,
            ArtifactVersion.kind == kind,
            ArtifactVersion.scope == scope,
        )
        .order_by(ArtifactVersion.version.desc())
        .all()
    )
    return [
        {
            "version": r.version,
            "kind": r.kind,
            "scope": r.scope,
            "row_count": r.row_count,
            "run_id": r.run_id,
            "computed_at": r.computed_at.isoformat() if r.computed_at else None,
        }
        for r in rows
    ]


def get_version(
    db: Session, dataset_id: str, kind: str, version: int, scope: str = DEFAULT_SCOPE
) -> dict | None:
    """Reopen one exact artifact version — the payload the old run saw."""
    row = (
        db.query(ArtifactVersion)
        .filter(
            ArtifactVersion.dataset_id == dataset_id,
            ArtifactVersion.kind == kind,
            ArtifactVersion.scope == scope,
            ArtifactVersion.version == version,
        )
        .first()
    )
    return (row.payload or {}) if row else None
