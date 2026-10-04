"""Tests for password hashing.

These exist because of a specific, confirmed break. `requirements.txt` pinned
`passlib[bcrypt]==1.7.4` but left `bcrypt` unpinned, so the working tree kept
working on bcrypt 4.0.1 from years of history while a fresh `pip install`
resolved bcrypt 5.0.0 -- where passlib raises

    ValueError: password cannot be longer than 72 bytes

the moment it probes the backend. On a bare clone that crashed the seeder, so
the app came up with no user at all and no way to log in. These tests pin the
behaviour that replaced it.
"""

from __future__ import annotations

import bcrypt
import pytest

from app.core.security import (
    BCRYPT_MAX_BYTES,
    hash_password,
    verify_password,
)


class TestRoundTrip:
    def test_a_correct_password_verifies(self):
        assert verify_password("admin123", hash_password("admin123")) is True

    def test_a_wrong_password_does_not(self):
        assert verify_password("admin124", hash_password("admin123")) is False

    def test_an_empty_password_still_round_trips(self):
        # Not a policy statement -- just that the empty string is a valid input
        # to the primitive and must not raise.
        assert verify_password("", hash_password("")) is True

    def test_hashes_are_salted(self):
        # Two hashes of the same password must differ, or the database leaks
        # which accounts share a password.
        assert hash_password("admin123") != hash_password("admin123")

    def test_hash_is_a_self_describing_bcrypt_string(self):
        digest = hash_password("admin123")
        assert digest.startswith("$2b$")
        assert len(digest) == 60

    def test_unicode_passwords_work(self):
        assert verify_password("pässwörd✓", hash_password("pässwörd✓")) is True


class TestLongPasswords:
    """
    bcrypt hashes at most 72 bytes and ignores the rest. That is a property of
    the algorithm, not of any library wrapping it.
    """

    def test_a_password_at_the_limit_is_accepted(self):
        password = "a" * BCRYPT_MAX_BYTES
        assert verify_password(password, hash_password(password)) is True

    def test_a_password_over_the_limit_is_truncated_not_rejected(self):
        # passlib truncated silently; bcrypt 4.1+ raises instead. Truncating
        # here keeps long passwords working exactly as they used to.
        password = "a" * (BCRYPT_MAX_BYTES + 40)
        assert verify_password(password, hash_password(password)) is True

    def test_truncation_is_at_the_byte_level_not_the_character_level(self):
        # A multi-byte character straddling the boundary must not raise a
        # UnicodeEncodeError when the bytes are cut.
        password = "é" * 100  # 200 UTF-8 bytes
        assert verify_password(password, hash_password(password)) is True

    def test_two_passwords_sharing_the_first_72_bytes_collide(self):
        # Documents the real consequence of the limit rather than hiding it.
        first = "a" * BCRYPT_MAX_BYTES + "ONE"
        second = "a" * BCRYPT_MAX_BYTES + "TWO"
        assert verify_password(first, hash_password(first)) is True
        assert verify_password(second, hash_password(second)) is True
        assert verify_password(second, hash_password(first)) is True


class TestMalformedHashes:
    """A corrupt credential row is a failed login, never a 500."""

    @pytest.mark.parametrize(
        "stored",
        ["", "not-a-hash", "$2b$", "$2b$12$tooshort", "x" * 200],
    )
    def test_verify_returns_false_rather_than_raising(self, stored):
        assert verify_password("admin123", stored) is False

    def test_verify_returns_actual_booleans_not_truthy_values(self):
        # Callers branch on this, so a truthy non-bool would be a latent bug.
        assert verify_password("admin123", hash_password("admin123")) is True
        assert verify_password("nope", hash_password("admin123")) is False


class TestHashesWrittenByTheOldImplementation:
    """
    Existing databases contain hashes written by passlib + bcrypt 4.0.1. Those
    must keep verifying, or every deployed user is locked out by this change.
    """

    def test_a_passlib_style_hash_still_verifies(self):
        legacy = bcrypt.hashpw(b"admin123", bcrypt.gensalt(rounds=12)).decode()
        assert verify_password("admin123", legacy) is True
        assert verify_password("wrong", legacy) is False

    def test_a_2a_prefixed_hash_still_verifies(self):
        # Older bcrypt emitted $2a$; checkpw accepts it and must keep doing so.
        digest = bcrypt.hashpw(b"admin123", bcrypt.gensalt(rounds=12)).decode()
        legacy_prefixed = "$2a$" + digest[4:]
        assert verify_password("admin123", legacy_prefixed) is True
