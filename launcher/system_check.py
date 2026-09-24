"""Standalone system health check. Run: python -m launcher.system_check"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from launcher.config import load_config
from launcher.logutil import get_logger
from launcher.checks import run_checks, render_checks

log = get_logger()


def main():
    print("  ============================================")
    print("   EcoMind AI - System Health Check")
    print("  ============================================")
    _ = load_config()
    rows = run_checks()
    text, all_ok = render_checks(rows)
    print(text)

    summary = [r for r in rows if not r["ok"]]
    print("\n  -------------------------------------------")
    if summary:
        print(f"  RESULT: {len(summary)} item(s) need attention.")
        for r in summary:
            if r["suggestion"]:
                print(f"    - {r['label']}: {r['suggestion']}")
        print("\n  Fix the issues shown, then re-run this check or Launch_EcoMind.bat.")
    else:
        print("  RESULT: ALL CHECKS PASSED - ready to launch.")
    sys.exit(1 if summary else 0)


if __name__ == "__main__":
    main()