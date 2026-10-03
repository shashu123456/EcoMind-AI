# EcoMind AI — API Contract

Authoritative REST + SSE reference for the ten-stage backend. If a frontend
type and this document disagree, the running server wins and this document is
wrong — verify against `GET /openapi.json` or a live call.

Base URL: `/api/v1`. All bodies are JSON; field names are **snake_case**. All
protected routes require `Authorization: Bearer <token>`.

Legend: `→` return shape. Everything described here was probed against a live
run; the shapes are not aspirational.

---

## 1. The ten stages

Stages run in a fixed order. Six are *preparation*; a *decision* stage is
reachable only after all six preparation stages have passed.

| # | Stage key | Route path | Phase |
|---|-----------|------------|-------|
| 1 | `library` | `/library` | preparation |
| 2 | `import` | `/import` | preparation |
| 3 | `schema` | `/schema` | preparation |
| 4 | `quality` | `/quality` | preparation |
| 5 | `transformation` | `/transformation` | preparation |
| 6 | `model_selection` | `/model-selection` | preparation |
| 7 | `anomaly` | `/anomalies` | decision |
| 8 | `forecast` | `/forecast` | decision |
| 9 | `recommendation` | `/recommendations` | decision |
| 10 | `report` | `/report` | decision |

Canonical definitions: `backend/app/workflow/stages.py`.

**There are no per-stage REST resources** (`/anomalies/{id}`, `/forecast/{id}`,
etc. do not exist). A stage is executed through the workflow and read back
through its trace snapshot. See §4.

---

## 2. Authentication & health

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/auth/register` | `{email, password, full_name}` | `{access_token, user}` |
| POST | `/auth/login` | `{email, password}` | `{access_token, user}` |
| GET | `/auth/me` | — | `{id, email, full_name, role}` |
| GET | `/health` | — | service status payload |

`user` is `{id, email, full_name, role}`. Demo login: `admin@ecomind.ai` /
`admin123`.

---

## 3. Datasets

| Method | Path | Returns |
|--------|------|---------|
| GET | `/datasets` | `{datasets: [Dataset]}` |
| POST | `/datasets/upload` | `{dataset: Dataset}` (multipart, field `file`) |
| GET | `/datasets/{id}` | `Dataset` — **not enveloped** |
| DELETE | `/datasets/{id}` | `{...}` |
| POST | `/datasets/{id}/refresh` | `Dataset` |
| GET | `/datasets/{id}/preview` | `{rows, columns, row_count, column_count, start, limit, returned}` |
| GET | `/datasets/{id}/content` | same shape as `preview` |
| GET | `/datasets/{id}/schema` | `{columns: [SchemaColumn]}` — **only this key** |
| POST | `/datasets/{id}/schema/discover` | the discovered schema payload |
| GET | `/datasets/{id}/dq` | the last data-quality result, or `null` |
| POST | `/datasets/{id}/dq/run` | the data-quality result |

### Dataset object

27 fields, all present:

```
id, name, description, source_type, file_path, file_size_bytes,
row_count, column_count, granularity, is_active,
building_count, floor_count, room_count, device_count,
hourly_row_count, monthly_row_count, defect_rate, anomaly_rate,
badges, provenance, doi, source_url, license, notes, status,
created_at, updated_at
```

`granularity` is `"asset"` (one row per device per hour, with building / floor /
room columns) or `"meter"` (one row per meter, no room level).
`badges` and `provenance` are objects; `defect_rate` is a 0–1 fraction.
The dataset row carries **counts**, never code lists — the codes for buildings,
floors, rooms and devices live in the stage payloads that use them.

---

## 4. Workflows (the run engine)

A *run* is one pass through the ten stages for one dataset.

| Method | Path | Returns |
|--------|------|---------|
| POST | `/workflows/start` | `{run}` (body `{dataset_id}`) |
| GET | `/workflows` | `{runs: [Run]}` |
| GET | `/workflows/{run_id}` | `{run, traces: [StageTrace]}` |
| GET | `/workflows/{run_id}/traces` | `{traces: [StageTrace]}` |
| GET | `/workflows/{run_id}/stages/{stage_key}` | a **stage output** (§5) |
| POST | `/workflows/{run_id}/stages/{stage_key}/exec` | `{trace, output, decision, confidence}` |
| POST | `/workflows/{run_id}/advance` | `{run, traces}` |
| GET | `/workflows/{run_id}/stream` | SSE (requires `?token=`) |

### Run

```
{ id, dataset_id, status, current_stage, total_stages,
  stages_completed, trace_count, started_at, completed_at,
  error_message, config }
