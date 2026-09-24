# EcoMind-AI — Golden Experimental Evidence (source of truth)

> All numbers below were **queried live** from the running EcoMind-AI system
> (FastAPI :8000 behind Vite :5173) on 2026-09-23. Do not invent numbers. If a
> number is missing here, look it up before writing it into the paper.

## System
- App: EcoMind-AI — an offline, self-contained energy-intelligence platform.
- Stack: FastAPI + SQLite (WAL) backend, React/Vite frontend, 17-stage workflow engine.
- API base: `/api/v1`, auth: JWT Bearer (`admin@ecomind.ai`).
- DB: `data/ecomind.db`, 21 tables, `total_stages=17`.

## Dataset
- Dataset `b61c2b04` — `EcoMind_sample_energy.csv` (sample/seed energy data).
- **3,600 rows, 12 columns, 298,893 bytes**, upload.
- 5 assets, hourly timestamps (median interval **3600 s**), span **30 days** (2,588,400 s).
- Target column: `energy_kwh`. Other columns include `power_kw`, `voltage_v`,
  `current_a`, `power_factor`, `temperature_c`, `humidity_pct`, `occupancy_count`.
- (Secondary datasets `a6e6405c` / `28ae70af` are BDG2 30-day variants: not used for headline numbers.)

## Data Quality (GET /datasets/{ds}/dq) — rule scores are all /100
| Rule | Dimension | Score | Key detail |
|---|---|---|---|
| completeness | completeness | 100 | 0 null / 43,200 cells |
| validity_semantic_bounds | validity | 100 | 18,000/18,000 in bounds |
| consistency_duplicates | consistency | 100 | 0 duplicate rows |
| consistency_monotonic_timestamps | consistency | 96.7 | 120 non-monotonic rows |
| validity_identifiers | validity | 100 | 5 unique assets |
| accuracy_outliers_iqr | accuracy | 98.4 | 394 IQR outliers (energy_kwh 41, power_kw 38, occupancy 315); min(rate,0.5)-clamped |
| accuracy_zscore | accuracy | 99.9 | 3 extreme points, z-threshold 5 |
| timeliness_temporal_gaps | timeliness | 100 | 0 missed intervals |

- `passed_count=8`, `failed_count=0`, severities: 6 info / 2 warning.
- **WARNING (semantics):** GET `overall_score=159` is `Σ(rule scores)/#dimensions`
  = 795/5 = 159. **It is NOT a percentage and range is unbounded.** The POST-run
  (`dq/run`) variant is `0.25 × Σ(per-dimension means)` over 5 dims → max 125
  (weights sum to 1.25 — a known bug; docstring claims 0-100).
  → In the paper use **per-rule /100 scores** and the **trust-gate dq_score=100**
  (see Confidence Gate). Never write "overall DQ 159/100".

## Model Leaderboard (GET /benchmarks/{ds}/benchmarks) — methodology `time_series_split`
Chronological 70/30 holdout (`cut = int(n·0.7)`), same split for every algorithm,
Ridge(alpha=1.0), XGBoost/GBM/RF sklearn defaults. Entry id `10c3457b` (2026-09-22).

| Algorithm | R² | RMSE | MAE | MAPE | Expl.Var |
|---|---|---|---|---|---|
| xgboost | 0.9147 | 1.3740 | 0.1235 | 1.57 | 0.9149 |
| random_forest | 0.9162 | 1.3624 | 0.1191 | 1.44 | — |
| **gradient_boosting** (winner) | **0.9175** | **1.3517** | **0.1120** | **1.32** | 0.9176 |
| ridge | 1.0000 | 0.0048 | 0.0024 | 0.09 | 1.0000 |

- **LEAKAGE WARNING:** Ridge r²=1.0 is a target-leakage artifact, not skill.
  `derive_features` runs **before** the split and creates `lag_1h=y_{t-1}` and
  `diff_1h=y_t−y_{t-1}` ⇒ `y_t = diff_1h + lag_1h` exactly; also `rolling_mean_24h`
  (window inclusive of y_t), `load_factor=y_t/power_kw`, `energy_density=y_t/occupancy`.
  → In the paper, present gradient_boosting as best *legitimate* model, and report
  ridge's r²=1.0 honestly as a leakage case the platform detects. This is a real,
  defensible finding (target-derived features must be excluded from splits).

## Predictions (all 8 models on b61c2b04) — suspiciously identical
Every model records r2=0.9153, rmse=1.3692, mae=0.121, mape=1.58, exvar=0.9155.
Likely same deterministic split/features; explainability features differ:
- `shap_stability` is **mislabeled**: it is `max(0, Pearson(argsort(mean|SHAP|), arange))×100`
  (a column-order-alignment index, scale 0-100), NOT explanation stability, and is
  non-reproducible (unseeded `X.sample(≤200)`). Exactly 0 = clamped non-positive corr.
