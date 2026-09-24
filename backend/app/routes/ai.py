"""AI assistant, timeline, confidence gate and executive summary routes.

Ownership: S2/S4 shared. Contract: docs/API_CONTRACT.md §3.14/§3.17.
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.conversation_service import chat, timeline
from app.domain.executive_service import summary as executive_summary
from app.domain.trust_service import evaluate, gate_payload, latest_gate
from app.domain.data import json_safe

router = APIRouter()


@router.post("/chat")
def ai_chat(body: dict = Body(...), db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    msg = (body or {}).get("message") or ""
    if not msg:
        raise HTTPException(422, "message is required")
    return chat(db, user, msg, body.get("dataset_id"), body.get("run_id"), body.get("stage_context"))


@router.get("/{dataset_id}/timeline")
def ai_timeline(dataset_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return timeline(db, dataset_id)


@router.get("/{dataset_id}/confidence")
def confidence_get(dataset_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    g = latest_gate(db, dataset_id)
    return {"gate": json_safe(gate_payload(g)) if g else None}


@router.post("/{dataset_id}/confidence/evaluate")
def confidence_evaluate(dataset_id: str, body: dict | None = None, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    g = evaluate(db, dataset_id, body or {})
    return {"gate": json_safe(gate_payload(g))}


@router.get("/{dataset_id}/executive")
def executive_get(dataset_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    return {"summary": json_safe(executive_summary(db, dataset_id))}