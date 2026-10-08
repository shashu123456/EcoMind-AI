<div align="center">

# ⚡ EcoMind AI

**Adaptive, Explainable Energy Intelligence Platform**

*Trustworthy AI begins with trustworthy data.*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

</div>

EcoMind AI transforms raw organizational energy datasets into **trusted,
explainable, actionable** decisions through a transparent, end-to-end workflow —
for universities, hospitals, offices, manufacturing, hotels, airports, malls and
data centers.

Unlike black-box prediction engines, every prediction, recommendation and
benchmark is **traceable** through a ten-stage pipeline. Users see not only
*what* the system predicts, but *why* — and *how much to trust it*.

---

## 🚀 Quick Start

**One click. From a bare clone:**

| Platform | Command |
|---|---|
| Windows | double-click **`ecomind.bat`** |
| macOS / Linux | `./ecomind.sh` |

The launcher installs anything missing (Python 3.10+, Node 18+, `.venv`,
backend requirements, `pnpm install`), generates `backend/.env` with a random
secret key, seeds the database with the built-in dataset catalogue, starts the
backend, waits until it is healthy, and opens your browser.

Then open **http://127.0.0.1:8000** and sign in:

```
Email:    admin@ecomind.ai
Password: admin123
```

Other commands (same entry point):

```
ecomind start     start the app (default)
ecomind stop      stop every service
ecomind check     report on the machine without changing it
ecomind verify    install everything, prove it worked, exit
```

The first run takes a few minutes while dependencies download; later runs
start in seconds. Steps are idempotent and keyed on file hashes.

> **If Python was just installed**, close the window and run it again — the
> launcher cannot swap the interpreter it is itself running under, and it says
> so rather than pretending otherwise.

---

## ✨ The ten stages

Preparation must all pass before any decision stage is reachable.

| # | Stage | What you get |
|---|-------|--------------|
| 1 | **Library** | Dataset library with provenance, row/column/device counts and defect rates |
| 2 | **Import** | Estate census: buildings, floors, rooms, devices, rows and date range |
| 3 | **Schema** | Every column, its detected type, the role it plays, and the evidence for trusting it |
| 4 | **Data Quality** | Structural rules across five dimensions, severity-scored; a critical rule passes only with zero violations |
| 5 | **Transformation** | Five steps (normalise, encode, scale, aggregate, derive) with field-level before/after |
| 6 | **Model Selection** | Candidates on one identical split, chosen on measured results — every candidate carries a written `selection_rationale`, near-ties stated |
| 7 | **Anomalies** | Where and when energy is wasted, measured against each device's own hour-of-week baseline — the baseline's version is recorded with every anomaly |
| 8 | **Forecast** | Hourly uncertainty band + per-horizon outlook, with the hour-of-week naive baseline for comparison |
| 9 | **Recommendations** | Prioritised actions with receipts, savings inventory, payback verdicts and a programme roll-up |
| 10 | **Report** | Twelve sections in locked order, assembled from the recorded stage outputs |

A stage is executed once and recorded. Every screen reads that stage's own
recorded output, so no page can disagree with what actually ran. Adaptive
baselines, artifact versions and audit events are persisted and browsable.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EcoMind AI Platform                     │
├────────────────────────────┬────────────────────────────────┤
│  React 19 + TypeScript     │   FastAPI + SQLAlchemy          │
│  Vite · TanStack Query     │   JWT auth · SSE streaming      │
│  Recharts · lucide icons   │   pandas · scikit-learn         │
│  serves from frontend/dist │   hour-of-week baselines        │
└────────────────────────────┴────────────────────────────────┘
```

- **`backend/`** — FastAPI REST + SSE API, JWT auth, SQLAlchemy, one service
  per stage; also serves the built SPA from `frontend/dist/` on **:8000**
- **`frontend/`** — Vite + React SPA (`client/src`), pnpm, builds to `frontend/dist/`
- **`launcher/`** — the one start path (bootstrap, checks, spawn, stop, monitor)
- **`docs/`** — [`STATUS.md`](docs/STATUS.md) (what is built, broken, next) + IEEE paper & research

---

## 🧪 Tests & checks

```bash
# Backend — 106 tests
.\.venv\Scripts\python.exe -m pytest backend

