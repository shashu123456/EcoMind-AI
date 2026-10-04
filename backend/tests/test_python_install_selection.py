"""Tests for the Python auto-install path.

The one prerequisite the launcher cannot satisfy for itself: with no
interpreter there is no launcher to run one. This has never been executed,
because executing it means uninstalling Python.

What *can* be verified is the part that actually decides anything -- which
package manager gets chosen on which platform -- and that is where a silent
failure would live. A test that installs Python would prove nothing extra and
would break every developer machine it ran on.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from launcher import bootstrap  # noqa: E402


@pytest.fixture
def fake(monkeypatch):
    """Capture what would be run, without running it."""
    calls: list[list[str]] = []

    def which(name: str):
        return f"/usr/bin/{name}" if name in bootstrap._FAKE_TOOLS["available"] else None

    bootstrap._FAKE_TOOLS = {"available": set()}
    monkeypatch.setattr(bootstrap.shutil, "which", which)
    monkeypatch.setattr(bootstrap, "_os", lambda: bootstrap._FAKE_TOOLS["platform"])
    monkeypatch.setattr(
        bootstrap, "_stream", lambda cmd, cwd=None: (calls.append(list(cmd)), 0)[1]
    )
    monkeypatch.setattr(bootstrap.shutil, "which", which)
    # `geteuid` is POSIX-only; the Linux branch guards on it, so patch it only
    # where it exists rather than failing on a Windows runner.
    monkeypatch.setattr(bootstrap.os, "geteuid", lambda: 1000, raising=False)
    return calls


def _platform(fake, name: str, tools: set[str]):
    fake  # fixture already patched
    bootstrap._FAKE_TOOLS["platform"] = name
    bootstrap._FAKE_TOOLS["available"] = tools


class TestPlatformChoice:
    def test_windows_prefers_winget(self, fake):
        _platform(fake, "windows", {"winget", "python"})
        assert bootstrap._install_python("3.12") is True
        assert fake[0][0] == "winget"
        # `Python.Python.3` is not a package winget knows; it must be 312.
        assert "Python.Python.312" in fake[0]

    def test_windows_falls_back_to_chocolatey(self, fake):
        _platform(fake, "windows", {"choco", "python"})
        assert bootstrap._install_python("3.12") is True
        assert fake[0][0] == "choco"

    def test_windows_with_neither_reports_and_returns_false(self, fake):
        _platform(fake, "windows", set())
        assert bootstrap._install_python("3.12") is False
        assert fake == [], "nothing should be run when no installer exists"

    def test_macos_uses_homebrew(self, fake):
        _platform(fake, "macos", {"brew"})
        assert bootstrap._install_python("3.12") is True
        assert fake[0][:2] == ["brew", "install"]
        # Homebrew keeps the dot: python@3.12, never python@312.
        assert "python@3.12" in fake[0]

    def test_macos_without_homebrew_reports_and_returns_false(self, fake):
        _platform(fake, "macos", set())
        assert bootstrap._install_python("3.12") is False
        assert fake == []

    def test_linux_uses_apt(self, fake):
        _platform(fake, "linux", {"apt-get"})
        assert bootstrap._install_python("3.12") is True
        assert fake[0][-1] == "apt-get" or "apt-get" in fake[0]

    def test_linux_falls_back_to_dnf(self, fake):
        _platform(fake, "linux", {"dnf"})
        assert bootstrap._install_python("3.12") is True
        assert "dnf" in fake[0]

    def test_linux_falls_back_to_pacman(self, fake):
        _platform(fake, "linux", {"pacman"})
        assert bootstrap._install_python("3.12") is True
        assert "pacman" in fake[0]

    def test_linux_with_no_manager_reports_and_returns_false(self, fake):
        _platform(fake, "linux", set())
        assert bootstrap._install_python("3.12") is False
        assert fake == []


class TestNeverSilentlySucceeds:
    """
    The property that matters most: an unavailable installer must be a visible
    failure, not a hopeful True. Reporting success here would strand a user
    with no interpreter and a launcher that believes it is fine.
    """

    @pytest.mark.parametrize(
        "platform,tools",
        [
            ("windows", set()),
            ("macos", set()),
            ("linux", set()),
        ],
    )
    def test_no_package_manager_is_never_reported_as_success(self, fake, platform, tools):
        _platform(fake, platform, tools)
        assert bootstrap._install_python("3.12") is False


class TestRuntimeCheck:
    def test_a_new_enough_interpreter_passes_without_installing(self, fake):
        # Already satisfied: nothing should be attempted.
        assert bootstrap.ensure_python_runtime(install=True) is True
        assert fake == []

    def test_an_interpreter_below_the_required_floor_is_refused(self, monkeypatch):
        # The real interpreter is 3.11, so demand a floor it cannot meet. The
        # point is that a too-old interpreter is a visible failure rather than
        # something the launcher works around.
        monkeypatch.setattr(
            bootstrap, "load_config", lambda: {"python": {"min_version": "99.0"}}
        )
        assert bootstrap.ensure_python_runtime(install=False) is False
