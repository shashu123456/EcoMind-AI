<div align="center">

# ⚡ EcoMind AI

**Adaptive, Explainable Energy Intelligence Platform**

*Trustworthy AI begins with trustworthy data.*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
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

## ✨ The ten stages

Preparation must all pass before any decision stage is reachable.

| # | Stage | What you get |
|---|-------|--------------|
| 1 | **Library** | Dataset library with provenance, row/column/device counts and defect rates |
| 2 | **Import** | Estate census: buildings, floors, rooms, devices, rows and date range |
| 3 | **Schema** | Every column, its detected type, the role it plays, and the evidence for trusting it |
| 4 | **Data Quality** | Eight rules across five dimensions, severity-scored; a critical rule passes only with zero violations |
| 5 | **Transformation** | Five steps (normalise, encode, scale, aggregate, derive) with field-level before/after |
| 6 | **Model Selection** | Five candidates on one identical split, chosen on measured results — near-ties stated |
| 7 | **Anomalies** | Where and when energy is wasted, measured against each device's own hour-of-week baseline |
| 8 | **Forecast** | Short (recursive hourly) and long (extrapolated) tiers, with uncertainty bands and demand peak |
| 9 | **Recommendations** | Prioritised actions with receipts, grouped savings, and a programme roll-up |
| 10 | **Report** | Twelve sections in locked order, assembled from the recorded stage outputs |

A stage is executed once and recorded. Every screen reads that stage's own
recorded output, so no page can disagree with what actually ran.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EcoMind AI Platform                     │
├────────────────────────────┬────────────────────────────────┤
│  React 18 + TypeScript     │   FastAPI + SQLAlchemy         │
│  Vite · Tailwind · Zustand │   JWT auth · SSE streaming     │
│  TanStack Query/Router     │   Pandas · scikit-learn        │
│  Custom chart kit          │   XGBoost · statsmodels        │
└────────────────────────────┴────────────────────────────────┘
```

- **Backend** — `backend/` — FastAPI REST + SSE API, JWT auth, SQLAlchemy,
  one service per stage
- **Frontend** — `frontend/` — Vite + React SPA, ten stage screens
- **Docs** — `docs/` — architecture, API contract, status, design system, IEEE paper

## 🚀 Quick Start

### One click (recommended)

The launcher sets up **everything** on first run: it creates the virtualenv,
installs the Python and Node dependencies, writes `backend/.env`, generates the
dataset catalog, seeds the database, and starts both services.

- **Windows** — double-click **`ecomind.bat`**
- **macOS / Linux** — `./ecomind.sh`

If Python or Node are missing, the launcher installs them for you (winget on
Windows, Homebrew on macOS, apt / dnf / pacman on Linux). The first run takes a
few minutes while dependencies download; later runs start in seconds.

There is one entry point per platform, and the other two actions are arguments
to it:

```
ecomind            start (default)
ecomind stop       stop every service
ecomind check      report on the machine without changing it
ecomind help       list the commands
```

Then open **http://127.0.0.1:5173** and sign in:

```
Email:    admin@ecomind.ai
Password: admin123
```

### Built-in dataset catalogue

A fresh clone needs no downloads — the setup generates three datasets
deterministically and registers them in the Library:

| Dataset | What it is |
|---|---|
| **EcoMind Healthy Campus** | 2 buildings · 26 rooms · 102 devices · 90 days hourly — clean baseline with only trace noise |
| **EcoMind Fault Simulation Campus** | Same estate with injected faults: stuck meters, an HVAC failure, sensor dropouts, spikes and occupancy mismatches |
| **BDG2 Electricity Meters** | 3-year hourly **open data** (UCI ElectricityLoadDiagrams20112014 via Zenodo 3898439), 9 building meters |

Regenerate them without the launcher:
`.venv\Scripts\python.exe scripts\build_datasets.py` (`--dataset healthy|faulty|reference|all`).

### Manual setup (developers)

```bash
# Backend — the virtualenv lives at the repository root (.venv)
python -m venv .venv
.venv\Scripts\activate                       # Windows (source .venv/bin/activate on macOS/Linux)
pip install -r backend/requirements.txt
python backend/seed.py                       # generate the catalogue + admin user
python backend/run.py                        # → http://127.0.0.1:8000

# Frontend
cd frontend
npm install
npm run dev                                  # → http://127.0.0.1:5173
```

Vite proxies `/api` to `http://localhost:8000`.

## 🧪 Tests

```bash
# Backend
.\.venv\Scripts\python.exe -m pytest backend\tests

# Frontend
cd frontend
npx tsc -b
npx vitest run
```

### Formatting

```bash
# Backend (Black + Ruff)
.\.venv\Scripts\python.exe -m black backend
.\.venv\Scripts\python.exe -m ruff check --fix backend

# Frontend (Prettier)
cd frontend
npm run format
```

## 📁 Project Structure

```
EcoMind-AI/
├── backend/
│   ├── app/
│   │   ├── core/          # config, security (JWT)
│   │   ├── db/            # SQLAlchemy models & session
│   │   ├── domain/        # one service per stage + shared helpers
│   │   ├── routes/        # auth, datasets, health, workflow
│   │   └── workflow/      # ten-stage orchestration + SSE event bus
│   ├── data/              # runtime data (gitignored, regenerated)
│   ├── requirements.txt
│   └── seed.py            # demo data generator
├── frontend/
│   ├── src/
│   │   ├── app/           # shell, router, page frame, stage gate
│   │   ├── lib/           # api client, ui kit, charts, journey store
│   │   └── pages/         # one page per stage
│   └── ...
├── docs/                  # architecture, API contract, status, IEEE paper
└── .venv/                 # Python virtualenv (repository root)
```

## 📚 Documentation

| Document | Description |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | What is built, what is not, and what is verified |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | REST/SSE reference for the ten-stage contract |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Design tokens & UI system |
| [`docs/EcoMind_IEEE_Paper.tex`](docs/EcoMind_IEEE_Paper.tex) | IEEE-format technical paper |

Archived planning documents (describing the superseded 17-stage design) live in
`docs/archive/`.

## 🔒 Security Notes

- `SECRET_KEY` defaults to a dev value — **always override it before any real
  deployment**.
- Demo credentials are for local evaluation only; change or disable them before
  exposing the API.
- JWTs expire in 24h; all protected routes require `Authorization: Bearer`.

## 🗺️ Roadmap

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
