#!/usr/bin/env python3
"""Quick QA pass over the current documentation/routing inconsistencies.

Run from repo root.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

BAD_PATTERNS = [
    (r"\beleven[-\s]?stage\b", "says eleven-stage"),
    (r"\b11[-\s]?stage\b", "says 11-stage"),
    (r"\bsixteen views?\b", "says sixteen views"),
    (r"\b16 views?\b", "says 16 views"),
]

SKIP = {
    # research paper may describe the project history honestly.
    ROOT / "research" / "IEEE_Paper.tex",
}


def main() -> int:
    problems: list[tuple[Path, str, str]] = []
    for path in ROOT.rglob("*.md"):
        if path in SKIP:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for pattern, label in BAD_PATTERNS:
            if re.search(pattern, text, re.I):
                problems.append((path, label, pattern))

    if not problems:
        print("no stale stage/view counts remaining in docs/*.md")
        return 0

    for path, label, pattern in problems:
        print(f"{path}: {label}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
