# EcoMind-AI — Methodology

> Implementation-accurate methodology for the IEEE paper. Every formula and number
> below was read from source in `backend/app/` or taken verbatim from
> `EVIDENCE.md` (the golden measured-evidence file, queried live from the running
> system on 2026-09-23). No numbers are invented. Where the implementation
> deviates from its own documentation, we say so explicitly. A reviewer should be
> able to re-implement the pipeline from this section plus `EVIDENCE.md`.

---

## 1. Overview & Design Principles

EcoMind-AI is an offline, self-contained energy-intelligence platform that takes a
building-energy time series through a fully auditable pipeline: it assesses data
quality, cleans the signal, derives features, trains gradient-boosted forecasting
models, explains predictions with SHAP, benchmarks the models, and **gates
deployment behind a composite trust score**. Everything runs locally — no external
model APIs, no cloud dependencies — and every stage is a first-class, individually
executable step that records a trace and a human-readable decision.

Three principles govern the design:

1. **Offline / self-contained.** FastAPI + SQLite serve both the REST API and the
   React/Vite UI from one process tree. The ML stack (scikit-learn, XGBoost, SHAP)
   executes in-process on the same machine that holds the data.
2. **Determinism where it matters.** Model training seeds are fixed
   (`random_state=7`), the chronological split is a pure index cut, and feature
   derivation is a pure pandas/numpy function with no file I/O. (One documented
   exception — the stability metric in the comparison service is unseeded; §6.)
3. **Auditability.** Seventeen stages, each producing a persisted `StageTrace`
   (input snapshot, output snapshot, decision, confidence, duration), a full audit
   log, and live SSE events. The workflow is *not* a black box: an operator can
   execute stages individually or press "advance" and watch each step go
   `running → completed`.

The central research claims are (C1) a DQ engine with explicit, formula-defined
rules across five quality dimensions, (C2) honest detection of target leakage in
forecasting, (C3) a weighted trust gate that fuses DQ, predictive confidence, model
relevance, and explanation stability, and (C4) a raw-vs-processed abolition that
*verifies* when cleaning helps — and reports a null result when it does not.

## 2. Architecture

- **Backend:** FastAPI (`uvicorn app.main:app --port 8000`). Routers live under
  `backend/app/routes/` (55+ routes; note that `ARCHITECTURE.md` and
  `PROGRESS.md` refer to `api/` vs `routes/` inconsistently — the real reviewed
  tree is `routes/`). API base `/api/v1`, JWT Bearer auth (demo user
  `admin@ecomind.ai`).
- **Storage:** SQLite in WAL mode, `data/ecomind.db`, 21 tables (datasets, DQ
  results, models, predictions, SHAP explanations, workflow runs, stage traces,
  confidence gates, comparisons, audit log, event log…).
- **Frontend:** React/Vite on port 5173, proxying `/api` and `/stream` to :8000.
  Stage screens under `frontend/src/stages/` (18 screens; the canonical stage
  list is the 17 keys in `workflow/stages.py` — a known 17-vs-18 mismatch the
  seed data also exhibits, see §9).
- **Events:** an in-process SSE event bus (`app/events/event_bus.py`). The
  workflow router streams `run:{run_id}` as `text/event-stream`; emitted events
  include `run_started`, `stage_started`, `stage_completed`, `stage_failed`,
  `run_completed`, plus domain events (`quality.score`, `model.metrics`,
  `prediction.point`, `anomaly.detected`, `benchmark.row`, `report.generated`, …).
- **Pipeline:** a canonical 17-stage ordered list (`STAGES` in
  `app/workflow/stages.py`): library, import, raw_preview, schema_discovery,
  dq_engine, transformation, feature_engineering, prediction, confidence_gate,
  raw_vs_processed, shap, anomaly, benchmarking, recommendation,
  executive_center, report, history_registry.

Each stage registers a *runner* (`register_stage_runner(key)`) with signature
`run(run, db, params) -> {output, confidence, decision}`. Runners are plain
functions; registration happens at import time so the workflow executor sees every
implemented stage.

