'''Model competition routes'''
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.domain import model_competition

router = APIRouter(prefix="/competitions", tags=["competition"])


@router.post("/models/{dataset_id}")
def run_model_competition(dataset_id: str, db: Session = Depends(get_db), params: dict = None):
    return model_competition.run_competition(db, dataset_id, params or {})
