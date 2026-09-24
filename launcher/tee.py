"""Tee utility: forward a named pipe (stdin) to a log file + console.

Used as the tail of every service pipeline so each service gets live
console output AND a persistent log file in logs/.
"""
import sys
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        return
    log_path = Path(sys.argv[1])
    log_path.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(sys.stdin, "reconfigure"):
        try:
            sys.stdin.reconfigure(errors="replace")
        except Exception:
            pass
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(errors="replace")
        except Exception:
            pass
    with open(log_path, "a", encoding="utf-8", errors="replace") as fh:
        for line in sys.stdin:
            fh.write(line)
            fh.flush()
            try:
                print(line, end="")
                sys.stdout.flush()
            except Exception:
                pass

if __name__ == "__main__":
    main()