## 3. Data Quality Engine

The DQ engine (`app/domain/dq_service.py`, the primary research contribution) runs
a fixed catalog of **8 rules across 5 dimensions** — completeness, validity,
consistency, accuracy, timeliness — and persists one row per rule in
`DQResult`. Each rule returns a **score per 100** with a severity
(`info` / `warning` / `critical`) and a **pass** boolean.

### 3.1 Rules and exact formulas

Let `n` be the number of rows, `C` the number of columns, and `df` the raw
(sample) frame.

| # | Rule | Dimension | Exact formula | Details recorded |
|---|------|-----------|---------------|------------------|
| 1 | `completeness` | completeness | `100·(1 − null_cells / max(total_cells, 1))` where `null_cells = Σ df.isna()` and `total_cells = n·C` | per-column coverage, global null rate |
| 2 | `validity_semantic_bounds` | validity | `100·bounds_hits / max(bounds_total, 1)`; `ok = between(lo, hi)` over bounded columns | `SEMANTIC_BOUNDS`: voltage_v (200, 260), power_factor (0.6, 1.0), humidity_pct (0, 100), temperature_c (−20, 60), occupancy_count (0, 500); out-of-range counts per column |
| 3 | `consistency_duplicates` | consistency | `100·(1 − dup_rate)`, `dup_rate = df.duplicated().sum() / max(n, 1)` | duplicate rows, duplicate rate |
| 4 | `consistency_monotonic_timestamps` | consistency | `100` if no violations else `100·(1 − mono_bad / max(n, 1))`; violation ⇔ `timestamp.diff().seconds ≤ 0` | non-monotonic row count |
| 5 | `validity_identifiers` | validity | `100·(1 − id_rate)`, `id_rate = blank_ids / max(n, 1)`; blank ⇔ id ∈ {`""`, `"nan"`, `"None"`} | blank count, `unique_assets` |
| 6 | `accuracy_outliers_iqr` | accuracy | `100·(1 − min(iqr_rate, 0.5))` — **clamped** so the penalized portion never exceeds 50 points | fence `q1 − 3.0·IQR … q3 + 3.0·IQR` (note the 3.0× multiplier, not the classic 1.5×), per-column outlier counts, outlier rate |
| 7 | `accuracy_zscore` | accuracy | `100·(1 − z_bad / max(n, 1))`, `z = |s − μ| / σ` on the target (`energy_kwh`, else `power_kw`); `z_bad = #{z > 5}` | target column, extreme-point count, threshold 5.0 |
| 8 | `timeliness_temporal_gaps` | timeliness | `100·(1 − gaps_total / max(n, 1))`; gap ⇔ successive interval `> med·1.5` where `med` = median interval (fallback 3600 s) | median interval (s), missed intervals, time range (s) |

A fixed extra rule `sensor_failure_constant` (score 30.0, critical) fires when
`voltage_v` is constant (std = 0) — present but not fired on the sample data.

**Pass thresholds.** A rule passes iff `score ≥ 80` for severity `info` or
`warning`, and `score ≥ 70` for `critical` (dq_service.py `add()`).

### 3.2 Measured results on the reference dataset

Dataset `b61c2b04` (`EcoMind_sample_energy.csv`): **3,600 rows × 12 columns
(298,893 bytes), 5 assets, hourly median interval 3600 s, 30-day span
(2,588,400 s), target `energy_kwh`**; 43,200 cells audited.

| Rule | Score | Key detail |
|---|---|---|
| completeness | 100 | 0 null / 43,200 cells |
| validity_semantic_bounds | 100 | 18,000 / 18,000 in bounds |
| consistency_duplicates | 100 | 0 duplicate rows |
| consistency_monotonic_timestamps | 96.7 | 120 non-monotonic rows |
| validity_identifiers | 100 | 5 unique assets |
| accuracy_outliers_iqr | 98.4 | 394 IQR outliers (energy_kwh 41, power_kw 38, occupancy 315); clamped |
| accuracy_zscore | 99.9 | 3 extreme points, z-threshold 5 |
| timeliness_temporal_gaps | 100 | 0 missed intervals |

