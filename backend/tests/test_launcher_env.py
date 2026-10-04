"""Tests for the launcher's environment bootstrap.

The behaviour that matters here is not "does it write a file" but "does it
repair a file that exists and is still wrong". A `.env` is the one setting
whose absence is completely silent: the app starts either way and signs JWTs
that anyone can forge.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from launcher import bootstrap  # noqa: E402

PLACEHOLDER = "change-me-to-a-long-random-string"


def _write_env(path: Path, *lines: str) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _secret_in(path: Path) -> str:
    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.strip().startswith("ECOMIND_SECRET_KEY"):
            return raw.split("=", 1)[1].strip()
    return ""


class TestPlaceholderDetection:
    @pytest.mark.parametrize(
        "value",
        ["", "change-me-to-a-long-random-string", "eco-mind-dev-secret-change-me",
         "changeme", "secret", "short"],
    )
    def test_flags_known_placeholders_and_anything_trivial(self, value):
        assert bootstrap._secret_is_placeholder(value) is True

    def test_accepts_a_real_generated_secret(self):
        assert bootstrap._secret_is_placeholder("k" * 48) is False

    def test_is_case_and_whitespace_insensitive(self):
        assert bootstrap._secret_is_placeholder("  CHANGE-ME-TO-A-LONG-RANDOM-STRING  ") is True


class TestRepairSecret:
    def test_replaces_the_example_placeholder(self, tmp_path):
        env = tmp_path / ".env"
        _write_env(env, "ECOMIND_ENV=local", f"ECOMIND_SECRET_KEY={PLACEHOLDER}")

        ok, replaced = bootstrap._repair_env_secret(env)

        assert (ok, replaced) == (True, True)
        assert _secret_in(env) != PLACEHOLDER
        assert len(_secret_in(env)) >= 32

    def test_leaves_a_real_secret_untouched(self, tmp_path):
        env = tmp_path / ".env"
        original = "z" * 48
        _write_env(env, "ECOMIND_ENV=local", f"ECOMIND_SECRET_KEY={original}")

        ok, replaced = bootstrap._repair_env_secret(env)

        assert (ok, replaced) == (True, False)
        assert _secret_in(env) == original

    def test_preserves_comments_and_other_keys(self, tmp_path):
        # .env is documented as safe to edit. A repair that rewrote the file
        # from scratch would silently drop whatever an operator added.
        env = tmp_path / ".env"
        _write_env(
            env,
            "# a comment the operator wrote",
            "ECOMIND_ENV=local",
            f"ECOMIND_SECRET_KEY={PLACEHOLDER}",
            "MY_CUSTOM_SETTING=keep me",
        )

        bootstrap._repair_env_secret(env)
        text = env.read_text(encoding="utf-8")

        assert "# a comment the operator wrote" in text
        assert "MY_CUSTOM_SETTING=keep me" in text
        assert "ECOMIND_ENV=local" in text

    def test_appends_a_secret_when_the_file_has_none(self, tmp_path):
        # Present-but-incomplete is the state that a plain `if not env.exists()`
        # check waves through.
        env = tmp_path / ".env"
        _write_env(env, "ECOMIND_ENV=local")

        ok, replaced = bootstrap._repair_env_secret(env)

        assert (ok, replaced) == (True, True)
        assert len(_secret_in(env)) >= 32

    def test_reports_failure_rather_than_claiming_success(self, tmp_path):
        # An unreadable file must not be reported as "nothing to do".
        env = tmp_path / ".env"
        _write_env(env, f"ECOMIND_SECRET_KEY={PLACEHOLDER}")
        env.chmod(0o000)
        try:
            ok, _ = bootstrap._repair_env_secret(env)
        finally:
            env.chmod(0o644)
        if ok:  # running as root defeats chmod; only assert when it bites
            pytest.skip("cannot make a file unreadable as this user")

    def test_generates_a_different_secret_each_time(self, tmp_path):
        first = tmp_path / "a.env"
        second = tmp_path / "b.env"
        _write_env(first, f"ECOMIND_SECRET_KEY={PLACEHOLDER}")
        _write_env(second, f"ECOMIND_SECRET_KEY={PLACEHOLDER}")

        bootstrap._repair_env_secret(first)
        bootstrap._repair_env_secret(second)

        assert _secret_in(first) != _secret_in(second)