# Frontend — typecheck + production build
cd frontend
npx tsc --noEmit
pnpm build:static
```

### Manual setup (developers)

```bash
# Backend — the virtualenv lives at the repository root (.venv)
python -m venv .venv
.venv\Scripts\activate                       # Windows (source .venv/bin/activate on macOS/Linux)
pip install -r backend/requirements.txt
python backend/seed.py                       # generate the catalogue + admin user
cd backend; uvicorn app.main:app --port 8000 # → http://127.0.0.1:8000 (serves the SPA)

# Frontend (optional — only for vite HMR; proxies /api to :8000)
cd frontend
pnpm install
pnpm dev:static                              # → http://127.0.0.1:5173
```

### Built-in dataset catalogue

A fresh clone needs no downloads — setup generates and registers:

| Dataset | What it is |
|---|---|
| **EcoMind Healthy Campus** | 2 buildings · 26 rooms · 102 devices · 90 days hourly — clean baseline with only trace noise |
| **EcoMind Fault Simulation Campus** | Same estate with injected faults: stuck meters, an HVAC failure, sensor dropouts, spikes and occupancy mismatches |
| **BDG2 Electricity Meters** | 3-year hourly **open data** (UCI ElectricityLoadDiagrams20112014 via Zenodo 3898439), 9 building meters |

Regenerate them without the launcher:
`.venv\Scripts\python.exe scripts\build_datasets.py` (`--dataset healthy|faulty|reference|all`).

### Twenty more fields — EcoMind is not a buildings-only tool

`scripts/build_field_datasets.py` generates and registers **twenty energy domains**, each with its own
hierarchy codes, equipment, cadence and target column, and each deterministic so a re-run reproduces
the same file:

| Field | Target | Field | Target |
|---|---|---|---|
| Commercial building | `energy_kwh` | Solar PV plant | `generation_kwh` |
| Manufacturing plant | `energy_kwh` | Wind farm | `generation_kwh` |
| Hospital | `energy_kwh` | EV charging hub | `energy_kwh` |
| University campus | `energy_kwh` | District heating | `heat_kwh` |
| Shopping mall | `energy_kwh` | Water treatment | `energy_kwh` |
| Warehouse / cold chain | `energy_kwh` | Airport terminal | `energy_kwh` |
| Office complex | `energy_kwh` | Hotel resort | `energy_kwh` |
| Data centre | `energy_kwh` | Telecom tower site | `energy_kwh` |
| Cold storage facility | `energy_kwh` | Mining site | `energy_kwh` |
| Railway station | `energy_kwh` | Cement plant | `energy_kwh` |

```bash
.venv\Scripts\python.exe scripts\build_field_datasets.py            # write + register
.venv\Scripts\python.exe scripts\build_field_datasets.py --prune    # replace its own earlier uploads
.venv\Scripts\python.exe scripts\build_field_datasets.py --no-upload --days 30
```

Each file carries a planted fault window (so anomaly detection has something real to find) and one
malformed row (so the quality stage has a real defect to repair). The CSVs land in `sample-datasets/`,
which is gitignored — re-run the script to recreate them.

The frontend adapts to whichever field is loaded: the domain vocabulary, the unit vocabulary and the
signal-family vocabulary all cover generation, transport, telecom and water quantities, so a solar
plant is not labelled a manufacturing plant and `clinker_tonnes` is not labelled `kWh`.

---

## 📁 Project structure

```
EcoMind-AI/
├── backend/
│   ├── app/
│   │   ├── core/          # config, security (JWT)
│   │   ├── db/            # SQLAlchemy models & session
│   │   ├── domain/        # one service per stage + baselines, snapshots
│   │   ├── routes/        # auth, datasets, workflow, baseline, activity
│   │   └── workflow/      # ten-stage orchestration + SSE event bus
│   ├── data/              # runtime data (gitignored, regenerated)
│   ├── requirements.txt
│   └── seed.py            # demo data generator
├── frontend/
│   ├── client/src/        # the SPA: shell, views, lib (api, workspace loader)
│   ├── shared/            # shared constants
│   ├── vite.config.ts     # builds to frontend/dist (served by FastAPI)
│   └── package.json       # pnpm
├── launcher/              # bootstrap, checks, spawn, stop — one start path
├── ecomind.bat / .sh      # the single entry point per platform
├── docs/                  # report, changelog, decisions, status, IEEE paper
└── .venv/                 # Python virtualenv (repository root)
```

## 📚 Documentation

| Document | Description |
|---|---|
| [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md) | **End-to-end report** — architecture, the stage-by-stage pipeline, API surface, verified status, demo script |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Every change, with the evidence it was verified against |
| [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) | The design system and the reasoning behind each decision |
| [`docs/STATUS.md`](docs/STATUS.md) | Backend truth: what is implemented, what is deliberately absent |
| [`docs/EcoMind_IEEE_Paper.tex`](docs/EcoMind_IEEE_Paper.tex) | IEEE-format technical paper (+ `docs/research/` assets) |

## 🔒 Security Notes

- **Passwords** are hashed with [`bcrypt`](https://pypi.org/project/bcrypt/) at
  cost 12, called directly rather than through `passlib`. `passlib` 1.7.4 —
  which was pinned until 2026-10-04 — raises `ValueError` against `bcrypt`
  4.1+, so a fresh install could not create a user at all. It is gone for
  that reason, not for style. Existing password hashes still verify.
- `ECOMIND_SECRET_KEY` is **generated randomly on first launch** and written
  to `backend/.env`. If it is ever missing, too short, or still the
  placeholder from `.env.example`, the launcher replaces it on the next
  start. Never commit `backend/.env`; it is gitignored.
- Demo credentials (`admin@ecomind.ai` / `admin123`) are for local
  evaluation only. Change or disable them before exposing the API.
- JWTs expire in 24 h and every protected route requires `Authorization: Bearer`.
- SSE uses a **60-second, single-purpose stream token** minted by
  `POST /api/v1/workflows/{run_id}/stream-token` — ordinary session tokens
  are rejected there, so a 24-hour credential can never land in access logs.

## 🩺 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No Python interpreter found` | Nothing installed, or the Microsoft Store `python` alias is intercepting | The launcher installs it automatically via winget/Chocolatey/Homebrew/apt. If that fails, install from [python.org](https://www.python.org/downloads/) and tick **Add python.exe to PATH**, then reopen the terminal. |
| Installed Python, still says none found | The shell's PATH predates the install | Close the window and run the launcher again. |
| `[FAIL] Seeding failed` | Read `logs/launcher.log` — usually a dependency that failed to install | Run `.\ecomind.bat check`, then re-run. |
| Port 8000 already in use | Another process holds it | `.\ecomind.bat stop`, or change the port in `launcher/config.json`. |
| A page renders but shows no data | That pipeline stage has not run for this dataset | Press **Run** in the bar at the top of any page, or **Step** to advance one stage. |
| `ECOMIND_SECRET_KEY is the development placeholder` | `backend/.env` was deleted or never generated | Run `.\ecomind.bat` — it regenerates one. |

Useful logs: `logs/launcher.log` (bootstrap), `logs/backend.log`.

## 🎬 Running a demonstration

The run controls live in the bar under the topbar, on **every** page, so a walkthrough never has to
hunt for them:

| Control | What it does |
|---|---|
| **Run** | Executes every remaining stage, then opens the executive report |
| **Step** | Executes exactly one stage |
| **Stop** | Aborts the active run; everything recorded before the stop is kept |
| **New run** | Starts a fresh run for the active dataset from stage 01 |

Every one of these works on a dataset that has never been analysed — they start a run when none
exists rather than sitting disabled. **Guided tour** on Mission control additionally opens each page
as its stage completes, so the pipeline can be narrated. A short chime marks the start of a run and
another marks its completion.

A ten-minute script is in [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md) §10.

## 🗺️ Roadmap

- [ ] Archive the orphaned/failed workflow runs so the library and run history stay clean
- [ ] Docker Compose for one-command full-stack startup
- [ ] Multi-tenant workspaces with role-based access
- [ ] Live meter integrations (MQTT / Modbus / BACnet)
- [ ] Scheduled retraining with drift detection

## 📄 License

Released under the [MIT License](./LICENSE).

---

<div align="center">

Built with ⚡ by **Shashank Gowda N C** — [GitHub](https://github.com/shashu123456) · Bengaluru, India

</div>