`passed_count=8`, `failed_count=0`, severities 6 info / 2 warning.

### 3.3 Aggregate scoring — and a bug the paper must report honestly

The **per-rule scores are all /100** and are the numbers to report. The engine also
exposes two *aggregate* numbers, and both are internally inconsistent with the
"/100" contract:

- **POST (`dq/run`, `run_dq`):** per-dimension means are combined as
  `overall = 0.25·Σ_d dim_mean(action over 5 dims)`. The weights sum to **1.25**,
  so the nominal maximum is **125**, not 100 (the module docstring claims "0–100
  overall score"). On this dataset: means 100, 100, 98.35, 99.15, 100 →
  `0.25·497.5 ≈ 124.4`.
- **GET (`last_result`):** `overall_score = Σ(rule scores) / #dimensions
  = 795 / 5 = 159`. This is **not a percentage**, is unbounded, and conflates the
  count of rules with the number of dimensions.

**Recommendation for the paper (per EVIDENCE.md):** report the per-rule /100 scores
(the 5-dimension quality profile) and the trust-gate `dq_score = 100` (§7). Never
write "overall DQ 159/100". The aggregate bug is itself a defensible reported
finding — it demonstrates that a quality *index* must be normalized and
arena-consistent, which is precisely the motivation for the trust gate's
weighted-fusion design.

The DQ stage's own confidence is `overall_score / 100` (here ≈1.24 from POST —
again above 1.0).
-, which the paper should flag.

## 4. Feature Engineering

Feature derivation (`app/domain/feature_utils.py::derive_features`) is a
non-mutating, pure pandas/numpy function. Given a timestamp column it adds:

| Feature | Formula | Note |
|---|---|---|
| `hour_of_day` | `timestamp.dt.hour` | calendar cycle |
| `day_of_week` | `timestamp.dt.dayofweek` | periodic seasonality |
| `is_weekend` | `dayofweek ≥ 5` as int | weekly regime |
| `month` | `timestamp.dt.month` | seasonal drift |
| `rolling_mean_24h` | `s.rolling(24, min_periods=1).mean()` | **window inclusive of y_t** |
| `rolling_std_24h` | `s.rolling(24, min_periods=1).std().fillna(0)` | conditional volatility |
| `lag_1h` | `s.shift(1)` | previous value `y_{t−1}` |
| `diff_1h` | `s.diff()` | first difference `y_t − y_{t−1}` |
| `load_factor` | `y_t / power_kw` (0→NaN) | capacity utilization proxy |
| `energy_density` | `y_t / occupancy_count` (0→NaN, clip ≥ 0.01) | per-occupant intensity |

where `target` is the first present of `energy_kwh, power_kw, energy, value, load`.
`build_ml_matrix` then drops non-numeric columns and rows with any NaN
(`X.notna().all(axis=1) & y.notna()`), and excludes the target, timestamp,
`is_anomaly`, and asset identifiers. On the reference dataset this produces
**17 feature columns** and a matrix of **2,091 training rows** (after split).

### 4.1 Held-out split: `time_ordered_split` (chronological 70/30)

```python
def time_ordered_split(X, y, test_frac=0.3):
    cut = int(n * (1 - test_frac))          # cut = int(n·0.7)
    return X.iloc[:cut], X.iloc[cut:], y.iloc[:cut], y.iloc[cut:]
```

The data is *never shuffled*: the first 70% of chronological rows train, the last
30% test — the same split for every model and every comparison run.

### 4.2 CRITICAL — target-leakage hazard (the platform's headline negative lesson)

`derive_features` runs **before** the split (inside `build_ml_matrix`), and it
creates two features that jointly encode the target:

```
lag_1h  = y_{t−1}
diff_1h = y_t − y_{t−1}      ⇒   y_t = diff_1h + lag_1h   (exactly)
```

