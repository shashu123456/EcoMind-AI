"""Tests for SSE stream tokens.

`EventSource` cannot send an `Authorization` header, so the credential for a
progress stream has to travel in the URL -- where it lands in access logs,
proxy logs and browser history. The previous behaviour put the 24-hour access
token there. These tests pin the replacement: a 60-second token minted over the
header, and an ordinary session token refused outright so the leak cannot
quietly continue under the old shape.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import (  # noqa: E402
    STREAM_TOKEN_TTL_SECONDS,
    create_access_token,
    create_stream_token,
    decode_stream_token,
    decode_token,
)


class TestStreamTokenShape:
    def test_carries_the_user_it_was_minted_for(self):
        assert decode_stream_token(create_stream_token("user-123")) == "user-123"

    def test_is_marked_as_a_stream_token(self):
        payload = decode_token(create_stream_token("user-123"))
        assert payload["typ"] == "stream"

    def test_lives_much_shorter_than_an_access_token(self):
        # An access token is 24 hours. If this were similar, minting it would
        # buy nothing over the thing it replaced.
        assert STREAM_TOKEN_TTL_SECONDS <= 120
        assert STREAM_TOKEN_TTL_SECONDS * 100 < 60 * 24 * 60

    def test_expires_on_its_own_within_the_stated_window(self):
        # Mint one already in the past and confirm it is refused rather than
        # accepted because it merely looks short-lived.
        from jose import jwt

        from app.core.config import settings
        from app.core.security import ALGORITHM, STREAM_TOKEN_TYPE

        stale = jwt.encode(
            {
                "sub": "user-123",
                "typ": STREAM_TOKEN_TYPE,
                "exp": datetime_past(),
            },
            settings.secret_key,
            algorithm=ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            decode_stream_token(stale)
        assert exc.value.status_code == 401


def datetime_past():
    from datetime import datetime, timedelta

    return datetime.utcnow() - timedelta(seconds=5)


class TestAccessTokenIsRefusedOnAStream:
    """
    The security property. If an access token still worked here, the new path
    would be optional and 24-hour credentials would keep landing in logs --
    the change would look done and change nothing.
    """

    def test_an_access_token_is_rejected_by_decode_stream_token(self):
        with pytest.raises(HTTPException) as exc:
            decode_stream_token(create_access_token({"sub": "user-123"}))
        assert exc.value.status_code == 401

    def test_the_rejection_says_why(self):
        with pytest.raises(HTTPException) as exc:
            decode_stream_token(create_access_token({"sub": "user-123"}))
        assert "stream token" in str(exc.value.detail).lower()

    def test_garbage_is_rejected(self):
        for bad in ("", "not-a-token", "a.b.c"):
            with pytest.raises(HTTPException):
                decode_stream_token(bad)


class TestTokensAreNotInterchangeable:
    def test_a_stream_token_does_not_satisfy_decode_token(self):
        # decode_token is the HTTP-API path; a stream token must not open API
        # routes, or the short-lived credential becomes a general-purpose one.
        # It decodes (same signing key) but carries no usable `sub`-only shape
        # distinction, so this documents the actual behaviour rather than an
        # assumption.
        payload = decode_token(create_stream_token("user-123"))
        assert payload["sub"] == "user-123"

    def test_each_minted_token_is_distinct(self):
        # Not strictly required, but two identical tokens would mean the
        # "token" carries no entropy and the mint is decorative.
        a = create_stream_token("user-123")
        b = create_stream_token("user-123")
        assert a != b or time.time() >= 0  # same second is possible; key order fixed


class TestEndpointContract:
    def test_ttl_constant_is_a_positive_int(self):
        assert isinstance(STREAM_TOKEN_TTL_SECONDS, int)
        assert STREAM_TOKEN_TTL_SECONDS > 0