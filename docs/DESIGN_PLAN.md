# EcoMind AI — DESIGN_PLAN v1.0

**Status:** LOCKED · **Mode:** Build (active) · **Date:** 21 Sep 2026
**Owner:** kavitha (org lead) · **Repo:** `C:\Users\kavitha\Downloads\EcoMind-AI-main\`

---

## 0. Three answers you locked (recap — nothing re-asked)
1. **Dataset = BDG2** (Building Data Genome Project 2 — official research dataset; DOI `10.1038/s41597-020-00759-x`; official repo `github.com/buds-lab/building-data-genome-project-2`). App ships a **curated BDG2-format sample** (never the 1.6 GB full set), stored in `datasets\bdg2\` with BDG2 schema + 6 curated demo samples.
2. **Default theme = LIGHT** (Linear/Stripe enterprise default; light desk, terminals always dark monitors). Dark available.
3. **Scope = Data Quality Engine + Dataset Library FIRST** (signature centerpiece), then the remaining stages in order.

---

## 1. Design Language (enterprise, locked)

Inspiration: Linear · Stripe · Nx · Notion · Vercel · Figma · Apple.

- **Default = LIGHT.** Generous whitespace, elegant typography, hairline borders, restrained jade accent (#2FAE8E?) — jade used only for AI signals.
- **Terminals = always dark monitors.** A dark screen on a light desk. Both themes keep terminals dark; only chrome/panels/surfaces flip.
- **Not cyberpunk.** No neon, no glowing grids, no rainbow gradients)Skip. Premium, calm, enterprise. Glass surfaces (subtle), generous motion (Framer Motion), restrained teal/jade accent.

## 2. Repository map (verified on disk, 2 passes)
- **Frontend:** `frontend\` — Vite + React 19 + TS + Tailwind + TanStack Router/Query + Framer Motion. Design kit `frontend\src\lib\kit.tsx` (~2,500 lines), pages `frontend\src\pages\`, tokens `frontend\src\styles\tokens.css`, theme engine `frontend\src\lib\theme.tsx` + `ThemeProvider` in `main.tsx` ✅.
- **Backend:** FastAPI service — DQ + prediction + SHAP + anomaly; SQLite + synthetic fallback so demo never crashes.

## 3. BDG2 Dataset Strategy (dataset = the product's data heartbeat)
- `datasets\bdg2\` — curated BDG2-format sample: `buildings.csv`, `weather.csv`, `meter_readings.csv`, `metadata.csv` (official schema, correct column headers, rounded row counts — **no invented GB claims**).
- `datasets\samples\` — 6 curated demo sets: `hospital.xlsx`, `university.xlsx`, `office.xlsx`, `mall.xlsx`, `industry.xlsx`, `government.xlsx` (same schema).
- `datasets\uploads\` — user imports (CSV/XLSX only).
- **Metadata for every dataset on disk + a metadata JSON (dataset_library.json)** so the Dataset Library screen has real data.
- Preview = first N rows only. Citation card always visible. DOI shown.

## 4. The Signature Build — Data Quality Engine (3-panel)

**Layout (enterprise calm, three panels, terminals = dark monitors):**
- **LEFT — Raw Dataset:** spreadsheets-style grid, live rows streaming in from raw upload.
- **CENTER — Processing Pipeline:** animated stage flow (validation → cleaning → transformation → normalization → feature engineering); every completed stage lights up jade; live scan-line.
- **RIGHT — Processed Dataset:** grid appears row-by-row as transformations complete.

**Bottom strip — Data Quality Score (animated):** quality % climbing as stages complete; live transformation log; per-stage color = jade on completion, gold on warning.

**Two modes:** Guided (pause at each stage, press Next, explain) / Smart (auto through all stages, pause anywhere). Toggle at top.

## 5. Build Order (first pass)
1. Write `DESIGN_PLAN.md` (this file — done).
2. Write Planda DESIGN plan). 
3. (Remaining 13 stages after DQ Engine + Dataset Library.)
4. IEEE paper — finalized on disk; repo sources + PDF/DOCX in Downloads. Task is CLOSED.

---
### 6. Dataset Integrity & Honesty (locked)
- Full BDG2 (1.6 GB) is **not** bundled; the app uses a curated BDG2-format sample; the IEEE paper + README say "sample, not full BDG2."
- Plagiarism < 1% / AI < 1% — institution tooling only; original prose + IEEE-standard citation by construction. I will not fabricate numbers.

---

*End DESIGN_PLAN.md — update on every change.*