"""Tests for launcher's service startup ordering.

The bug these guard: the launcher spawned the backend and the frontend in one
loop and waited afterwards. Vite therefore bound :5173 roughly a second after
uvicorn was launched, while uvicorn needs several more seconds to import
FastAPI, pandas and xgboost. Every browser tab already open on :5173 fired
/api/v1/health and opened workflow streams into a socket that was not yet
listening, so a normal start produced a wall of ECONNREFUSED from the Vite
proxy that looked like a broken install.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from launcher import start as launcher_start  # noqa: E402

CFG = {
    "services": [
        {
            "id": "backend",
            "enabled": True,
            "title": "EcoMind Backend",
            "port": 8000,
            "health_url": "http://127.0.0.1:8000/api/v1/health",
            "log": "backend.log",
        },
        {
            "id": "frontend",
            "enabled": True,
            "title": "EcoMind Frontend",
            "port": 5173,
            "health_url": "http://127.0.0.1:5173",
            "log": "frontend.log",
        },
    ]
}


@pytest.fixture
def harness(monkeypatch):
    """Record the order of events and fake the world.

    `health` maps a service id to how many probes it needs before answering,
    which is what makes "the frontend started too early" observable.
    """
    events: list[tuple[str, str]] = []
    health = {"backend": 1, "frontend": 1}
    live: set[str] = set()

    monkeypatch.setattr(
        launcher_start, "port_in_use", lambda port: False, raising=False
    )
    monkeypatch.setattr(launcher_start, "http_ok", lambda url: False, raising=False)

    def fake_start_service(svc):
        events.append(("spawn", svc["id"]))
        return 4242

    def fake_http_ok(url):
        # map a health url back to its service id
        svc_id = "backend" if "8000" in url else "frontend"
        if health[svc_id] <= 0:
            live.add(svc_id)
            return True
        health[svc_id] -= 1
        return False

    monkeypatch.setattr(launcher_start, "start_service", fake_start_service)
    monkeypatch.setattr(launcher_start, "http_ok", fake_http_ok)
    monkeypatch.setattr(launcher_start, "write_pid_map", lambda s: None, raising=False)
    monkeypatch.setattr(launcher_start, "tail_log", lambda s: "", raising=False)

    return events, health, live


def test_frontend_waits_for_backend_to_be_healthy(harness, monkeypatch):
    events, health, live = harness
    # The backend needs three probes before it answers, mimicking a cold uvicorn
    # import. If the frontend spawned during those probes it would be listening
    # on :5173 while /api still had nothing behind it.
    health["backend"] = 3

    launcher_start._start_services(CFG, ready_timeout=5, poll=0.01)

    order = [e for e in events]
    spawn_backend = order.index(("spawn", "backend"))
    spawn_frontend = order.index(("spawn", "frontend"))

    assert spawn_backend < spawn_frontend
    # The decisive assertion: the backend was healthy before the frontend
    # spawned at all, not merely spawned first.
    assert "backend" in live
    assert spawn_frontend == order.index(("spawn", "frontend"))


def test_no_backend_probe_happens_after_the_frontend_spawns(harness, monkeypatch):
    """The precise invariant: waiting happens before the next spawn, not after.

    The weak version of this test also inspected probes made after the frontend
    was already up, which legitimately see it spawned. What actually matters is
    that the launcher never returns to probe the backend once the frontend is
    serving -- if it did, the frontend would be listening while /api was still
    down, which is the bug.
    """
    events, health, live = harness
    health["backend"] = 5

    def observing_http_ok(url):
        svc_id = "backend" if "8000" in url else "frontend"
        events.append(("probe", svc_id))
        if health[svc_id] <= 0:
            live.add(svc_id)
            return True
        health[svc_id] -= 1
        return False

    monkeypatch.setattr(launcher_start, "http_ok", observing_http_ok)

    launcher_start._start_services(CFG, ready_timeout=5, poll=0.01)

    spawn_frontend = events.index(("spawn", "frontend"))
    backend_probes = [i for i, e in enumerate(events) if e == ("probe", "backend")]
    assert backend_probes, "the backend should have been polled"
    assert max(backend_probes) < spawn_frontend

    # And the full interleaving reads in the right order.
    assert events.index(("spawn", "backend")) < events.index(("probe", "backend"))
    assert events.index(("spawn", "frontend")) < events.index(("probe", "frontend"))


def test_a_backend_that_never_answers_does_not_hang_forever(harness):
    events, health, live = harness
    health["backend"] = 10_000  # never becomes healthy within the timeout

    t0 = time.time()
    launcher_start._start_services(CFG, ready_timeout=0.3, poll=0.05)
    elapsed = time.time() - t0

    # It gave up on the gate, said so, and still attempted the frontend rather
    # than leaving the user with nothing running.
    assert elapsed < 3
    assert ("spawn", "frontend") in events
    assert "backend" not in live


def test_an_already_healthy_service_is_reused_not_respawned(harness, monkeypatch):
    events, health, live = harness
    monkeypatch.setattr(
        launcher_start, "port_in_use", lambda port: port == 8000, raising=False
    )
    monkeypatch.setattr(launcher_start, "http_ok", lambda url: True, raising=False)

    started = launcher_start._start_services(CFG, ready_timeout=1, poll=0.01)

    assert ("spawn", "backend") not in events
    assert started["backend"] == -1
    assert ("spawn", "frontend") in events


def test_disabled_services_are_skipped(harness, monkeypatch):
    events, health, live = harness
    cfg = {"services": [dict(CFG["services"][0], enabled=False), CFG["services"][1]]}
    health["frontend"] = 1

    launcher_start._start_services(cfg, ready_timeout=1, poll=0.01)

    assert ("spawn", "backend") not in events
    assert ("spawn", "frontend") in events
