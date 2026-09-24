"""Auth endpoints per contract §3.2: register, login, me."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token, get_current_user, hash_password, verify_password,
)
from app.db.base import get_db
from app.db.models import AuditLog, User
from app.domain.data import json_safe

router = APIRouter()


class RegisterIn(BaseModel):
    email: str
    password: str
    full_name: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
    }


def _auth_payload(user: User) -> dict:
    token = create_access_token({"sub": user.id})
    return {"access_token": token, "user": _user_payload(user)}


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = (body.email or "").strip().lower()
    if not email or not body.password:
        raise HTTPException(422, "Email and password are required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Email already registered")
    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name or "",
        role="analyst",
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.add(AuditLog(user_id=user.id, action="create", resource_type="user",
                    resource_id=user.id, details={"email": email}))
    db.commit()
    db.refresh(user)
    return json_safe(_auth_payload(user))


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = (body.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    return json_safe(_auth_payload(user))


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return json_safe(_user_payload(user))