- The **real** stability metric is `shap_service._stability`: Spearman correlation of
  feature rankings between two random half-samples, stored as `__stability_index`.

## Raw vs Processed (newly run 2026-09-23 via POST /comparison/{run}/raw-processed/run)
Algorithm xgboost, same 70/30 chronological split, 17 features both sides.
**Honest headline result: cleaning did NOT change predictive performance.**
| Run | side | R² | RMSE | MAE | MAPE | shap_stability |
|---|---|---|---|---|---|---|
| 776bf594 | raw | 0.9153 | 1.3692 | 0.121 | 1.58 | 11.0 |
| 776bf594 | processed | 0.9153 | 1.3692 | 0.121 | 1.58 | 5.9 |
| 5c8dd728 | raw | 0.9153 | 1.3692 | 0.121 | 1.58 | 9.1 |
| 5c8dd728 | processed | 0.9153 | 1.3692 | 0.121 | 1.58 | 0.0 |

- `improvement`: r2_delta=0, rmse/mae/mape delta_pct=0 (deltas computed as absolute
  diffs, not pct — misnomer), shap_stability_delta = −5.1 / −9.1.
- `shap_divergence` = |stab_raw−stab_proc| + |r2_raw−r2_proc| = 5.1 / 9.1 (NOT cosine, despite DB comment).
- System `conclusion` (both runs): *"Raw data matched or beat cleaned data here —
  possible over-cleaning or already-high quality input."*
- → Paper framing: on already-clean/sparse seed data, the raw-vs-processed stage
  verifies correctness but yields Δ≈0 — the honest negative result validates that
  DQ-driven cleaning is data-dependent (QED for the "DQ first" thesis).

## Confidence Gate (GET /ai/{ds}/confidence) — run 5c8dd728, 2026-09-17
- **trust_score = 94.5**, verdict **high_trust**.
- Factors: prediction_confidence=100, dq_score=100, model_relevance=91.5, shap_stability=75.
- Weights: pred 0.40, dq 0.25, model_relevance 0.20, shap_stability 0.15.
- Executive headline (from /ai/{ds}/executive): *"Trust 94/100 (high_trust) with DQ 100 and best model xgboost."*

## Registry (GET /api/v1/registry)
- 16 entries, all version=1, is_current=false, status=staging.
- `adbdca09` → model `84a9df08` (gradient_boosting): performance_summary r2=0.9175,
  rmse=1.3517, mae=0.112, training_rows=2091, dataset_hash=5a5ce1ca2c, feature_count=17.

## Workflows
- `GET /workflows`: many runs persisted with `status="running"` (default at creation).
  A run flips to `completed` **only after all 17 stage keys execute** via
  `/workflows/{run}/stages/{key}/exec` or `/advance`. No background auto-runner.
- 17 stages (canonical): library, import, raw_preview, schema_discovery, dq_engine,
  transformation, feature_engineering, prediction, confidence_gate, raw_vs_processed,
  shap, anomaly, benchmarking, recommendation, executive_center, report, history_registry.
- Seed injects one `completed` run with integer `stages_completed=1..18` (inconsistent
  with key-based engine — a known seed artifact).

## Counts used by the paper
- 21 DB tables, 55+ API routes, 17 workflow stages, 8 DQ rules, 5 DQ dimensions,
  ≥8 models, 16 registry rows, 3,600 rows / 43,200 cells audited, 2,091 training rows,
  17 engineered features, 70/30 chronological split, 30-day horizon, 5 assets.

## Tooling for paper build
- pdflatex/xelatex/lualatex (MiKTeX): `C:\Users\kavitha\AppData\Local\Programs\MiKTeX\miktex\bin\x64\`
- pandoc: `C:\Users\kavitha\AppData\Local\Pandoc\pandoc.exe`

## Repo layout (as of 2026-09-23)
- `backend/app/{main.py, core/, db/, api/, domains/, pipeline/, quality/, features/,
  ml/, reports/, events/}` — note ARCHITECTURE.md writes routes under `api/`,
  PROGRESS.md writes `routes/`; actual review found `backend/app/routes/` (55 routes).
- `frontend/src/{router.tsx, lib/journey.ts, app/, stages/, components/, api/, state/,
  styles/tokens.css}`
- Root `docs/`: API_CONTRACT.md, ARCHITECTURE.md, BUILD_LOG.md, DESIGN_PLAN.md,
  DESIGN_SYSTEM.md, PROGRESS.md, (stale) EcoMind_IEEE_Paper.tex — plus new `research/`.