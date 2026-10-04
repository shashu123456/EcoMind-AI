"""JWT authentication utilities."""

import re
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db.base import get_db
from ..db.models import User

security_scheme = HTTPBearer()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

#: Marker claim distinguishing a stream token from an access token.
STREAM_TOKEN_TYPE = "stream"

#: Long enough to survive a slow page load between minting and connecting, far
#: too short to be worth harvesting from a log file.
STREAM_TOKEN_TTL_SECONDS = 60

#: bcrypt hashes at most this many bytes of input and ignores the rest. It is a
#: property of the algorithm, not of this library, and every bcrypt
#: implementation behaves the same way.
BCRYPT_MAX_BYTES = 72

#: Cost factor. 12 is bcrypt's own current default; the value only affects how
#: long hashing takes, never whether a hash verifies, so existing hashes stay
#: valid if it is ever changed.
BCRYPT_ROUNDS = 12


def _password_bytes(password: str) -> bytes:
    """Encode a password for bcrypt, truncated to the limit the algorithm has.

    Truncation is explicit here because it is not optional: bcrypt 4.1 and later
    raise `ValueError` on longer input rather than silently ignoring the tail.
    Doing the truncation ourselves keeps long passwords working exactly as they
    did under passlib, which truncated without saying so.
    """
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    """Hash a password with bcrypt, returning a self-describing `$2b$` string.

    Called directly on the `bcrypt` library rather than through passlib.
    passlib 1.7.4 was last released in 2020 and breaks against bcrypt 4.1+,
    where it raises `ValueError: password cannot be longer than 72 bytes` the
    moment it probes the backend -- so a fresh install could not create a user
    at all. The working tree had survived only because its virtualenv predated
    bcrypt 4.1. The maintained library has no such coupling.
    """
    return bcrypt.hashpw(
        _password_bytes(password), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    ).decode("utf-8")


#: What a stored bcrypt digest actually looks like: `$2<variant>$`, two rounds
#: digits, `$`, then 53 base64 characters (22 of salt and 31 of digest).
#:
#: This exists because bcrypt is a Rust extension that *panics* on a malformed
#: digest rather than returning an error. The raised `PanicException` derives
#: from `BaseException`, not `Exception`, so ordinary `except Exception`
#: handling does not catch it -- a single corrupt row in the users table would
#: take the request down with it. Validating first means the extension is never
#: handed input it cannot parse.
_BCRYPT_HASH_RE = re.compile(r"^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$")


def verify_password(plain: str, hashed: str) -> bool:
    """Check a password against a stored hash. Never raises on a bad hash.

    A malformed or truncated hash in the database is a failed login, not a
    crash: it means the row is corrupt, and the correct response to corrupt
    credential storage is to refuse the login quietly.
    """
    if not hashed or not isinstance(hashed, str):
        return False
    if not _BCRYPT_HASH_RE.match(hashed):
        return False
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False
    except BaseException:
        # bcrypt's Rust core raises a pyo3 `PanicException`, which descends
        # from BaseException and so is invisible to `except Exception`. The
        # format check above should make this unreachable; it stays because a
        # panic here would otherwise abort the worker handling the login.
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def create_stream_token(user_id: str) -> str:
    """Mint a short-lived token that authorises exactly one SSE stream.

    The `EventSource` API cannot set an `Authorization` header, so the stream
    has to carry its credential in the URL -- which means it lands in access
    logs, proxy logs and browser history. Putting the 24-hour access token
    there means anyone who can read a log holds a working session.

    This is the same trade with the blast radius cut down: 60 seconds of life,
    one purpose, and no API surface of its own. A leaked one is worthless long
    before it expires.
    """
    expire = datetime.utcnow() + timedelta(seconds=STREAM_TOKEN_TTL_SECONDS)
    return jwt.encode(
        {"sub": user_id, "typ": STREAM_TOKEN_TYPE, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_stream_token(token: str) -> str:
    """Validate a stream token and return the user id it was minted for.

    Refuses an ordinary access token even though that one would decode fine.
    The whole point is that a session token stops being usable in a URL; if
    both worked, the new path would be optional and nothing would change.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired stream token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("typ") != STREAM_TOKEN_TYPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a stream token",
        )
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    return str(sub)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_role(*roles):
    """Dependency factory: require_role('admin', 'analyst')"""

    async def _check(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=f"Role '{user.role}' not in {roles}")
        return user

    return _check
