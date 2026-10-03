"""Process management: ports, pids, trees, pid map, health probe, service spawn.

Cross-platform: works on Windows, macOS and Linux. The Windows path keeps the
"titled console window" behaviour; POSIX runs services detached with output
redirected to their log files.
"""
from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from launcher.config import load_config, npm_executable, project_root, python_executable

PID_DIR_NAME = "launcher-pids"

# Markers placed on our own command lines so "is this really our process?"
# stays reliable even after the OS recycles a PID.
LAUNCHER_MARKER = "launcher.start"
SPAWN_MARKER = "spawn.py"

BACKEND_TITLE = "EcoMind Backend"
FRONTEND_TITLE = "EcoMind Frontend"

IS_WINDOWS = os.name == "nt"


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


# --------------------------------------------------------------------------- #
# command line of a pid
# --------------------------------------------------------------------------- #
def _cmdline(pid: int) -> str:
    """Command line of a pid, empty string if it cannot be determined."""
    if IS_WINDOWS:
        return _cmdline_windows(pid)
    return _cmdline_posix(pid)


def _cmdline_windows(pid: int) -> str:
    # Prefer PowerShell (present on all supported Windows versions).
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"(Get-CimInstance Win32_Process -Filter \"ProcessId={pid}\").CommandLine"],
            capture_output=True, text=True, timeout=20,
        )
        if r.returncode == 0:
            out = (r.stdout or "").strip()
            if out:
                return out
    except Exception:
        pass
    try:
        r = subprocess.run(
            ["wmic", "process", "where", f"ProcessId={pid}", "get", "CommandLine", "/format:list"],
            capture_output=True, text=True, timeout=15,
        )
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                if line.startswith("CommandLine="):
                    return line.split("=", 1)[1]
    except Exception:
        pass
    return ""


def _cmdline_posix(pid: int) -> str:
    proc = Path(f"/proc/{pid}/cmdline")
    if proc.exists():
        try:
            return proc.read_bytes().replace(b"\x00", b" ").decode("utf-8", "replace").strip()
        except Exception:
            pass
    try:
        r = subprocess.run(["ps", "-o", "command=", "-p", str(pid)],
                           capture_output=True, text=True, timeout=10)
        return (r.stdout or "").strip()
    except Exception:
        return ""


# --------------------------------------------------------------------------- #
# liveness / termination
# --------------------------------------------------------------------------- #
def pid_alive(pid: int) -> bool:
    if not pid:
        return False
    if IS_WINDOWS:
        try:
            out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                                 capture_output=True, text=True, timeout=10).stdout or ""
            for line in out.splitlines():
                if line.strip() and str(pid) in line:
                    return True
        except Exception:
            return False
        return False
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except Exception:
        return False
    return True


def our_launcher_alive(pid: int, marker: str = LAUNCHER_MARKER) -> bool:
    """True only if pid is a python process whose command line contains marker."""
    if not pid or not pid_alive(pid):
        return False
    cmdline = _cmdline(pid).lower()
    if "python" not in cmdline:
        return False
    return marker.lower() in cmdline


def kill_tree(pid: int) -> bool:
    if not pid:
        return False
    if IS_WINDOWS:
        try:
            r = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                               capture_output=True, text=True, timeout=15)
            return r.returncode == 0
        except Exception:
            return False
    # POSIX: signal the whole process group so uvicorn/vite children die too.
    try:
        os.killpg(os.getpgid(int(pid)), signal.SIGTERM)
    except Exception:
        try:
            os.kill(int(pid), signal.SIGTERM)
        except Exception:
            return False
    for _ in range(20):
        if not pid_alive(int(pid)):
            return True
        time.sleep(0.25)
    try:
        os.killpg(os.getpgid(int(pid)), signal.SIGKILL)
    except Exception:
        try:
            os.kill(int(pid), signal.SIGKILL)
        except Exception:
            pass
    return True


# --------------------------------------------------------------------------- #
# pid map
# --------------------------------------------------------------------------- #
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


# --------------------------------------------------------------------------- #
# service spawn
# --------------------------------------------------------------------------- #
def _service_command(service: dict, py: str) -> list[str]:
    cmd = list(service.get("command", []))
    resolved = []
    for c in cmd:
        if c == "python":
            resolved.append(py)
        elif c in ("npm", "npm.cmd"):
            resolved.append(npm_executable())
        else:
            resolved.append(c)
    return resolved


def start_service(service: dict) -> int | None:
    """Start a service and tee its output to logs. Returns the launched pid."""
    cfg = load_config()
    py = python_executable()
    logs_dir = project_root() / cfg["paths"]["logs_dir"]
    logs_dir.mkdir(parents=True, exist_ok=True)
    cwd = project_root() / service.get("cwd", ".")
    log_file = logs_dir / service.get("log", f"{service['id']}.log")
    root = str(project_root())

    cmd = _service_command(service, py)

    env = dict(os.environ)
    for k, v in (service.get("env") or {}).items():
        env[k] = str(v).replace("{root}", root)

    title = service.get("title", service["id"])

    if IS_WINDOWS:
        spawn = str(Path(__file__).resolve().parent / "spawn.py")
        try:
            proc = subprocess.Popen(
                [py, "-u", spawn, str(log_file), title, str(cwd), "--", *cmd],
                cwd=str(cwd),
                env=env,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            return proc.pid
        except Exception:
            return None

    # POSIX: run detached, stream to the log file.
    try:
        fh = open(log_file, "a", encoding="utf-8", errors="replace")
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            env=env,
            stdout=fh,
            stderr=subprocess.STDOUT,
            start_new_session=True,
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
