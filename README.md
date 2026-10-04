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

The launcher sets up **everything** on first run. From a bare clone of the repo, it
will:

1. **install Python** if the machine has none (winget / Chocolatey on Windows,
   Homebrew on macOS, apt / dnf / pacman on Linux);
2. **install Node.js** if it is missing or older than 18;
3. create the `.venv` virtualenv and install `backend/requirements.txt`;
4. run `npm install` in `frontend/`;
5. write `backend/.env` with a **randomly generated** `ECOMIND_SECRET_KEY`;
6. create and seed the SQLite database with the sample datasets;
7. start the backend and the frontend, wait for both to answer, and open the
   browser.

Steps 1–6 are idempotent and keyed on file hashes, so later runs cost a few
hash comparisons rather than a reinstall.

- **Windows** — double-click **`ecomind.bat`**
- **macOS / Linux** — `./ecomind.sh`

> **Verified, not assumed.** This path was tested by cloning the repository to
> an empty directory — no virtualenv, no `node_modules`, no `.env`, no database
> — and running the single command on the result. It installs, seeds, serves,
> and accepts a login on the freshly seeded credentials. If a future dependency
> release breaks it the same way, a fresh clone fails loudly at that first run
> rather than looking subtly wrong later.

The first run takes a few minutes while dependencies download; later runs start
in seconds.

> **If Python was just installed**, close the window and run it again. The
> launcher cannot swap the interpreter it is itself running under, and it says
> so rather than pretending otherwise.

> **On Linux**, installing system packages may ask for your `sudo` password.
> Everything else runs unprivileged.

### The one thing worth knowing about `backend/.env`

`ECOMIND_SECRET_KEY` signs every JWT this app issues. If it is missing, empty,
too short, or still the placeholder from `.env.example`, the launcher **replaces
it with a fresh random key on the next start** — your other settings and
comments are left untouched. This runs every launch, so a `.env` hand-copied
from the example is repaired automatically rather than quietly signing
forgeable tokens.

There is one entry point per platform, and the other actions are arguments to
it:

```
ecomind            start (default)
ecomind stop       stop every service
ecomind check      report on the machine without changing it
ecomind verify     install everything, prove it worked, exit
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

- **Passwords** are hashed with [`bcrypt`](https://pypi.org/project/bcrypt/) at
  cost 12, called directly rather than through `passlib`. `passlib` 1.7.4 — which
  was pinned until 2026-10-04 — raises `ValueError` against `bcrypt` 4.1+, so a
  fresh install could not create a user at all. It is gone for that reason, not
  for style. Existing password hashes still verify: nothing is invalidated by
  the upgrade.
- `ECOMIND_SECRET_KEY` is **generated randomly on first launch** and written to
  `backend/.env`. If it is ever missing, too short, or still the placeholder from
  `.env.example`, the launcher replaces it on the next start and the backend
  warns loudly at startup. Never commit `backend/.env`; it is gitignored.
- Demo credentials (`admin@ecomind.ai` / `admin123`) are for local evaluation
  only. Change or disable them before exposing the API.
- JWTs expire in 24h and every protected route requires `Authorization: Bearer`.
- **Known limitation:** none outstanding for the SSE stream. `EventSource`
  cannot send an `Authorization` header, so the stream endpoint takes a
  credential in its query string — but that credential is now a **60-second,
  single-purpose stream token** minted over the header by
  `POST /api/v1/workflows/{run_id}/stream-token`. An ordinary session token is
  rejected there, so a 24-hour credential can no longer land in access logs.

## 🩺 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No Python interpreter found` | Nothing installed, or the Microsoft Store `python` alias is intercepting | The launcher installs it automatically via winget/Chocolatey/Homebrew/apt. If that fails, install from [python.org](https://www.python.org/downloads/) and tick **Add python.exe to PATH**, then reopen the terminal. |
| Installed Python, still says none found | The shell's PATH predates the install | Close the window and run the launcher again. |
| `[FAIL] Seeding failed` | Read `logs/launcher.log` — usually a dependency that failed to install | Run `./ecomind check`, then re-run. |
| `ECONNREFUSED` in the terminal during startup | The frontend is up before the backend is listening | Should not happen — the launcher waits for the backend before starting the frontend. Harmless if it appears during a restart. |
| Port 8000 or 5173 already in use | Another process holds it | `./ecomind stop`, or change the port in `launcher/config.json`. |
| A page renders but shows no data | That pipeline stage has not run | Use **Run remaining** in the top bar. |
| `ECOMIND_SECRET_KEY is the development placeholder` | `backend/.env` was deleted or never generated | Run `./ecomind` — it regenerates one. |

Useful logs: `logs/launcher.log` (bootstrap), `logs/backend.log`, `logs/frontend.log`.

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
