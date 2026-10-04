"""Environment / dependency / data / service readiness checks.

Returns a list of rows: {label, ok, detail, suggestion}.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from launcher.config import python_executable, project_root, load_config, npm_executable

REQUIRED_MODULES = [
    "fastapi", "uvicorn", "sqlalchemy", "pydantic",
    "pandas", "numpy", "sklearn", "xgboost",
    "reportlab", "jinja2", "openpyxl", "jose", "passlib",
]


def _py(cmd: list[str]) -> tuple[int, str]:
    exe = python_executable()
    try:
        r = subprocess.run([exe, "-c", " ".join(cmd)], capture_output=True, text=True, timeout=90)
        return r.returncode, (r.stdout + r.stderr).strip()
    except Exception as e:
        return 1, str(e)


def _ver(cmd: list[str]) -> str:
    _, out = _py(cmd)
    first = out.splitlines()[0] if out else ""
    return first.strip()


def run_checks() -> list[dict]:
    cfg = load_config()
    root = Path(cfg["__root"])
    rows: list[dict] = []

    # ---- Runtime ----
    pyexe = python_executable()
    rows.append({"section": "Runtime", "label": f"Python ({pyexe})", "ok": True,
                 "detail": "resolved", "suggestion": ""})
    pymin = cfg.get("python", {}).get("min_version", "3.10")
    pyver = _ver(["import platform; print(platform.python_version())"])
    try:
        ok = tuple(int(x) for x in pyver.split(".")[:2]) >= tuple(int(x) for x in str(pymin)[:3].split(".")[:2])
    except Exception:
        ok = bool(pyver)
    rows.append({"section": "Runtime", "label": f"Python >= {pymin}", "ok": ok,
                 "detail": pyver or "unable to detect", "suggestion": "" if ok else f"Install Python {pymin}+ and add it to PATH."})

    nodever = _ver(["import subprocess; print(subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip())"])
    rows.append({"section": "Runtime", "label": "Node.js >= 18", "ok": bool(nodever.startswith("v")),
                 "detail": nodever or "not found", "suggestion": "" if nodever else "Install Node.js 18+ from nodejs.org."})
    _npm = npm_executable().replace("\\", "\\\\")
    npmver = _ver([f"import subprocess; print(subprocess.run([r'{_npm}','--version'],capture_output=True,text=True).stdout.strip())"])
    rows.append({"section": "Runtime", "label": "npm", "ok": bool(npmver.split(".")[0].isdigit()),
                 "detail": npmver or "not found", "suggestion": "" if npmver else "Install Node.js 18+ (bundles npm)."})

    # ---- Dependencies ----
    rc, out = _py(["import " + ",".join(REQUIRED_MODULES) + " ; print('ok')"])
    rows.append({"section": "Dependencies", "label": "Python packages (backend)",
                 "ok": rc == 0 and "ok" in out,
                 "detail": "all importable" if rc == 0 else (out[:120] or "missing packages"),
                 "suggestion": "" if rc == 0 else "Run: %PY% -m pip install -r backend/requirements.txt   (inside .venv)"})

    node_modules = root / "frontend" / "node_modules"
    rows.append({"section": "Dependencies", "label": "Frontend dependencies (node_modules)",
                 "ok": node_modules.exists(),
                 "detail": "present" if node_modules.exists() else "missing",
                 "suggestion": "" if node_modules.exists() else "Run inside frontend/: npm install"})

    # ---- Folders & data ----
    needed = ["backend/app", "backend/app/routes", "backend/app/domain", "frontend/src",
              "launcher"]
    for rel in needed:
        p = root / rel
        rows.append({"section": "Project structure", "label": rel,
                     "ok": p.exists(), "detail": "present" if p.exists() else "missing",
                     "suggestion": "" if p.exists() else f"Restore the '{rel}' folder (project seems incomplete)."})

    catalog = root / "backend/data/generated/ecomind_healthy_campus.csv"
    rows.append({"section": "Project structure", "label": "Dataset catalogue",
                 "ok": catalog.exists(), "detail": "present" if catalog.exists() else "not generated yet",
                 "suggestion": "" if catalog.exists() else "The launcher generates datasets automatically on first run."})

    db = root / cfg["paths"]["database_file"]
    rows.append({"section": "Project structure", "label": "SQLite database",
                 "ok": db.exists(), "detail": "present" if db.exists() else "missing",
                 "suggestion": "" if db.exists() else "Runs automatically on Launch; or manually: %PY% backend/seed.py"})

    # The secret is the one setting whose absence is silent: the app starts
    # happily either way and signs JWTs that are forgeable. So it gets a row
    # of its own rather than living inside "the database exists".
    env = root / "backend" / ".env"
    secret = ""
    if env.exists():
        for raw in env.read_text(encoding="utf-8", errors="replace").splitlines():
            s = raw.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            key, value = s.split("=", 1)
            if key.strip() == "ECOMIND_SECRET_KEY":
                secret = value.strip()
                break
    if not env.exists():
        rows.append({"section": "Project structure", "label": "backend/.env",
                     "ok": False, "detail": "missing",
                     "suggestion": "Run `ecomind` and it is generated with a random secret."})
    elif not secret:
        rows.append({"section": "Project structure", "label": "Secret key",
                     "ok": False, "detail": "ECOMIND_SECRET_KEY not set",
                     "suggestion": "Run `ecomind` -- the launcher generates one automatically."})
    elif len(secret) < 32:
        rows.append({"section": "Project structure", "label": "Secret key",
                     "ok": False, "detail": f"only {len(secret)} characters",
                     "suggestion": "Use at least 32 random characters for ECOMIND_SECRET_KEY."})
    else:
        rows.append({"section": "Project structure", "label": "Secret key",
                     "ok": True, "detail": f"generated ({len(secret)} chars)",
                     "suggestion": ""})

    # ---- Services ----
    from launcher.processes import port_in_use, http_ok
    for svc in cfg["services"]:
        if not svc.get("enabled", False):
            continue
        port = svc["port"]
        in_use = port_in_use(port)
        url = svc.get("health_url", "")
        healthy = http_ok(url) if url else False
        rows.append({"section": "Services", "label": f"{svc['title']} (port {port})",
                     "ok": not in_use or healthy,
                     "detail": "healthy" if healthy else ("already running" if in_use else "free"),
                     "suggestion": "" if (not in_use) or healthy else
                     "A foreign process is using this port. Close it, or run `ecomind stop` / restart your machine."})

    return rows


def render_checks(rows: list[dict]) -> tuple[str, bool]:
    lines = []
    all_ok = True
    current = ""
    for r in rows:
        if r["section"] != current:
            current = r["section"]
            lines.append("")
            lines.append(f"  -- {current} --")
        mark = "PASS" if r["ok"] else "FAIL"
        if not r["ok"]:
            all_ok = False
        lines.append(f"  [{mark}] {r['label']}")
        if r.get("detail"):
            lines.append(f"         {r['detail']}")
        if r["suggestion"]:
            lines.append(f"         > {r['suggestion']}")
    return "\n".join(lines), all_ok