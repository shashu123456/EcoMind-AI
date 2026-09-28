"""Graceful shutdown of all launcher-registered services. Run: python -m launcher.stop"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from launcher.config import load_config, project_root
from launcher.processes import (
    read_pid_map, clear_pid_map, read_launcher_pid, clear_launcher_pid,
    pid_alive as _alive, kill_tree, port_in_use, pid_dir,
)


def main():
    print("  ============================================")
    print("   EcoMind AI - Stop launcher")
    print("  ============================================")
    cfg = load_config()
    started = read_pid_map()

    targets = []
    for svc in cfg["services"]:
        if not svc.get("enabled", False):
            continue
        pid = started.get(svc["id"])
        if pid == -1:
            print(f"  [..] {svc['title']} was already running before launch - leaving it alone.")
            continue
        if pid and str(pid) != "True":
            targets.append((svc["title"], int(pid), svc.get("port")))

    if not targets:
        print("  [..] No registered services to stop.")
    for title, pid, port in targets:
        if _alive(pid):
            if kill_tree(pid):
                print(f"  [OK] {title} stopped (pid {pid})")
            else:
                print(f"  [!] Could not fully stop {title} (pid {pid})")
        else:
            print(f"  [..] {title} is not running (pid {pid} stale)")

    launcher_pid = read_launcher_pid()
    if launcher_pid and _alive(launcher_pid) and launcher_pid not in [p for _, p, _ in targets]:
        kill_tree(launcher_pid)
        print(f"  [OK] Launcher stopped (pid {launcher_pid})")

    clear_pid_map()
    clear_launcher_pid()

    print("  [..] Verifying ports are free ...")
    for title, _, port in targets:
        if port_in_use(port):
            print(f"  [!] Port {port} ({title}) still in use (possibly a foreign process).")
        else:
            print(f"  [OK] Port {port} ({title}) free")

    print("\n  Done. Goodbye.")


if __name__ == "__main__":
    main()