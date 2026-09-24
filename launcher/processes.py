"""Process management: ports, pids, trees, pid map, health probe, service spawn."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

from launcher.config import project_root, python_executable, load_config

PID_DIR_NAME = "launcher-pids"


def pid_dir() -> Path:
    cfg = load_config()
    p = project_root() / cfg["paths"]["pid_dir"]
    p.mkdir(parents=True, exist_ok=True)
    return p


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.connect(("127.0.0.1", int(port)))
            return True
        except OSError:
            return False


def http_ok(url: str, timeout: float = 3.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status < 500
    except Exception:
        return False


def pid_alive(pid: int) -> bool:
    try:
        subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                       capture_output=True, text=True, timeout=10)
        return _pid_running(pid)
    except Exception:
        return False


def _pid_running(pid: int) -> bool:
    try:
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                             capture_output=True, text=True, timeout=10).stdout or ""
        for line in out.splitlines():
            if line.strip() and str(pid) in line:
                return True
    except Exception:
        return False
    return False


def kill_tree(pid: int) -> bool:
    try:
        r = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                           capture_output=True, text=True, timeout=15)
        return r.returncode == 0
    except Exception:
        return False


def read_pid_map() -> dict:
    f = pid_dir() / "pids.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def write_pid_map(data: dict):
    (pid_dir() / "pids.json").write_text(json.dumps(data, indent=2), encoding="utf-8")


def clear_pid_map():
    f = pid_dir() / "pids.json"
    if f.exists():
        f.unlink()


def write_launcher_pid(pid: int):
    (pid_dir() / "launcher.pid").write_text(str(pid), encoding="utf-8")


def read_launcher_pid() -> int | None:
    f = pid_dir() / "launcher.pid"
    if f.exists():
        try:
            return int(f.read_text(encoding="utf-8").strip())
        except Exception:
            return None
    return None


def clear_launcher_pid():
    f = pid_dir() / "launcher.pid"
    if f.exists():
        f.unlink()


def _cmdline(service: dict, py: str) -> list[str]:
    cmd = list(service.get("command", []))
    return [py if c == "python" else c for c in cmd]


def start_service(service: dict) -> int | None:
    """Open a fresh console window titled after the service that tees to logs. Returns the shell pid."""
    cfg = load_config()
    py = python_executable()
    logs_dir = project_root() / cfg["paths"]["logs_dir"]
    logs_dir.mkdir(parents=True, exist_ok=True)
    cwd = project_root() / service.get("cwd", ".")
    log_file = logs_dir / service.get("log", f"{service['id']}.log")
    root = str(project_root())

    cmd = _cmdline(service, py)
    root = str(project_root())
    spawn = str(Path(__file__).resolve().parent / "spawn.py")

    env = dict(os.environ)
    for k, v in (service.get("env") or {}).items():
        env[k] = str(v).replace("{root}", root)

    try:
        proc = subprocess.Popen(
            [py, "-u", spawn, str(log_file), service["title"], str(cwd), "--", *cmd],
            cwd=str(cwd),
            env=env,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        return proc.pid
    except Exception:
        return None


def tail_log(service: dict, n: int = 12) -> str:
    cfg = load_config()
    log_file = project_root() / cfg["paths"]["logs_dir"] / service.get("log", f"{service['id']}.log")
    if not log_file.exists():
        return "(no log yet)"
    lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-n:])