```

The run row carries **no** dataset name, no per-stage status map and no
selected model id. Progress is reconstructed from the traces that exist.

### StageTrace

```
{ id, stage_key, stage_number, stage_name, status,
  input_snapshot, output_snapshot, decision,
  started_at, completed_at, duration_ms, error }
```

`output_snapshot` is the stage's full payload. There is **no** `confidence`,
`rows_in` or `rows_out` on the trace.

### Gating and errors

- Executing a stage whose preparation predecessors have not all passed returns
  `409` with `Stage 'X' cannot run yet. Complete first: a, b`.
- Re-running any stage is always allowed.
- Executing an unknown stage key, or one with no runner registered, returns
  `404` (`"... not implemented yet"`).
- Executing a stage on a completed or failed run returns `409`.
- If a stage raises, its trace and the run are marked failed and the route
  raises `500` with `Stage 'X' failed: <error>`.

### SSE

`GET /workflows/{run_id}/stream?token=<jwt>` yields frames of the form
`data: {json}\n\n`. Event types include `stage_started`, `stage_completed`,
`stage_failed`, `stage_blocked`, `stage_skipped`. 401 without the token.

---

## 5. Stage output — the read path every page uses

`GET /workflows/{run_id}/stages/{stage_key}` returns, for the **newest** trace
of that stage in that run:

```
{ stage_key, stage_number, stage_name, status,
  output, decision, started_at, completed_at, duration_ms, error }
```

`404` if the stage key is unknown, or if the stage has not been run in this run.
This is the same `output_snapshot` that `exec` wrote, so a page and the audit
trail cannot disagree.

The `output` object for each stage key is described below. All field names are
snake_case; only the fields a page actually relies on are listed.

### `library`
```
{ datasets: [Dataset] }
```

### `import`
```
{ id, name, source_type, granularity, row_count, column_count, device_count,
  status, provenance, columns }
```
`provenance` = `{origin, license, collection_method, temporal_range,
geographic_scope, version, random_seed, citation}`.
Each `columns[]` entry = `{name, dtype, null_count, unique_count, sample_values}`.

### `schema`
```
{ columns, discovered_at, source, warnings, elapsed_ms, dropped_columns }
```
Each column = `{name, data_type, nullable, unique_count, null_count,
sample_values, statistics, semantic_type}`.

### `quality`
```
{ overall_score, results, passed_count, failed_count, by_dimension,
  severity_counts, summary, elapsed_ms, ran_at }
```
`by_dimension` = `{completeness, accuracy, consistency, timeliness, validity}`.
`severity_counts` = `{info, warning, critical}`.
Each `results[]` entry = `{id, dataset_id, rule_name, rule_category, dimension,
score, details, severity, passed, ran_at}`.

**`details` is rule-specific and heterogeneous.** It cannot be one interface;
render it defensively and print "not reported" for a missing key rather than a
zero. A rule tagged `critical` passes only with zero violations, regardless of
the rounded score.

### `transformation`
```
{ dataset_id, steps, features, rows_in, rows_out, columns_in, columns_out,
  applied_steps, processed_file, applied_at, elapsed_ms, run_id }
```
Each step = `{step_key, order, label, purpose, status, affected_columns,
rows_changed, fields, note, applied_at}`; each field = `{column_name,
before_value, after_value, changed, unit_before, unit_after}`.
Each feature = `{name, description, source_columns, data_type, created_at}`.

### `model_selection`
```
{ run_id, dataset_id, selected_model_id, selected_algorithm, rationale,
  winning_criteria, lost_criteria, margin_over_second, near_tie,
  dataset_characteristics, candidates, target_column, feature_count,
  excluded_columns, feature_importances, train_rows, test_rows,
  split_strategy, weights, decided_at }
