"""Dataset endpoints per contract §3.3: list, upload, get, delete, preview, content, refresh.

Router prefix (from main.py): `/api/v1/datasets`.
Importing this module also imports `dataset_service`, which registers the
`library` / `import` stage runners at import time.
"""

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain import anomaly_service, dataset_service
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

router = APIRouter()


@router.get("")
def list_datasets(
    source_type: str | None = Query(None, description="Filter by source type (sample/upload)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.list_datasets(db, source_type=source_type, user=user)


@router.post("/upload")
def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"dataset": dataset_service.register_upload(db, user, file)}


@router.get("/{dataset_id}")
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.get_dataset(db, dataset_id)


@router.get("/{dataset_id}/anomalies")
def list_anomalies(
    dataset_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    severity: str | None = Query(None),
    anomaly_class: str | None = Query(None),
    building_code: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A scoped page of anomalies, plus the counts the UI needs to filter on.

    `anomaly_service.page` was written to do exactly this -- severity, class and
    building filters, with facet counts -- and was never routed, so the anomaly
    page could only ever show campus-wide roll-ups.

    This matters because scoping client-side is arithmetically wrong. The stage
    output carries aggregates (`by_severity`, `by_building`) but not the 2,227
    individual anomalies behind them, so re-summing after a filter cannot
    reproduce totals, excess energy or excess cost. Filtering has to happen
    where the rows are.
    """
    return anomaly_service.page(
        db,
        dataset_id,
        page=page,
        page_size=page_size,
        severity=severity,
        anomaly_class=anomaly_class,
        building_code=building_code,
    )


@router.get("/{dataset_id}/hierarchy")
def dataset_hierarchy(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The estate tree: buildings, floors, and the drill levels this dataset can resolve.

    This was written and never routed. The frontend therefore had no way to
    learn which buildings, floors or devices a dataset actually contains, and
    fell back to the four counts on the dataset row — which say *how many*
    exist, never *which*. Every estate navigator, scope filter and cross-filter
    in the product depends on this endpoint.
    """
    return dataset_service.get_hierarchy(db, dataset_id)


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.delete_dataset(db, user, dataset_id)


@router.get("/{dataset_id}/preview")
def preview_dataset(
    dataset_id: str,
    limit: int = Query(100, ge=0, le=5000),
    start: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.preview_dataset(db, dataset_id, limit=limit, start=start)


@router.get("/{dataset_id}/content")
def content_dataset(
    dataset_id: str,
    limit: int = Query(100, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    format: str = Query("rows", pattern="^(rows|records)$"),
    building: str | None = Query(None, description="Restrict to one building code"),
    floor: str | None = Query(None, description="Restrict to one floor"),
    room: str | None = Query(None, description="Restrict to one room"),
    device: str | None = Query(None, description="Restrict to one device"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A page of readings, narrowed to a part of the estate when a scope is given.

    Without these the scope bar filtered nothing on Explore: the page drew the
    whole campus while the bar claimed a building was selected.
    """
    return dataset_service.dataset_content(
        db,
        dataset_id,
        limit=limit,
        offset=offset,
        fmt=format,
        scope={
            "building": building,
            "floor": floor,
            "room": room,
            "device": device,
        },
    )


@router.post("/{dataset_id}/refresh")
def refresh_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.refresh_dataset(db, user, dataset_id)


@router.get('/{id}/anomalies/chart')
def anomalies_chart(id: str, db: Session = Depends(get_db), filters: dict = None):
    from app.domain import anomaly_service
    return anomaly_service.get_anomaly_chart_data(db, id, filters or {})


@router.get('/{id}/forecast/chart')
def forecast_chart(id: str, db: Session = Depends(get_db), filters: dict = None):
    from app.domain import forecast_service
    return forecast_service.get_prediction_chart_data(db, id, filters or {})
