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

EcoMind AI transforms raw organizational energy datasets into **trusted, explainable, actionable** decisions through a transparent, end-to-end AI workflow — for universities, hospitals, offices, manufacturing, hotels, airports, malls, and data centers.

Unlike black-box prediction engines, every prediction, recommendation, and benchmark on the platform is **traceable** through a 15-stage processing pipeline. Users see not only *what* the system predicts, but *why* — and *how much to trust it*.

---

## ✨ Key Capabilities

| | Capability | What you get |
|---|---|---|
| 🗂️ | **Dataset & Schema Intelligence** | Drag-and-drop CSV/Excel import, automatic schema discovery with semantic typing |
| 🧪 | **Data Quality Engine** | 20+ validation rules across 6 quality dimensions, with severity scoring |
| 🔄 | **Transformations with Full Audit** | Impute, scale, encode, clip — every change diffed, previewed, and reversible |
| 🛠️ | **Feature Engineering** | Auto + expression-driven features (lags, rollups, ratios, cyclical encodings) |
| 🤖 | **Model Training & Registry** | XGBoost / Random Forest / Linear with versioned model registry |
| 🔮 | **Explainable Predictions** | Forecasting with SHAP explainability, stability index, narrative explanations |
| 🚨 | **Anomaly Detection** | Ensemble (Isolation Forest + Z-score) with contextual evidence per flag |
| 💡 | **Recommendations** | Evidence-backed energy-saving actions with estimated kWh/₹ savings |
| ✅ | **Confidence Gate** | Novel multi-factor trust verdict gating every automated decision |
| ⚖️ | **Benchmarking** | Model-vs-model leaderboard + raw-vs-processed ablation study |
| 📊 | **Executive Center** | Board-ready summaries, branded PDF/HTML/CSV report generation |
| 💬 | **AI Concierge** | Chat interface answering *why* behind any stage, grounded in run traces |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EcoMind AI Platform                     │
├────────────────────────────┬────────────────────────────────┤
│  React 18 + TypeScript     │   FastAPI + SQLAlchemy         │
│  Vite · Tailwind · Zustand │   JWT auth · SSE streaming     │
│  TanStack Query/Router     │   Pandas · scikit-learn        │
│  Recharts · ReactFlow      │   XGBoost · SHAP               │
└────────────────────────────┴────────────────────────────────┘
```

- **Backend** — `backend/` — FastAPI REST + SSE API, JWT auth, SQLAlchemy, ML services
- **Frontend** — `frontend/` — Vite + React SPA with a terminal-style stage UI
- **Launcher** — `launcher/` — one-click Windows launcher (`Launch_EcoMind.bat`)
- **Docs** — `docs/` — architecture, API contract, IEEE paper, design system

## 🚀 Quick Start

**Prerequisites:** Python 3.11+, Node 18+, npm

### 1 · Clone and set up the backend

```bash
git clone https://github.com/shashu123456/EcoMind-AI.git
cd EcoMind-AI/backend

python -m venv .venv
.venv\Scripts\activate          # Windows  (use `source .venv/bin/activate` on macOS/Linux)
pip install -r requirements.txt

copy .env.example .env          # adjust if needed (defaults work out of the box)
python run.py                   # → http://localhost:8000  (docs at /docs)
```

### 2 · Seed demo data (30-day BDG2-inspired energy dataset)

```bash
python seed.py
```

### 3 · Set up the frontend

```bash
cd ../frontend
npm install
npm run dev                     # → http://localhost:5173
```

### 4 · Sign in

```
Email:    admin@ecomind.ai
Password: admin123
```

### One-click (Windows)

Double-click **`Launch_EcoMind.bat`** — it checks prerequisites, starts the backend on `:8000` and frontend on `:5173`, and opens your browser. (`Check_System.bat` verifies the environment; `Stop_EcoMind.bat` stops everything.)

## 🧪 Tests

```bash
# Backend
cd backend
.venv\Scripts\python -m pytest          # or: python -m pytest

# Frontend
cd frontend
npm test
```

## 📁 Project Structure

```
EcoMind-AI/
├── backend/
│   ├── app/
│   │   ├── core/          # config, security (JWT)
│   │   ├── db/            # SQLAlchemy models & session
│   │   ├── domain/        # 20+ ML & data services
│   │   ├── events/        # SSE event bus
│   │   ├── routes/        # FastAPI routers
│   │   └── workflow/      # 15-stage orchestration engine
│   ├── data/              # runtime data (gitignored, regenerated)
│   ├── requirements.txt
│   ├── run.py             # API entrypoint
│   └── seed.py            # demo data generator
├── frontend/
│   ├── src/
│   │   ├── components/    # UI kit, stage terminals, process rail
│   │   ├── lib/           # typed API client, theme, interactivity
│   │   └── pages/         # one page per pipeline stage
│   └── ...
├── docs/                  # architecture, API contract, IEEE paper
├── scripts/               # large-dataset builder, e2e demo
├── Makefile               # make seed / backend / frontend / test
└── Launch_EcoMind.bat     # one-click Windows launcher
```

## 📚 Documentation

| Document | Description |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture deep-dive |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | Complete REST/SSE API reference |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Design tokens & UI system |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Development log & milestones |
| [`docs/EcoMind_IEEE_Paper.tex`](docs/EcoMind_IEEE_Paper.tex) | IEEE-format technical paper |
| [`PROJECT_MASTER_BLUEPRINT.md`](PROJECT_MASTER_BLUEPRINT.md) | Authoritative project blueprint |

## 🔒 Security Notes

- `SECRET_KEY` defaults to a dev value — **always override via `.env` before any real deployment**.
- Demo credentials are for local evaluation only; change or disable them before exposing the API.
- JWTs expire in 24h; all protected routes require `Authorization: Bearer` headers.

## 🗺️ Roadmap

- [ ] Docker Compose for one-command full-stack startup
- [ ] Multi-tenant workspaces with role-based access
- [ ] Live meter integrations (MQTT / Modbus / BACnet)
- [ ] Scheduled retraining with drift detection
- [ ] Additional explainers (LIME, counterfactuals)

## 📄 License

Released under the [MIT License](./LICENSE).

---

<div align="center">

Built with ⚡ by **Shashank Gowda N C** — [GitHub](https://github.com/shashu123456) · Bengaluru, India

</div>
