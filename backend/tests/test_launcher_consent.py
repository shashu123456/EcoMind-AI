"""Tests for the launcher's install-permission gate.

The bootstrap used to run unconditionally: a fresh clone was inspected and
whatever was missing was fetched without ever asking. The behaviour worth
pinning down is therefore not "does it install" but "does it ever install
without consent" -- including the case nobody notices, where there is no
terminal to prompt and the launcher quietly proceeds anyway.

These tests never install anything; they assert on the decision function.
"""

from __future__ import annotations

import builtins
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from launcher import start  # noqa: E402


class _FakeStdin:
    """Stands in for sys.stdin so isatty() is controlled, not inherited."""

    def __init__(self, tty: bool) -> None:
        self._tty = tty

    def isatty(self) -> bool:
        return self._tty


def _plan_rows() -> list[dict]:
    """A realistic check report: setup gaps plus one problem no install fixes."""
    return [
        {"section": "Runtime", "label": "Python 3.11+", "ok": False,
         "detail": "not found", "suggestion": "install Python"},
        {"section": "Runtime", "label": "Node 20+", "ok": True,
         "detail": "20.11.0", "suggestion": ""},
        {"section": "Dependencies", "label": "Frontend dependencies (node_modules)",
         "ok": False, "detail": "missing", "suggestion": "npm install"},
        {"section": "Frontend", "label": "frontend/dist", "ok": False,
         "detail": "not built", "suggestion": "build it"},
        {"section": "Services", "label": "Backend port 8000", "ok": False,
         "detail": "held by pid 42", "suggestion": "stop the other process"},
    ]


class TestWhatCountsAsAnInstallableGap:
    def test_names_the_runtime_deps_and_generated_artefacts(self):
        labels = {r["label"] for r in start._setup_plan(_plan_rows())}
        assert labels == {
            "Python 3.11+",
            "Frontend dependencies (node_modules)",
            "frontend/dist",
        }

    def test_excludes_a_port_held_by_another_program(self):
        """No install frees a port, so offering to \"fix\" it would mislead.

        If it were included, the operator would approve an install plan and find
        the launcher still cannot start.
        """
        labels = {r["label"] for r in start._setup_plan(_plan_rows())}
        assert "Backend port 8000" not in labels

    def test_ignores_checks_that_already_pass(self):
        labels = {r["label"] for r in start._setup_plan(_plan_rows())}
        assert "Node 20+" not in labels

    def test_a_healthy_machine_has_nothing_to_approve(self):
        healthy = [{"section": "Runtime", "label": "Python 3.11+", "ok": True,
                    "detail": "3.11.9", "suggestion": ""}]
        assert start._setup_plan(healthy) == []


class TestConsent:
    def test_nothing_to_install_never_prompts(self, monkeypatch, capsys):
        """The common case: an already-provisioned clone must start silently."""

        def explode(*_a, **_k):  # pragma: no cover - only runs on regression
            raise AssertionError("an empty plan must not prompt")

        monkeypatch.setattr(builtins, "input", explode)
        assert start._confirm_install([], assume_yes=False) is True
        assert capsys.readouterr().out == ""

    def test_explicit_approval_skips_the_prompt(self, monkeypatch, capsys):
        """--yes is the documented unattended path, and must not block on input."""

        def explode(*_a, **_k):  # pragma: no cover - only runs on regression
            raise AssertionError("--yes must not prompt")

        monkeypatch.setattr(builtins, "input", explode)
        assert start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=True) is True
        assert "Consent given on the command line" in capsys.readouterr().out

    def test_refuses_without_a_terminal_and_without_approval(self, monkeypatch, capsys):
        """Silence is not consent: CI or a piped shell must download nothing."""
        monkeypatch.setattr(sys, "stdin", _FakeStdin(tty=False))

        def explode(*_a, **_k):  # pragma: no cover - only runs on regression
            raise AssertionError("must not prompt a terminal that is not there")

        monkeypatch.setattr(builtins, "input", explode)
        assert start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=False) is False
        out = capsys.readouterr().out
        assert "no interactive terminal" in out
        assert "nothing was installed" in out

    @pytest.mark.parametrize("answer", ["y", "Y", "yes", "YES", "  y  "])
    def test_accepts_an_explicit_yes(self, monkeypatch, capsys, answer):
        monkeypatch.setattr(sys, "stdin", _FakeStdin(tty=True))
        monkeypatch.setattr(builtins, "input", lambda *_a, **_k: answer)
        assert start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=False) is True

    @pytest.mark.parametrize("answer", ["n", "no", "", "later", "N"])
    def test_everything_else_declines(self, monkeypatch, capsys, answer):
        """Default-deny: a bare Enter at the prompt must not install."""
        monkeypatch.setattr(sys, "stdin", _FakeStdin(tty=True))
        monkeypatch.setattr(builtins, "input", lambda *_a, **_k: answer)
        assert start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=False) is False

    def test_closing_the_prompt_declines(self, monkeypatch, capsys):
        """Ctrl-C and Ctrl-D at the prompt are refusals, not crashes."""
        monkeypatch.setattr(sys, "stdin", _FakeStdin(tty=True))

        def interrupted(*_a, **_k):
            raise KeyboardInterrupt

        monkeypatch.setattr(builtins, "input", interrupted)
        assert start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=False) is False

        def eof(*_a, **_k):
            raise EOFError

        monkeypatch.setattr(builtins, "input", eof)
        assert start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=False) is False


class TestThePlanDisclosesWhatItWillDownload:
    def test_lists_the_missing_items(self, monkeypatch, capsys):
        monkeypatch.setattr(sys, "stdin", _FakeStdin(tty=True))
        monkeypatch.setattr(builtins, "input", lambda *_a, **_k: "n")
        start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=False)
        out = capsys.readouterr().out
        assert "Python 3.11+" in out
        assert "Frontend dependencies (node_modules)" in out

    def test_says_where_packages_come_from_and_what_stays_untouched(
        self, monkeypatch, capsys
    ):
        monkeypatch.setattr(sys, "stdin", _FakeStdin(tty=True))
        monkeypatch.setattr(builtins, "input", lambda *_a, **_k: "n")
        start._confirm_install(start._setup_plan(_plan_rows()), assume_yes=False)
        out = capsys.readouterr().out
        for phrase in ("pip", "pnpm", "PyPI", "npm registry", "Nothing else"):
            assert phrase in out, phrase