Any linear model that discovers this exact affine identity reconstructs the target
to floating-point precision. Additional leakage-adjacent features: `rolling_mean_24h`
uses a window **inclusive of y_t**; `load_factor = y_t / power_kw` and
`energy_density = y_t / occupancy_count` both contain y_t in the numerator.

The empirical signature: **Ridge reaches r² = 1.0000 (RMSE 0.0048, MAPE 0.09)** —
a mathematically exact reconstruction, not skill (EVIDENCE leaderboard, entry
`10c3457b`). This is a real, defensible finding: **target-derived features must be
excluded from the feature set or derived *after* the split.** The paper should
document the hazard, use it to motivate a **split-then-derive** training regime,
and treat "ridge r² ≈ 1.0" as a diagnostic the platform surfaces rather than a
competitor to beat.

## 5. Prediction

### 5.1 Models

Benchmarked algorithms (`ALGORITHM_FACTORY`): `xgboost`,
`random_forest`, `gradient_boosting`, `linear`, `ridge`, `lasso`,
`extra_trees`. The headline board uses **XGBoost, Random Forest,
Gradient Boosting, and Ridge**. Default hyperparameters (documented in source):

- `xgboost`: `n_estimators=200, max_depth=6, lr=0.05, subsample=0.9,
  colsample_bytree=0.9, objective='reg:squarederror', random_state=7`
- `random_forest`: `n_estimators=250, max_depth=None, min_samples_leaf=2,
  random_state=7`
- `gradient_boosting`: `n_estimators=150, lr=0.05, max_depth=4, random_state=7`
- `ridge`: `alpha=1.0`

Metrics (`metrics_dict`): **R² (`r2_score`), RMSE √MSE, MAE, MAPE (×100 → %),
`explained_variance`**. All reported rounded to 4 decimals (MAPE to 2).

### 5.2 Leaderboard (chronological 70/30, same split for all models)

| Algorithm | R² | RMSE | MAE | MAPE | Expl.Var |
|---|---|---|---|---|---|
| xgboost | 0.9147 | 1.3740 | 0.1235 | 1.57 | 0.9149 |
| random_forest | 0.9162 | 1.3624 | 0.1191 | 1.44 | — |
| **gradient_boosting (winner)** | **0.9175** | **1.3517** | **0.1120** | **1.32** | 0.9176 |
| ridge | 1.0000 | 0.0048 | 0.0024 | 0.09 | 1.0000 |

**Presentation for the paper:** gradient_boosting is the best *legitimate* model
(r² = 0.9175); ridge's r² = 1.0 is reported honestly as the leakage artifact the
platform detects (see §4.2). Because the shared feature set is itself leaky, the
whole leaderboard should be labeled "evaluated under the default feature set";
the ridge column is the diagnostic, not the baseline.

## 6. Explainability (SHAP)

- **Attribution.** `app/domain/shap_service.py::compute_global` fits a fresh copy
  of the model, then uses `shap.TreeExplainer` for tree-based algorithms
  (`xgboost`, `random_forest`, `gradient_boosting`, `extra_trees`) with a
  `KernelExplainer` fallback on `X.sample(min(200, n))`.
- **Global importance.** `mean|SHAP|` over all rows, sorted descending; persisted
  in `SHAPExplanation.global_importance`.
- **The real stability metric.** `shap_service._stability`: draw two
  **half-samples** `a = X.sample(min(300, n//2), random_state=1)` and
  `b = X.sample(min(300, n//2), random_state=2)`, compute per-feature `mean|SHAP|`
  for each, rank features by `argsort`, and take the **Spearman correlation between
  the two rankings**, scaled to 0–100: `max(0, ρ_spearman)·100`. Stored as
  `__stability_index` in `global_importance`. On the reference dataset it
  contributes **75** to the trust gate.
