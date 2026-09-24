"""Spawn a service in a titled console, teeing output to both the console and a log.

Usage:
    python spawn.py <log_file> <console_title> <cwd> -- <exe> <args...>

Reads the child's stdout/stderr line-by-line and mirrors each line to its own
console (the new window this script creates) and to <log_file>. Avoids all
cmd.exe quoting pitfalls by never using a shell. The console title is set via
the Win32 API so the user sees a meaningful named window per service.
"""
from __future__ import annotations

import ctypes
import subprocess
import sys

CTRL = "\x1b[" if hasattr(ctypes, "windll") else ""


def set_title(title: str) -> None:
    try:
        ctypes.windll.kernel32.SetConsoleTitleW(str(title))
    except Exception:
        pass


def main() -> int:
    args = sys.argv[1:]
    if "--" not in args:
        sys.stderr.write("usage: spawn.py <log> <title> <cwd> -- <exe> <args...>\n")
        return 2
    dash = args.index("--")
    log_file, title, cwd = args[0], args[1], args[2]
    exe, exe_args = args[dash + 1], args[dash + 2:]

    set_title(title)
    print(f"EcoMind AI — {title}")
    print(f"=> {exe} {' '.join(exe_args)}")
    print("=> logging to", log_file)
    print("-" * 60)

    command = [exe, *exe_args]
    if exe.lower().endswith((".cmd", ".bat")):
        command = ["cmd.exe", "/c", *command]
    try:
        proc = subprocess.Popen(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
    except Exception as exc:  # exe not found, permission, etc.
        print(f"[spawn] failed to start: {exc}")
        return 1

    with open(log_file, "a", encoding="utf-8", errors="replace", buffering=1) as log:
        assert proc.stdout is not None
        for line in proc.stdout:
            print(line, end="")
            log.write(line)
        log.write(f"[spawn] {title} exited with code {proc.wait()}\n")

    print("[spawn] window closing in 8s ...")
    import time

    time.sleep(8)
    return 0


if __name__ == "__main__":
    sys.exit(main())