```
Each candidate = `{id, algorithm, display_name, family, metrics,
composite_score, normalised, selection_rank, is_selected, trained_at, error}`.
`metrics` = `{r2, rmse, mae, mape, explained_variance, training_seconds,
training_rows}`.

### `anomaly`
```
{ run_id, dataset_id, total, devices_affected, readings_scanned,
  detection_rate_pct, excess_kwh, excess_cost, excess_co2_kg,
  by_class, by_severity, by_building, top_devices,
  baseline_method, threshold, analysed_at, elapsed_ms }
```
There is **no per-anomaly list** here — only the four roll-ups. Per-reading
detail is cited by id on the recommendations that reference it.

### `forecast`
```
{ run_id, dataset_id, model_id, selected_algorithm, target_column,
  origin_timestamp, history_rows, history_hours, devices, scope_totals,
  exogenous_assumption, mape_backtest, hourly, monthly, monthly_history,
  horizons, aggregates, tariff, calibration_factor, generated_at,
  elapsed_ms, compare }
```
- `hourly[]` = `{timestamp, energy_kwh, lower_kwh, upper_kwh, power_kw,
  cost_inr, tariff_band}`
- `monthly[]` = `{month, energy_kwh, lower_kwh, upper_kwh, cost_inr,
  history_kwh}`
- each horizon = `{horizon, tier, label, total_kwh, total_cost_inr,
  peak_demand_kw, peak_demand_at, co2_tonnes, band_width_pct, method,
  confidence_note}`; `tier` is `"short"` (hourly recursion) or `"long"`
  (extrapolation)
- `aggregates` = `{total_kwh, avg_daily_kwh, peak_demand_kw, peak_demand_at,
  p95_demand_kw, load_factor_pct, total_cost_inr, blended_rate_per_kwh,
  projected_bill_inr, standing_charge_inr, co2_tonnes, cost_by_band}`
- `tariff` = `{currency, currency_symbol, co2_kg_per_kwh,
  standing_charge_per_period, billing_period_days, bands}`
- `compare` = `{rows, total}` where each row = `{building_code,
  building_name, total_kwh, total_cost_inr, peak_demand_kw, co2_tonnes,
  share_pct}`

### `recommendation`
```
{ run_id, dataset_id, recommendations, total, by_priority,
  total_savings_kwh, total_savings_inr, total_savings_co2_kg,
  co2_kg_per_kwh, priority_basis, payback_thresholds_months,
  generated_at, programme, savings_inventory,
  forecast_basis_available, elapsed_ms }
```
Each recommendation = `{id, dataset_id, priority, category, title, reason,
action, building_code, floor_no, room_code, device_code, device_label,
savings_kwh, savings_cost_inr, savings_co2_kg, payback_months,
payback_verdict, anomaly_ids, forecast_basis, estimated_cost_inr, status,
confidence, created_at}`. `payback_verdict` is one of `viable`, `marginal`,
`not_viable`, `unknown`.

`programme` = `{method, buildings, estate}`; `estate` = `{recommendations,
recoverable_kwh, monthly_recoverable_inr, annual_recoverable_inr,
annual_recoverable_co2_kg, programme_cost_inr, payback_months,
payback_verdict}`.

### `report`
```
{ id, dataset_id, run_id, organization_name, title, format, status,
  sections, summary, file_size_bytes, generated_at, created_at, elapsed_ms }
```
Each section = `{key, title, body, figures, order}`. `figures` is a flat mixed
object of whatever that section measured. `summary` = `{overall_health, spend,
opportunity, sections}`.

The report builder **refuses to emit model metrics** (R², RMSE, SHAP, feature
importance, confidence gate). A board paper that prints an R² reads as a
building rating; those numbers are deliberately absent from every section.

---

## 6. Error shape

Errors return an HTTP status and `{detail: <string>}` (FastAPI default).
401/403 responses clear the client session.