- **The mislabeled metric (report honestly).** `comparison_service._shap_stability`
  — surfaced in the raw-vs-processed tables as `shap_stability` — is **not** an
  explanation-stability index. It computes `max(0, Pearson(argsort(mean|SHAP|),
  arange))·100`: a *column-order-alignment* correlation between the sorted
  importance ranks and their index positions. It is (a) unseeded
  (`X.sample(min(200, n))` — non-reproducible across runs), and (b) exactly 0 when
  the clamped correlation is non-positive. EVIDENCE sampled 11.0 / 5.9 and 9.1 / 0.0
  across runs — values that move run to run *without any data change*. The paper
  should use only `shap_service._stability` (Spearman, seeded) as the stability
  quantity, and cite the comparison-service metric as a mislabeled column-order
  index discovered during validation.

## 7. Trust Gate

The AI Confidence Gate (`app/domain/trust_service.py`, weights locked in
`app/workflow/stages.py::TRUST_WEIGHTS`):

```
trust = 0.40·prediction_confidence
      + 0.25·dq_score
      + 0.20·model_relevance
      + 0.15·shap_stability
```

where factors are on a 0–100 scale: `prediction_confidence` (×100), `dq_score`
(read from the DQ engine), `model_relevance` (best model's R² ×100), and
`shap_stability` (the Spearman index from §6). Verdict thresholds
(`trust_verdict`): **≥ 80 → `high_trust`**, ≥ 60 → `moderate_trust`, else
`low_trust`. Only factors that are present are fused (missing factors are omitted
and reported), so the effective weights can differ when stages are skipped.

**Measured result** (run `5c8dd728`, 2026-09-17):

| Factor | Value | Weight |
|---|---|---|
| prediction_confidence | 100 | 0.40 |
| dq_score | 100 | 0.25 |
| model_relevance | 91.5 | 0.20 |
| shap_stability | 75 | 0.15 |
| **trust_score** | **94.5** | — |
| **verdict** | **high_trust** | — |

Executive headline: *"Trust 94/100 (high_trust) with DQ 100 and best model
xgboost."* Note: the gate's `dq_score` is read from the most recent `DQResult`
row (a rule-level score), and on this run it is 100 — EVIDENCE explicitly
instructs the paper to use this gate `dq_score=100` rather than any aggregate
from §3.3.

## 8. Raw-vs-Processed Comparison

**Methodology** (`app/domain/comparison_service.py`): load the *raw* dataframe
(`use_processed=False`) and the *processed* dataframe; build ML matrices with
`derive=True` from both; intersect the feature sets (17 features on both sides
here); fit the **same algorithm with the same hyperparameters** (xgboost
defaults) on both at the **same 70/30 chronological split**; score both with the
same metric set.

**Honest headline (EVIDENCE, two runs on 2026-09-23): cleaning did NOT change
predictive performance.** The seed data is already clean.

| Run | side | R² | RMSE | MAE | MAPE | `shap_stability`* |
|---|---|---|---|---|---|---|
| 776bf594 | raw | 0.9153 | 1.3692 | 0.121 | 1.58 | 11.0 |
| 776bf594 | processed | 0.9153 | 1.3692 | 0.121 | 1.58 | 5.9 |
| 5c8dd728 | raw | 0.9153 | 1.3692 | 0.121 | 1.58 | 9.1 |
| 5c8dd728 | processed | 0.9153 | 1.3692 | 0.121 | 1.58 | 0.0 |

\* the *mislabeled* column-order index of §6 — included only to reproduce the
table faithfully.

- `improvement`: `r2_delta = 0`; rmse/mae/mape "delta_pct" are computed as
  **absolute diffs, not percentages** (a misnomer in code); `shap_stability_delta`
  = −5.1 / −9.1.
- `shap_divergence = |stab_raw − stab_proc| + |r2_raw − r2_proc|` = 5.1 / 9.1
  (a simple Manhattan divergence, **not** cosine, despite a DB comment).
- System `conclusion` (both runs): *"Raw data matched or beat cleaned data here —
  possible over-cleaning or already-high quality input."*

**Paper framing:** on already-clean/sparse seed data, the raw-vs-processed stage
**verifies correctness but yields Δ≈0** — an honest negative result that validates
the "DQ first" thesis *from the other side*: DQ-driven cleaning is data-dependent
and its value is conditional on the input's actual quality state, not on the
existence of the stage.

## 9. Workflow Orchestration & Status Transitions

`app/routes/workflow.py`:

- `POST /workflows/start` creates a `WorkflowRun` with `status="running"`,
  `current_stage=0`, `total_stages=17`, `stages_completed=[]`.
- `POST /workflows/{run}/stages/{key}/exec` runs the registered runner for a
  stage key. On **success**: the `StageTrace` is marked `completed` (output
  snapshot, decision, confidence, duration ms), the key is appended to
  `stages_completed`, and the run flips to `completed` **only after all 17 stage
  keys have executed** (`done ≥ TOTAL_STAGES`). On **exception**: the trace and
  run both flip to `failed`, an error message is stored, an audit row is written,
  and the API returns 500.
- `POST /workflows/{run}/advance` picks the next uncompleted stage in canonical
  order and delegates to `exec`. **There is no background auto-runner** — a run
  persists as `running` until every stage is individually executed.
- Guard: executing a stage on a `completed`/`failed` run returns 409.
- `GET /workflows/{run}/stream` (requires a valid JWT as `?token=`) streams the
  event bus for `run:{run_id}` as `text/event-stream` (SSE), giving the React
  UI a live per-stage status feed (`stage_started`, `stage_completed`,
  `stage_failed`, `run_completed`).
- **Seed artifact (known):** the seed injects one `completed` run with
  `stages_completed=1..18` (integers) — inconsistent with the key-based engine
  and with the 17-stage canonical list. The paper should not cite stored stage
  counts from seeds; it should cite the key-based `STAGES` list.

## 10. Reproducibility & Limits

**Reproducible:**
- Deterministic chronological split (`time_ordered_split`, pure index cut), fixed
  `random_state=7` for XGBoost/RF/GBM/ET; Ridge is deterministic.
- The full feature derivation is a pure function with explicit formulas (§4).
- Every run is persisted locally in SQLite (21 tables): DQ results, models with
  metrics, SHAP explanations, stage traces, confidence gates, comparisons, audit
  log. Model `performance_summary`, `training_rows`, `dataset_hash`,
  `feature_count` live in the registry (model `84a9df08` /
  `gradient_boosting`: r² 0.9175, RMSE 1.3517, MAE 0.112, 2,091 training rows,
  hash `5a5ce1ca2c`, 17 features; 16 registry rows, all version 1, `staging`).

**Measured environment (for the paper's reproducibility box):**
- 3,600 rows / 43,200 cells audited; 2,091 training rows; 17 features; 70/30
  chronological split; 30-day horizon; 5 assets; 21 tables; 55+ routes; 17
  stages; 8 DQ rules; 5 dimensions; ≥8 model configurations; 16 registry rows.

**Limits (state honestly):**
- The reference corpus is a single clean 30-day seed dataset. The nonzero DQ
  hits (120 non-monotonic rows, 394 IQR outliers) show the rules fire, but no
  dataset with genuine missingness was evaluated, so the *cleaning*
  transformation's effect cannot be measured end-to-end (hence the Δ≈0 result).
- The two aggregate DQ scalars are buggy (§3.3) — per-rule scores must be used.
- The `shap_stability` surfaced in the comparison service is a mislabeled,
  unseeded column-order index (§6); the trust gate uses the seeded Spearman
  index.
- Leaderboard metrics are computed on the default (leaky) feature set; ridge
  r²=1.0 is a leakage diagnostic, and the paper must not present it as a
  competitor.
- Trust factors come from the latest persisted rows per signal, not from a single
  atomic snapshot; the gate's `dq_score` is a single rule-level `DQResult` value.
- No model calibration or conformal interval is computed; confidence is an
  internal verifier, not a statistical coverage guarantee.