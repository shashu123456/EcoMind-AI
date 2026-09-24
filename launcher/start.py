"""One-click launcher entrypoint. Run: python -m launcher.start"""
from __future__ import annotations

import os
import sys
import time
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from launcher.config import load_config, project_root, python_executable
from launcher.logutil import get_logger
from launcher.checks import run_checks, render_checks
from launcher.processes import (
    port_in_use, http_ok, pid_alive, kill_tree, start_service,
    write_pid_map, clear_pid_map, write_launcher_pid, read_launcher_pid,
    clear_launcher_pid, tail_log, pid_dir,
)

log = get_logger()

BANNER = """
  ==============================================================
   EcoMind AI - Adaptive Explainable Energy Intelligence Platform
   One-click launcher  |  offline & self-contained
  ==============================================================
"""


def _banner():
    print(BANNER)


def _check_duplicate() -> bool:
    mine = read_launcher_pid()
    if mine and mine != os.getpid() and pid_alive(mine):
        print(f"[!] Another launcher instance is already running (pid {mine}).")
        print("    Use Stop_EcoMind.bat first, or let it keep monitoring.")
        return True
    write_launcher_pid(os.getpid())
    return False


def _seed_if_needed(cfg):
    db = project_root() / cfg["paths"]["database_file"]
    if db.exists():
        return
    print("[..] Database missing - seeding sample data ...")
    py = python_executable()
    seed = project_root() / cfg["paths"]["seed_script"]
    log_file = project_root() / cfg["paths"]["logs_dir"] / "launcher.log"
    import subprocess
    with open(log_file, "a", encoding="utf-8") as fh:
        r = subprocess.run([py, str(seed)], cwd=str(project_root()),
                           stdout=fh, stderr=subprocess.STDOUT, timeout=300)
    if r.returncode == 0 and db.exists():
        print("[OK] Database seeded.")
    else:
        print("[!] Seeding failed - see logs/launcher.log.")


def _start_services(cfg) -> dict:
    started = {}
    for svc in cfg["services"]:
        if not svc.get("enabled", False):
            continue
        # Port pre-check: if our own process holds it, skip.
        if port_in_use(svc["port"]):
            print(f"[!] {svc['title']} port {svc['port']} already in use - skipping start.")
            started[f"{svc['id']}-skipped"] = True
            continue
        pid = start_service(svc)
        if pid:
            started[svc["id"]] = pid
            print(f"[OK] {svc['title']} launched (pid {pid})")
        else:
            print(f"[FAIL] Could not launch {svc['title']}")
    write_pid_map(started)
    return started


def _wait_ready(cfg, started, timeout: int, poll: float) -> bool:
    all_ok = True
    for svc in cfg["services"]:
        if not svc.get("enabled", False):
            continue
        if f"{svc['id']}-skipped" in started:
            continue
        url = svc.get("health_url", "")
        title = svc["title"]
        if not url:
            print(f"[..] {title}: no health URL to probe - assuming ready.")
            continue
        t0 = time.time()
        ok = False
        while time.time() - t0 < timeout:
            if http_ok(url):
                ok = True
                break
            time.sleep(poll)
        if ok:
            print(f"[OK] {title} ready in {time.time() - t0:.1f}s  ({url})")
        else:
            print(f"[FAIL] {title} not ready within {timeout}s - {url}")
            print(tail_log(svc))
            all_ok = False
    return all_ok


def _monitor(cfg, started, interval: float):
    print("\n[..] Monitoring all services. Press Ctrl+C to stop monitoring (services keep running).\n")
    try:
        while True:
            for svc in cfg["services"]:
                if not svc.get("enabled", False):
                    continue
                pid = started.get(svc["id"])
                if pid and not pid_alive(pid):
                    print(f"[!] {svc['title']} (pid {pid}) stopped unexpectedly.")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[OK] Monitoring stopped. Services are still running.")
        print("     Use Stop_EcoMind.bat to shut them down cleanly.")


def main():
    _banner()
    cfg = load_config()
    if _check_duplicate():
        sys.exit(1)

    print("[..] Running environment checks ...")
    rows = run_checks()
    text, all_ok = render_checks(rows)
    print(text)
    from launcher.checks import run_checks as rc2
    _ = rc2  # noqa
    failed = [r for r in rows if not r["ok"]]
    if failed:
        print("\n[FAIL] The following requirements are not met:")
        suggestions = [r["suggestion"] for r in failed if r["suggestion"]]
        for s in suggestions:
            print("   > " + s)
        print("\nFix the issues above and run Launch_EcoMind.bat again.")
        clear_launcher_pid()
        sys.exit(1)

    cfg = load_config()
    _seed_if_needed(cfg)

    print("\n[..] Starting services in separate windows ...")
    started = _start_services(cfg)
    if not any(k in started for k in (s["id"] for s in cfg["services"] if s.get("enabled"))):
        print("[!] No services were started.")
        clear_launcher_pid()
        sys.exit(1)

    wait_s = cfg.get("startup", {}).get("wait_timeout_seconds", 240)
    poll_s = cfg.get("startup", {}).get("poll_interval_seconds", 2)
    ready = _wait_ready(cfg, started, int(wait_s), float(poll_s))

    if ready and cfg.get("app", {}).get("open_browser", True):
        home = cfg["app"]["home_url"]
        print(f"[..] Opening browser at {home}")
        try:
            webbrowser.open(home)
        except Exception:
            pass

    if ready:
        print("\n[OK] EcoMind AI is up and running!")
    else:
        print("\n[!] Some services did not become ready - check logs/backend.log & logs/frontend.log")

    mon = cfg.get("startup", {}).get("monitor_interval_seconds", 15)
    _monitor(cfg, started, float(mon))


if __name__ == "__main__":
    main()