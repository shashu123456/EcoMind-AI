# EcoMind — Frontend Design Specification

**Status:** approved direction, not yet implemented
**Scope:** the entire frontend. The backend, its APIs, its business logic and its
numerics are fixed and out of scope for this document.
**Applies to:** EcoMind AI — enterprise energy analytics platform

---

## 0. How to read this document

| § | What it settles |
|---|---|
| 1–3 | The thesis, the evidence the backend can actually carry, and the identity |
| 4–7 | The visual system: typography, colour, space, elevation, motion |
| 8–9 | The shell and navigation |
| 10–11 | The component inventory, and the chart catalogue with the exact field feeding each chart |
| 12 | The interaction grammar — the gestures that make sixteen pages feel like one |
| 13 | The honesty register: every place the product must admit what it does not know |
| 14 | The sixteen page experiences, one per route |
| 15–18 | Cross-cutting rules, sequence, definition of done, and what is deliberately not being done |

**Read §2 first if you are implementing.** It records what a completed run
actually contains, including three findings that constrain the design. §13 is
not skippable: it is the difference between an analytics platform and one that
flatters itself.

Every colour, size and duration in this document is a decision, not a default.
Where something is kept from the current implementation, the reason is given —
the existing token layer is genuinely good and does not need to be thrown away to
satisfy "redesign".

---

## 1. The product thesis

### 1.1 Who this is for

Four people use this product, and each arrives with a different question. The
interface has to answer all four without ever showing all four at once.

| Persona | Arrives asking | Needs from the UI |
|---|---|---|
| **Facility manager** | "What is wrong in my building right now, and who do I send?" | Location, severity, cost. Terse. Actionable. |
| **Energy analyst** | "Is this anomaly real, and what is driving it?" | Evidence, baseline, deviation, provenance. Deep. |
| **Sustainability lead** | "What will this cost and save over the year?" | Trend, forecast cone, programme totals, CO₂. |
| **Executive** | "Can I defend this number?" | One number, its confidence, and the sentence under it. |

The executive is the default reading level. Everything else is one interaction
away. The product should never show the analyst's evidence to someone who only
wanted the number — that is what progressive disclosure is *for*.

### 1.2 The argument the product makes

Every screen answers the same four-part argument, in the same order:

```
   what is happening  →  how much it matters  →  why you can trust it  →  what to do
```

A page that cannot fill all four slots does not need that page. This is the test
that decides whether a visualization ships: **if no sentence can be written
after it that changes a decision, it is decoration and it gets cut.**

The current `PageFrame` already encodes purpose → hero → conclusion → evidence.
That is the right spine and it stays. What changes is that *conclusion stops
being prose* and becomes a visual claim, and *hero stops being one number* and
becomes a small constellation of them.

### 1.3 The one-sentence test

Every page must satisfy, in its first screenful:

> *You can tell what is happening, how big it is, and whether to trust it —
> without scrolling, and without reading a paragraph.*

If a page fails that, the problem is the page, not the reader.

---

## 2. Evidence base — what the data can actually carry

This section exists because a visualization catalogue is worthless if it invents
fields. Every chart in §14 cites a field verified to exist in a completed run.

Measured against run `e5050f33` on dataset `b13c23f0`
(EcoMind Fault Simulation Campus: 2 buildings, 6 floors, 26 rooms, 102 devices,
220,466 hourly readings).

### 2.1 Per-stage output inventory

| Stage | Fields that carry visual weight |
|---|---|
| `import` | `provenance{origin, license, collection_method, geographic_scope, version, random_seed, citation}`, 16 `columns[]{name, dtype, null_count, unique_count, sample_values[5]}`, `row_count`, `column_count`, `device_count` |
| `schema` | 16 `columns[]{name, data_type, nullable, unique_count, null_count, statistics{5}, semantic_type}`, `warnings[]`, `dropped_columns[]`, `source` |
| `quality` | `overall_score`, 8 `results[]{rule_name, rule_category, dimension, score, details{5}, severity, passed}`, `by_dimension{completeness, validity, consistency, accuracy, timeliness}`, `severity_counts{info, critical, warning}` |
| `transformation` | 5 `steps[]{step_key, order, label, purpose, status, affected_columns[6], rows_changed, fields[6]}`, 10 `features[]`, `rows_in/out`, `columns_in/out`, `applied_steps[]` |
| `model_selection` | 6 `candidates[]{algorithm, display_name, family, metrics{7}, composite_score, normalised{3}, selection_rank, is_selected}`, `feature_importances{}` (9 features), `weights{r2, rmse, speed}`, `near_tie`, `margin_over_second`, `dataset_characteristics{rows, feature_count, span_days, devices, buildings, target_mean, target_std, target_cv, missing_feature_rate, matrix_hash, sampled, rows_available, sample_cap}`, `excluded_columns[14]`, `train_rows`, `test_rows`, `split_strategy` |
| `anomaly` | `total` 2227, `devices_affected` 83, `detection_rate_pct` 1.0103, `excess_kwh/cost/co2_kg`, `by_class[2]`, `by_severity[3]`, `by_building[2]`, `top_devices[10]`, `baseline_method` `median_hour_of_week`, `threshold` 0.6 |
| `forecast` | `hourly[720]{timestamp, energy_kwh, lower_kwh, upper_kwh, power_kw, cost_inr, tariff_band}`, `monthly[12]{month, energy_kwh, lower_kwh, upper_kwh}`, `monthly_history[3]`, `horizons[4]{horizon, tier, label, total_kwh, total_cost_inr, peak_demand_kw, peak_demand_at, co2_tonnes, band_width_pct, method, confidence_note}`, `aggregates{load_factor_pct, p95_demand_kw, blended_rate_per_kwh, projected_bill_inr, standing_charge_inr, cost_by_band[3]}`, `scope_totals[102]`, `devices[102]`, `tariff{bands[3], weekend_rate_per_kwh, co2_kg_per_kwh}`, `compare{rows[2]}`, `mape_backtest`, `exogenous_assumption` |
| `recommendation` | 109 `recommendations[]{id, priority, category, title, reason, action, building_code, floor_no, room_code, device_code, savings_kwh, savings_cost_inr, savings_co2_kg, payback_months, payback_verdict, anomaly_ids[≤48], confidence, status}`, `by_priority{P1:10, P2, P3}`, `programme{buildings{BLD-A:10 fields, BLD-B:10 fields}, estate{annual_recoverable_inr: 61564.56, payback_months: 1.8, payback_verdict: viable}}`, `savings_inventory{grouped_recoverable_kwh, raw_excess_kwh, note, groups}` |
| `report` | 12 `sections[]{key, title, body, figures{1–10}}` — **74 figures total**, `summary{overall_health, spend, opportunity}` |
| `library` | dataset list, `granularity` |
| `explore` | `/content` paged readings, `/hierarchy` tree, building/floor/room/device |

### 2.2 Finding A — the anomaly vocabulary is narrower than the schema

The detector emits exactly **three** severities and **two** classes:

```
severity_counts = { critical: 0, high: 1720, moderate: 106, low: 401 }
class_counts    = { equipment_failure: 0, sustained_overuse: 1802,
                    night_usage: 0, meter_drift: 0,
                    extreme_spike: 0, weekend_anomaly: 425, wrong_room_map: 0 }
```

**Consequences, and they are binding on the design:**

1. **A `critical` chip must never be rendered as a zero-valued row.** It is not
   "zero criticals found" — the classifier never emits the label. The UI must
   distinguish *measured-zero* from *category-absent*, and it does this with
   different components (§14.9). A red "Critical — 0" row reads as a broken
   product.
2. **Five class chips are permanently empty.** The class filter must render only
   the two live classes by default, with the five dormant ones available behind
   an explicit "show all classes" affordance that labels them as *defined but not
   emitted by this detector*.
3. **The severity ramp shown in the legend must reflect the classifier.** Three
   swatches, not five. The five-step ramp survives only inside the *schema
   documentation* view, where it is describing the model, not the data.
4. **Empty category ≠ empty page.** When a scope genuinely contains no anomalies,
   that is a *positive finding* and gets positive framing (§8.7), not a
   graveyard of zero rows.

This is the single most important correction in the redesign. A generic
"severity facet with five levels" component would have shipped five lies.

### 2.3 Finding B — 74 computed figures are currently prose

`report_service` already emits typed numeric figures per section — building
shares, DQ dimension scores, anomaly class counts, 24h/7d/30d/12m projections,
savings by tier. The current frontend prints `section.body` as a paragraph and
shows the figures only as a key–value ledger in a secondary tab.

This is the largest single missed opportunity in the product. Every one of those
74 numbers is a candidate for a real chart, and the report page currently spends
the most executive attention in the product on the least visual surface. §14.14
turns them back into visual claims.

### 2.4 Finding C — `total_savings_inr` is not the programme number

`recommendation.total_savings_inr` is a raw pre-normalisation sum (₹15,391). The
programme figure is `programme.estate.annual_recoverable_inr` = **₹61,564/yr at
1.8-month payback**. `savings_inventory.note` explains the relationship.

The UI surfaces **only** the programme figure, with the grouped-basis note
attached. The raw sum is never shown alone — doing so would contradict the
headline on the same screen.

### 2.5 Finding D — forecast confidence widens with horizon

`horizons[].band_width_pct` and `confidence_note` give per-horizon honesty, and
`monthly[].lower_kwh/upper_kwh` give a real cone for 12 months from 3 months of
history. The design must make **widening uncertainty the visible story**, not
hide it behind a thin band. §14.11 and §13 cover this.

---

## 3. Identity

### 3.1 What the product is not

Not a wizard. Not a report viewer. Not a data-table browser. Not a dashboard
template. No dark-mode "hacker" aesthetic, no neon, no glassmorphism, no glow.
Those read as demo projects. Enterprise trust comes from restraint, alignment and
legible density.

### 3.2 The identity: *measured instrument*

The governing metaphor is a **calibrated measuring instrument**, not a
dashboard. Consequences:

- Numbers are the hero, and they are set with real typographic care — tabular
  figures, correct optical alignment, no jitter.
- Every number is allowed to be *wrong out loud*. Confidence, sample size and
  method are first-class, adjacent, never hidden behind a tooltip.
- Colour is reserved for meaning. A grey chart is a correct chart.
- Motion is instrumentation settling, never decoration.
- Density is respected: an analyst's screen is mostly data. Whitespace is for
  separating claims, not for air.

### 3.3 Voice

- Headings state the claim: "Overnight load is 3.4× its baseline", not
  "Anomaly Analysis".
- Empty states name what is missing and what would fill it.
- Errors say what failed, whether it is retryable, and what to do.
- Numbers use en-IN digit grouping (`1,14,562`), matching the reader's locale,
  because this product is used by Indian facility teams.

### 3.4 Wordmark

`EcoMind` set in the display face, weight 600, tracking `-0.02em`, with the
"Eco" in ink and "Mind" in brand. No custom SVG, no gradient. The wordmark sits
in a 32px rail and is the only element permitted to use display weight at
small size.
---

## 4. Typography

### 4.1 Family decision

Four roles, three families. Loaded self-hosted as `woff2`, subset latin +
latin-ext, `font-display: swap`, preloaded for the two above-the-fold faces.

| Role | Family | Weight | Rationale |
|---|---|---|---|
| **Primary / UI** | **Geist Sans** | 400, 500, 600 | Neutral, engineered, unusually tall x-height so dense tables stay legible at 13px. Carries 95% of the interface. |
| **Display** | **Geist Sans** (same family, weight 700) | 700 | A second family would add a network request to buy personality the product does not need. Weight and tracking do the work instead. |
| **Metric** | **Geist Mono** | 500 | Tabular by construction, so digits align vertically in a KPI column and do not reflow as values update live. Also makes "this is a machine value" legible without a label. |
| **Monospace** | **Geist Mono** | 400, 500 | IDs, timestamps, hashes, SQL, column names, run ids. |

Self-hosted, not Google Fonts: the product is used on facility networks and an
external font dependency is both a latency and a availability risk.

`font-variant-numeric: tabular-nums` is set on **every** numeric context, not
just tables. A live-updating counter that shifts width is a bug.

### 4.2 Type scale

Fluid between 1440px and 1920px via `clamp()`, static below 1440. Ratios are
deliberately tighter than a consumer scale — enterprise density needs a smaller
step between body and small.

| Token | Size @1440 | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `--text-3xl` | 2.75rem | 1.05 | −0.03em | 700 | Landing hero only |
| `--text-2xl` | 2.0rem | 1.1 | −0.025em | 700 | Page title |
| `--text-xl` | 1.5rem | 1.2 | −0.02em | 600 | Section title |
| `--text-lg` | 1.25rem | 1.25 | −0.015em | 600 | Panel title |
| `--text-md` | 1.0625rem | 1.35 | −0.01em | 600 | Card title |
| `--text-base` | **0.9375rem** | 1.5 | 0 | 400 | **Body default** |
| `--text-sm` | 0.875rem | 1.45 | 0 | 400 | Dense body, table cells |
| `--text-xs` | 0.8125rem | 1.4 | 0 | 400 | Table secondary, captions |
| `--text-2xs` | 0.6875rem | 1.35 | 0.06em caps | 600 | Eyebrow labels |
| `--metric-lg` | 2.5rem | 1 | −0.02em | 500 mono | Page hero value |
| `--metric-md` | 1.75rem | 1.05 | −0.015em | 500 mono | KPI tile value |
| `--metric-sm` | 1.25rem | 1.1 | −0.01em | 500 mono | Inline metric, table numeric |

**Body default is 15px, not 14px.** The current 14px is one step too tight for
sustained reading of long-form report prose, which this product has a lot of.

### 4.3 Hierarchy rules

1. **Exactly one `--text-2xl` per screen.** It is the page title.
2. **Never skip a step.** 2xl → lg → base. A 1.25rem between a 2rem and a 15px
   body reads as a mistake.
3. **Eyebrows are `text-2xs`, uppercase, `--ink-low`, and are labels — never
   headings.** They are read before the content they label, so they must not
   compete with it.
4. **Metrics are mono.** Body prose is never mono. This single rule does most of
   the work of making the product feel like an instrument.
5. **Line length**: prose caps at `68ch`. Tables and charts are exempt.
6. **Never** set body text below 13px anywhere, including dense tables.
7. **Numbers in sentences** stay sans and inline; numbers that *are* the content
   become `--metric-*`.

---

## 5. Colour

Colour is a language, not a palette. Every hue in the product is bound to one
meaning and used nowhere else.

### 5.1 Neutrals — the substrate

Cool-neutral, faintly blue, so the interface recedes and data advances.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#f6f7f9` | `#0d1117` | Page background |
| `--surface` | `#ffffff` | `#161b22` | Cards, panels |
| `--surface-2` | `#f1f3f6` | `#1c2129` | Inset, table header, hover |
| `--surface-3` | `#e6e9ef` | `#242a34` | Active, selected, pressed |
| `--surface-inset` | `#fafbfc` | `#11161d` | Nested evidence |
| `--ink` | `#0f1720` | `#e9eef4` | Primary text |
| `--ink-mid` | `#414c5a` | `#a9b4c0` | Body secondary |
| `--ink-low` | `#667486` | `#7d8894` | Labels, captions |
| `--ink-faint` | `#94a0b0` | `#5b6673` | Disabled, placeholder |
| `--line` | `#e3e7ee` | `#262d38` | Default border |
| `--line-strong` | `#ccd3de` | `#39424f` | Dividers, emphasis |

Contrast: `--ink` on `--surface` = 15.8:1; `--ink-low` on `--surface` = 4.9:1;
`--ink-faint` is used only for disabled states and never for meaningful content.

### 5.2 Brand

| Token | Light | Dark |
|---|---|---|
| `--brand` | `#3b5bdb` | `#748ffc` |
| `--brand-hover` | `#364fc7` | `#91a7ff` |
| `--brand-tint` | `#eef2ff` | `#141b33` |
| `--brand-ink` | `#ffffff` | `#0d1117` |

Brand means *"this is an interactive control you can act on"* — primary buttons,
active nav, links, focus rings, the selected cross-filter state. It is never a
data colour. If brand appears in a chart, the chart is wrong.

### 5.3 Semantic status — the reserved set

| Meaning | Token | Light | Dark | Reserved for |
|---|---|---|---|---|
| Success / healthy | `--ok` | `#0b7a4b` | `#4cbf8b` | passed checks, viable payback, clean DQ |
| Warning / attention | `--warn` | `#a56a06` | `#e0a75c` | moderate severity, marginal payback, DQ warnings |
| Critical / failure | `--critical` | `#b4232f` | `#f0798c` | high severity, failed stages, P1 actions |
| Informational | `--info` | `#12708f` | `#5cb8d8` | neutral notices, method notes, provenance |
| Neutral / inactive | `--neutral` | `#667486` | `#7d8894` | pending, skipped, low severity, offline |
| **Live / processing** | `--live` | `#0b7f8f` | `#38b8cc` | running stages, streaming, WebSocket up |
| **AI / model** | `--ai` | `#6741d9` | `#9775fa` | model selection, forecasts, anything ML-derived |
| **Opportunity** | `--gain` | `#0b7a4b` | `#4cbf8b` | savings, recoverable energy, payback |

Each semantic colour ships with a `-tint` (8% wash for backgrounds), a `-line`
(border), and a `-ink` (text-on-tint that still passes 4.5:1).

**Status is never colour alone.** Every status colour is paired with an icon or
a text label, because ~8% of men cannot separate the reserved hues. This is an
accessibility requirement, not a nicety.

### 5.4 Severity ramp — built to the classifier, not to a rainbow

Per Finding A, the ramp that appears **in data views** has three steps:

| Class | Light | Dark | Meaning |
|---|---|---|---|
| `high` | `#d9483d` | `#f0798c` | Act now. Money is being lost. |
| `moderate` | `#d98a2b` | `#e8b661` | Investigate this week. |
| `low` | `#667486` | `#7d8894` | Note it. |

The **five-step model ramp** (`--sev-critical` … `--sev-normal`) is retained but
**only inside schema documentation**, where it describes the classifier's
contract. It never labels data. `critical` is documented as *defined, not
emitted by this detector*.

### 5.5 Categorical series — for charts only

Eight hues, assigned by series index, tuned for ≥3:1 separation on both surfaces
and for deuteranopia (blue/orange and teal/magenta pairs carry the load).

| # | Light | Dark | | # | Light | Dark |
|---|---|---|---|---|---|---|
| 1 | `#3b5bdb` | `#748ffc` | | 5 | `#0b7f8f` | `#38b8cc` |
| 2 | `#0b7a4b` | `#4cbf8b` | | 6 | `#6741d9` | `#9775fa` |
| 3 | `#d98a2b` | `#e8b661` | | 7 | `#667486` | `#7d8894` |
| 4 | `#c2255c` | `#f078a8` | | 8 | `#8a6d3b` | `#c0a074` |

Categorical hues never carry status meaning. A chart series coloured `--ok`
green is a bug — green in a chart is just "series 2".

### 5.6 Continuous scales

Two, both perceptually uniform and both CVD-safe:

- **Sequential** (magnitude: heatmaps, density): `--seq-100 … --seq-700`, a
  single-hue blue ramp light→dark. Never a rainbow — rainbow introduces bands
  that read as false edges.
- **Diverging** (signed deviation from baseline: anomaly `deviation_pct`,
  forecast vs actual): `--div-neg-3 … --div-pos-3`, red ← neutral → blue through
  a light neutral midpoint. Diverging is only for data with a meaningful zero.

### 5.7 Colour discipline

1. **Chrome is achromatic.** Navigation, headers, borders and panel chrome use
   only neutrals and brand. The colour budget is spent on data.
2. **One accent per surface.** A card carries at most one semantic colour as its
   focal point.
3. **Never colour to fill space.** If a series is not meaningful, drop the series.
4. **Both themes are designed, not derived.** Dark is not light with inverted
   hexes; saturation is lowered and lightened so dark-mode charts do not glow.
5. **Print is a first-class target.** Semantic tints and chart palettes are
   chosen to survive greyscale conversion, so report export stays legible in
   monochrome.---

## 6. Space, radius, elevation

### 6.1 Spacing

4px base. `--space-1: 4px` … `--space-16: 64px`, as in the current tokens —
this scale is correct and is kept.

**Layout rhythm:**
- Page gutter: `--space-6` (24px), `--space-4` (16px) below 768px.
- Section gap: `--space-8` (32px).
- Card padding: `--space-5` (20px); dense card `--space-3` (12px).
- Gap between related cards: `--space-4`. Between groups: `--space-8`.
- Chart internal padding: `--space-3`.

**Rule:** related things are 16px apart, unrelated things are 32px apart. If two
elements are 16px apart they must read as one idea.

### 6.2 Density

Three density modes, user-selectable and persisted, because facility managers
work on 1080p monitors and analysts often run two panels:

| Mode | Row height | Use |
|---|---|---|
| `comfortable` | 44px | default |
| `compact` | 34px | data-heavy tables, wide screens |
| `spacious` | 52px | presentation, exec review |

### 6.3 Radius

`xs 3px` (chips, inline code) · `sm 5px` (inputs, buttons) · `md 7px` (cards) ·
`lg 10px` (panels, modals) · `full` (pills, dots). Kept from current tokens.

### 6.4 Elevation — borders first

Enterprise interfaces live or die on alignment, so structure is drawn with
**1px borders and background steps**, not shadows.

| Level | Treatment | Use |
|---|---|---|
| 0 | no border, no shadow | canvas |
| 1 | 1px `--line` | cards, panels |
| 2 | 1px `--line-strong` + `--shadow-sm` | hover, sticky headers |
| 3 | `--shadow-md` + `--line` | popovers, dropdowns, drawers |
| 4 | `--shadow-overlay` | modals, command palette |

Shadows are tinted with the ink hue, never neutral black — pure black shadow on a
cool neutral reads as dirty grey.

---

## 7. Motion

### 7.1 Principle

**Every animation answers "what changed?"** If you cannot name the state change
it represents, delete it. There is no entrance flourish, no gradient shift, no
bounce, no parallax.

### 7.2 Durations and easing

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 80ms | hover, press, focus |
| `--dur-fast` | 120ms | chip toggle, row highlight |
| `--dur-base` | 200ms | drawer, tooltip, tab change |
| `--dur-slow` | 320ms | panel expand, page transition |
| `--dur-stream` | 1.6s loop | indeterminate, live pulse |

`--ease-standard: cubic-bezier(0.2, 0, 0, 1)` — fast out, gentle settle.
`--ease-exit: cubic-bezier(0.4, 0, 1, 1)` — accelerate away.
**No spring, no bounce.** Bounce reads as consumer-toy.

### 7.3 The motion vocabulary

| Trigger | Motion | Meaning |
|---|---|---|
| Number changes (live metric) | count-up over 400ms, tabular so no reflow | the value moved |
| Stage starts running | `--live` dot begins a 1.6s opacity pulse, infinite | work in progress |
| Stage completes | dot pulses once, then settles to `--ok`, checkmark swaps in | finished |
| Stage fails | border flashes `--critical` once, 240ms | something is wrong |
| Row enters a live table | 160ms fade + 2px rise | it is new |
| Row leaves | 120ms fade only | it is gone |
| Chart series loads | 240ms clip-path wipe left→right | data arriving |
| Chart data updates | 200ms path `d` morph, never a re-mount | continuity |
| Confidence band widens | 300ms band-path morph | uncertainty growing |
| Drill-down | 200ms crossfade + 4px depth shift | going deeper |
| Breadcrumb back | reverse of the above | coming up |
| Filter applied | affected marks fade to 40%, others stay | scope changed |
| Drawer opens | 200ms slide from edge + backdrop fade | new context |

### 7.4 Live pulse

Exactly one element on screen may pulse at a time. It is the run indicator in the
top bar. Nothing else in the product is allowed a looping animation — a screen
with three pulsing dots is a screen nobody can read.

### 7.5 Reduced motion

`prefers-reduced-motion: reduce` collapses all durations to 0.01ms and:

- live pulse → static dot with a "live" text label
- count-up → instant set
- chart wipe → instant draw
- stream auto-scroll → disabled, with a "jump to latest" affordance

The current implementation already honours this; the behaviour above makes it
explicit rather than leaving it to a blanket override.---

## 8. The shell

### 8.1 Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│ RAIL │ TOPBAR                                        56px fixed      │
│ 64px ├───────────────────────────────────────────────────────────────┤
│      │ SCOPE BAR  (collapsible)                        44px          │
│      ├───────────────────────────────────────────────────────────────┤
│      │                                                               │
│      │  PAGE CANVAS   max-width 1600px, centred, 24px gutters        │
│      │                                                               │
│      │                                    ┌──────────────────┐       │
│      │                                    │ INSPECTOR DRAWER │ 400px │
│      │                                    │ (overlay, right) │       │
│      └────────────────────────────────────┴──────────────────┴───────┘
│      │ RUN BAR (pipeline progress, context)             56px         │
└──────┴───────────────────────────────────────────────────────────────┘
```

**Kept from the current implementation:** the 64px icon rail, the fixed topbar,
and the run bar. These are correct. The current rail collapses to icons and the
current sidebar sections (`nav.ts`) already model the two-half structure
(preparation pipeline + analytics workspace) properly — that model stays.

**Changed:** the secondary sidebar becomes an **overlay** rather than a column,
so the canvas gets the width back on a 1440px screen. The run bar stops being a
permanent strip and becomes contextual (§8.5).

### 8.2 Canvas width

- **Max width 1600px.** Wider and the eye loses the left edge during horizontal
  chart comparison; narrower and KPI rows start wrapping.
- Charts may **break out** to the full canvas width while prose stays at `68ch`.
  This is the main lever for making the product feel dense without feeling cramped.
- At ≥1920px the canvas centres and gains whitespace rather than stretching.

### 8.3 Top bar contents

Ordered left→right, and this order is fixed across every page:

1. **Dataset switcher** — the current dataset name, a hierarchy glyph, and the
   granularity. Click opens a searchable popover grouped by estate.
2. **Breadcrumbs** — estate path (`Riverside Office › Floor 2 › A201`) when
   scoped, otherwise the stage name. Breadcrumbs are the *scope*, not the
   route; the route is implied by the active nav item.
3. **Spacer**
4. **Time range** — `24h · 7d · 30d · 90d · custom`. Segmented, and **disabled
   with an explanatory tooltip on any stage where it has no effect**, rather
   than silently doing nothing.
5. **Live indicator** — the single pulsing element (§7.4). Shows connection
   state and, when a run is active, stage N of 10.
6. **Command palette trigger** — `⌘K` on mac, `Ctrl+K` elsewhere.
7. **Theme toggle**, **density toggle**, **notifications**, **account menu**.

### 8.4 Scope bar — the estate scope

The existing `ScopeBar` is the right idea and stays, with these changes:

- Collapsed by default to a **single pill** reading `Estate · all 102 devices`.
  Expanded it shows Building / Floor / Room / Device.
- Because of Finding A's sibling problem in the hierarchy, the device list stays
  deduplicated by code (102, not 306) and floor/room option values stay
  composite (`BLD-A|2`) — those are existing correct fixes and must not regress.
- Scope is **global and persistent**, and it is visibly applied: when a scope is
  active, every page shows a scope chip in its header. A scope that silently
  changes nothing is the worst failure mode this product has.
- **Scope is announced.** On scope change, a one-line toast reads
  `Scoped to Riverside Office · 51 devices · 12 rooms`. The user always knows
  what population they are looking at.

### 8.5 Run bar — contextual, not permanent

The current full-width run bar is always present. It becomes:

- **Collapsed strip** (56px) when idle: shows run status, progress, and the
  primary run control.
- **Expanded panel** during or after a run: per-stage progress with live
  elapsed times, a streaming event log, and abort.
- **Hidden entirely** on workspace pages (Explore, Compare, Dataset Details,
  Recent Analyses) where a pipeline is not what the user is doing.

### 8.6 Inspector drawer

This is the mechanism that makes the product feel like one connected system, and
it is the largest single addition to the experience.

**Rule: clicking anything visual opens the Inspector. Never a page navigation.**

```
┌─ INSPECTOR ──────────────────────────── ✕ ┐
│ BLD-A › Floor 2 › A201 › MTR-A201         │
│ ─────────────────────────────────────────  │
│ [Overview] [Evidence] [Actions] [History]  │
│ ─────────────────────────────────────────  │
│                                          │
│  contextual content for the clicked      │
│  object, at three depths:                │
│                                          │
│  1  summary     the number + one claim    │
│  2  evidence    the chart + the series    │
│  3  raw         the rows / the JSON       │
│                                          │
└──────────────────────────────────────────┘
```

- **400px wide**, overlays the canvas, never squeezes it (a squeezed canvas
  changes every chart's width and re-renders everything — visually violent).
- Four fixed tabs so the muscle memory transfers between every object in the
  product: a room, a device, an anomaly, a model and a recommendation all open
  the same drawer with the same four tabs.
- **History tab** records every inspection this session, so "what was I just
  looking at" has an answer. Clicking a history entry re-opens that object.
- Esc closes. `⌘I` toggles. Closing restores focus to the element that opened it.
- Deep-linkable: `/…?inspect=<kind>:<id>` so an inspector view can be shared in
  a message to a colleague. This is what makes the product feel enterprise-real.

### 8.7 Empty and error states

Every page has three, and they are designed, not defaulted:

- **Empty** — names what is missing *and what would fill it*, with the action
  that fills it. `No anomalies in this scope · widen to the estate`.
- **Loading** — skeletons shaped like the content that will arrive (§10.4), never
  a spinner.
- **Error** — says what failed, whether it is retryable, and offers retry. An
  error must never be the only text on a page.

---

## 9. Navigation

### 9.1 Three layers

| Layer | Access | Contains |
|---|---|---|
| **Rail** (64px) | always | product mark, primary destinations, collapse |
| **Nav panel** (240px overlay) | rail click or `⌘B` | full navigation tree with stages and gates |
| **Command palette** | `⌘K` | everything, searchable, with actions |

### 9.2 The navigation tree

Unchanged in structure from the current `nav.ts`, which already gets this right —
two halves, preparation then analytics, with gating:

```
OVERVIEW            /
ANALYTICS           Explore · Compare · Anomalies · Forecast · Reports
DATA PREPARATION    Library · Import · Schema · Quality · Transform · Predict
DATA                Dataset details · Recent analyses
```

Each item carries a **status dot** — the stage's live state. This is how the user
knows the pipeline is progressing without navigating to it.

### 9.3 Gating without locks

The product removed wizard locks earlier, and that decision is correct and
stays. But "anything is clickable" is not the same as "anything is coherent".

The rule: **a gated page may be opened before its prerequisites are done, but it
must show what is missing and what would produce it.** Never a lock icon.

```
┌────────────────────────────────────────────────┐
│  Forecast needs model selection                 │
│                                                 │
│  Select a model first, or run the pipeline.     │
│                                                 │
│  [ Run remaining stages ]   [ Choose a model ]  │
└────────────────────────────────────────────────┘
```

### 9.4 Command palette

Real actions, not just navigation. Ranking: exact name > recent > frequency >
fuzzy.

| Category | Examples |
|---|---|
| Navigate | `forecast`, `anomalies`, `library` |
| Scope | `scope: Riverside Office`, `scope floor 2`, `clear scope` |
| Time | `last 7 days`, `last 90 days` |
| Actions | `run pipeline`, `abort run`, `export report`, `copy run id` |
| Entities | any device, room, building, model, anomaly by code |
| Appearance | `dark mode`, `compact density`, `print stylesheet` |

Entities are searched from the in-memory hierarchy, so `MTR-A201` opens its
Inspector without a round trip.

### 9.5 Keyboard map

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | command palette |
| `⌘B` | toggle nav panel |
| `⌘I` | inspector |
| `⌘\` | toggle sidebar rail |
| `g` then `f`/`a`/`e`/`r` | go to Forecast / Anomalies / Explore / Report |
| `?` | shortcut sheet |
| `Esc` | close topmost layer, focus returns to opener |
| `[` / `]` | step back / forward through inspection history |
| `d` | cycle density |
| `t` | cycle theme |
| `f` | toggle full-width chart (compare mode) |
| `Esc` in a filter | clear that filter only |

`?` opens a searchable shortcut sheet. Every shortcut listed there must work.

### 9.6 Persistence

Scope, theme, density, time range, inspector width, open tabs, pinned series and
comparison selections all persist to `localStorage` per user. Reloading the
browser returns the user to exactly the view they left.---

## 10. Component inventory

Everything below is a required part of the system. Components that exist today
and are sound are marked **[keep]**; the rest replace what exists.

### 10.1 Primitives

| Component | Notes |
|---|---|
| `Button` **[keep, extend]** | Add `size: xs/sm/md`, `variant: primary/secondary/ghost/danger`, `loading` with an inline spinner that reserves width |
| `IconButton` | Square, tooltip on hover, mandatory `aria-label` |
| `Input` **[keep, extend]** | Add `leadingIcon`, `trailingSlot`, clear button |
| `Select` **[keep]** | Composite option values already handled; add search for >12 options |
| `Checkbox` / `Radio` / `Switch` **[keep]** | — |
| `SegmentedControl` **[keep]** | The time range and density controls use this |
| `Slider` | New — used for brushing a time range |
| `Combobox` | New — searchable entity picker for scope and palette |
| `Tabs` **[keep, extend]** | Add scroll-shadow overflow and a count badge slot |

### 10.2 Layout

| Component | Notes |
|---|---|
| `Surface` / `Card` / `Panel` **[keep]** | Good. Add `Panel` header slots for a legend and a footer for source/method |
| `Section` **[keep]** | — |
| `Grid` | New — responsive 12-col with `--space-4` gutters, replaces ad-hoc Tailwind grids |
| `SplitPane` | New — resizable, persisted, used by Compare and the Inspector |
| `Stack` / `Cluster` | New — the only two spacing primitives pages are allowed to use |
| `StickyHeader` | New — page header sticks and collapses on scroll |

### 10.3 Data display

| Component | Notes |
|---|---|
| `KpiTile` **[keep, extend]** | Add `sparkline`, `delta` (with direction semantics), `loading` skeleton |
| `HeroMetric` **[keep, extend]** | Becomes `HeroConstellation` — 1 primary + up to 3 supporting metrics (§15.1) |
| `Badge` / `SeverityTag` **[keep, extend]** | **SeverityTag must take the classifier's 3-value vocabulary**, not 5 (§5.4) |
| `ProgressBar` / `MeterBar` **[keep]** | Add `tone` for `--ai`, `--live`, `--gain` |
| `DataGrid` **[keep, extend]** | Add column pinning, column visibility, saved views, CSV export, and row selection |
| `Sparkline` | New — inline SVG, 2px, no axes, no tooltip; used in KPI tiles and table rows |
| `DeltaBadge` | New — value change with correct polarity semantics (§10.5) |
| `ConfidenceBar` | New — a 0–100% bar that reads uncertainty, not performance |
| `QualityBadge` | New — score 0–100 mapped to `--ok`/`--warn`/`--critical` with a threshold label |
| `DotMatrix` | New — one dot per entity, for scale-without-counting (§14.11) |
| `SparkTable` | New — in-cell bars, for rank-within-a-column |
| `Legend` **[keep]** | Make it interactive: click to toggle a series |

### 10.4 Feedback

| Component | Notes |
|---|---|
| `Callout` **[keep]** | Extend tones to include `--live` and `--ai` |
| `Skeleton` **[keep]** | **Must be shape-matched**: a chart skeleton is a plot-area block, a KPI skeleton is a label+value block |
| `EmptyState` **[keep, rewrite copy]** | §8.7 |
| `ErrorState` **[keep]** | Must offer retry when the error is retryable |
| `Toast` **[keep]** | Add `duration` and an inline action slot |
| `LiveRegion` | New — `aria-live="polite"` wrapper for all streaming updates |
| `ProgressTrail` | New — the animated pipeline, §14.12 |

### 10.5 Delta semantics — a correctness rule, not a style

A change is good or bad **relative to what the number is**. Unifying this is
what stops the product from showing a green "+18% energy" as a win.

| Quantity | Increase is |
|---|---|
| cost, spend, CO₂, anomalies, excess kWh, payback months | bad — `--critical` |
| energy saved, recoverable kWh, load factor, DQ score, model R² | good — `--ok` |
| latency, duration | neutral — `--ink-low` |

`DeltaBadge` takes a `polarity` prop and this table is enforced in one place.

---

## 11. Data visualisation catalogue

Every chart the product is allowed to draw, with the exact backend field that
feeds it. **A chart not in this catalogue does not get built.** This is the
mechanism that enforces "every visualisation must answer a business question".

### 11.1 Time series

| Chart | Feeds from | Answers |
|---|---|---|
| **Line / area trend** | `content` readings, `forecast.hourly[720]` | What is the shape of consumption? |
| **Forecast cone** | `hourly[].{lower_kwh, upper_kwh}` | How confident are we, and how fast does that decay? |
| **Forecast vs actual** | `monthly_history[3]` + `monthly[12]` | Does the model track reality? |
| **Sparkline** | any numeric series | Trend at a glance, no space cost |
| **Step / event track** | `run.started_at/completed_at`, traces | When did the pipeline move? |
| **Baseline overlay** | anomaly `expected_kwh` vs `actual_kwh` | What *should* this have been? |

### 11.2 Comparison

| Chart | Feeds from | Answers |
|---|---|---|
| **Grouped / paired bars** | `forecast.compare.rows[2]` | How does this building differ from the other? |
| **Ranked bars** | `anomaly.top_devices[10]`, `rec` by device | Which asset matters most? |
| **Diverging bars** | `anomaly[].deviation_pct` | Over or under baseline, by how much? |
| **Slope chart** | two time points | Did this asset improve or decay? |
| **Small multiples** | per-building/per-floor series | Does the pattern repeat everywhere, or in one place? |
| **Bullet chart** | `rec.savings_kwh` vs a target | Is this action worth its size? |
| **Stacked share bars** | `report.figures` building shares | What fraction of the estate is this? |

### 11.3 Distribution

| Chart | Feeds from | Answers |
|---|---|---|
| **Histogram** | column `statistics`, `model` residuals | What does the data look like? |
| **Box / violin** | `content` by device or category | How much do devices vary? |
| **ECDF** | `content.energy_kwh` | What fraction of readings exceed X? |
| **Radar** | `model.candidates[].metrics{7}` | Which model wins on which dimension? |
| **Scatter (true/false positive style)** | `model` predicted vs actual | Where does the model fail? |
| **Correlation matrix** | `schema.statistics`, feature set | Which features are redundant? |

### 11.4 Temporal / calendar

| Chart | Feeds from | Answers |
|---|---|---|
| **Hour-of-week heatmap** | `content` resampled to 168 cells | *When* in the week does this building misbehave? This is the strongest single visual in the product and replaces the current `DemandCurve` table. |
| **Calendar heatmap** | `anomaly[].detected_at` | On which days did problems cluster? |
| **Month × category grid** | anomaly / DQ by period | Is this seasonal or systemic? |
| **Duration bars** | stage `duration_ms` | Where does the pipeline spend its time? |

### 11.5 Hierarchical

| Chart | Feeds from | Answers |
|---|---|---|
| **Treemap** | `hierarchy` + per-node energy | Where is the energy concentrated by area? |
| **Sunburst** | same | Same question, more legible for deep nesting |
| **Ivy / treemap + hierarchy list** | `hierarchy` | Where do I drill next? |
| **Tree** | `hierarchy.tree` | What is the estate's shape? |

### 11.6 Flow

| Chart | Feeds from | Answers |
|---|---|---|
| **Sankey** | derived from `scope_totals` grouped by building/floor | Where does the energy move through the estate? Requires a derivation layer — see §11.9. |
| **Waterfall** | `recommendation` savings, `aggregates.cost_by_band` | How do we get from baseline to projected? |
| **Pipeline flow** | run stages | Where is the run? (Animated, §14.12) |

### 11.7 State / status

| Chart | Feeds from | Answers |
|---|---|---|
| **Gauge / arc** | `load_factor_pct`, `quality.overall_score` | Is this healthy, in one glance? |
| **Traffic-light row** | DQ `results[].severity` | Which checks failed? |
| **Confidence bar** | `rec.confidence`, `horizons[].band_width_pct` | How much do we trust this? |
| **Progress track** | stage status | How far along is the run? |
| **Risk matrix** | severity × excess cost | What do we fix first? |

### 11.8 Network

| Chart | Feeds from | Answers |
|---|---|---|
| **Force graph** | `rec.anomaly_ids` links, device→building | Which anomalies share a cause? |

### 11.9 Derivations — the only place new numbers may be created

The backend is fixed. Four derived quantities are permitted, each computed in
one documented module (`lib/derive/`) with a unit test:

| Derivation | From | Used by |
|---|---|---|
| Energy share per node | `scope_totals` grouped by hierarchy node | Sankey, treemap, stacked bars |
| Cost share per node | share × `aggregates.blended_rate_per_kwh` | tooltips on the above |
| Per-device deviation | `anomalies` grouped by `device_code` | linked highlighting across pages |
| Programme rollup by building | `programme.buildings{}` | estate vs building split |

**No other arithmetic in the frontend.** Every other number is rendered as the
backend produced it. This keeps the frontend honest and makes the derived layer
small enough to test completely.

---

---

## 12. Interaction design

The rule that makes every screen feel navigable: **the same gesture means the
same thing everywhere.** Hovering is always inspection, clicking is always
depth, right-clicking is always the object's own actions. A user who learns this
on Anomalies has learned it for the rest of the product.

### 12.1 The gesture grammar

| Gesture | Result | Everywhere |
|---|---|---|
| **Hover** | Tooltip with the value, the unit, and the comparison basis | Charts, cells, rows, list items |
| **Click** | Opens the Inspector on that object | Every chart mark, sparkline segment, heatmap cell, row, treemap node, bubble |
| **Right-click** | Context menu with that object's own actions | Charts, cells, rows, tree nodes |
| **Drag on a plot** | Brush to select a time range; every linked chart follows | All time series |
| **Scroll on a plot** | Zoom the time axis, anchored at the cursor | All time series |
| **Shift-click** | Adds to the selection, does not replace it | Any selectable set |
| **Ctrl-click** | Toggles one item in a multi-select | Any selectable set |
| **Double-click** | Opens the object's full page (where one exists) | Rows, list items |
| **`Esc`** | Closes the topmost layer; focus returns to the opener | Global |

**Click never navigates away.** Navigation is for changing what you are looking
at; the Inspector is for looking harder at what you already have. That
distinction is what keeps a user from losing their place.

### 12.2 Context menus

Right-click yields only actions that are valid for *that* object — never a
generic menu. A device offers "Set as scope", "Open in Explore", "Show
anomalies", "Copy code". A recommendation offers "Set scope", "Show linked
anomalies", "Copy action". A model candidate offers "Show why it won" and "Show
its metrics".

Menus are keyboard-navigable, close on `Esc` or outside click, and are positioned
to never render off-screen.

### 12.3 Drill-down

Wherever a hierarchy exists, drilling is the same three gestures:

- **Hover** a parent → children brighten, others dim to 40%.
- **Click** a parent → Inspector shows the children ranked, each clickable.
- **Click** a child in the Inspector → the Inspector descends, and the breadcrumb
  gains a level.

Drill depth is undoable one level at a time with `[`, and the breadcrumb is
always a jump-out. Depth is capped at the hierarchy's real depth (4 levels) —
there is no virtual depth.

### 12.4 Zoom, brush, and reset

Every zoomable view carries a small **scope-of-view indicator** in its header
showing the visible range and a `Reset zoom` affordance that appears only when
zoomed. A chart whose visible range silently differs from the page's time range
is a chart that lies, so the difference is always on screen.

Linked charts share one time domain. Zooming one zooms all of them, and the
synchronisation is visible because they all move at once.

### 12.5 Cross-filtering

Selecting anything filters the page, and the effect is visible on the selector
itself:

- Selected marks keep full opacity; **unselected marks fade to 40%** rather than
  disappearing, so the whole is never lost.
- The active filter chip appears in the page filter bar with a count.
- Clearing is one click on the chip, or `Esc`.

Cross-filtering is scoped to the page. It never silently changes the global
estate scope — that is a deliberate, larger, explicitly-announced action.

### 12.6 Pinning and comparison

Users build their own comparison set rather than relying on the defaults:

- **Pin** any entity (device, building, room, model, tariff band) to a
  comparison tray in the page footer.
- Pinned series are drawn on every relevant chart in a distinct, stable colour
  and listed in the shared legend.
- Comparison mode (`f`) expands all relevant charts to full canvas width with
  the pinned series overlaid.
- Pins persist per user per dataset, so a saved view can be reopened next week.

Pins are the escape hatch for "I only care about these six rooms", which is how
real facility managers actually work.

### 12.7 Bookmarking and saved views

A **view** is a named, shareable configuration: scope, time range, filters,
pinned entities, density, and the page it belongs to. Saved views appear in the
command palette and in a per-page dropdown, and are encoded in the URL so a
colleague opening the link sees the same view.

This is what makes the product feel like an instrument people have opinions
about, rather than a form people fill in.

### 12.8 Undo and history

- **Undo** covers every state-changing action: scope changes, filters, pins,
  drill-down, saved-view switches. `⌘Z` / `Ctrl+Z`, up to 50 steps, with a
  visible toast that names the action being undone.
- Undo is **not** undone by navigating — leaving a page does not clear history.
- Destructive or server-side actions (starting a run, deleting a dataset,
  exporting) are never auto-undone; they confirm instead.

### 12.9 Replay

Runs can be replayed, because "show me what the pipeline did" is a question the
event stream already answers:

- A completed run's event trace can be replayed at 1×, 4× or 16× in the run
  bar, driving the same progress animations as the original execution.
- Scrubbing the replay timeline moves the pipeline state to any point in the
  run.
- Replay is read-only and clearly labelled as replay — it never re-executes
  anything and can never mutate a dataset.

### 12.10 Timeline scrubbing

Time-based views expose one shared **scrubber** in the page filter bar. Dragging
it updates every chart on the page to that window, so a user can sweep the
dataset and watch each view react — the cheapest possible way to find the
interesting hour.

The scrubber shows the anomaly density beneath the track, so the moments worth
stopping at are visible before stopping at them.

### 12.11 Progressive disclosure as interaction

Disclosure is a gesture, not a layout:

| Level | Gesture |
|---|---|
| Summary | Visible |
| Evidence | One click (Inspector tab, panel expand, "show details") |
| Raw | One further click ("view as table", "show request") |

Every "show more" control states what it will reveal, so clicking is never a
gamble. Disclosure state is remembered per user, so a returning user sees the
depth they chose last time rather than resetting to collapsed.

---

## 13. The honesty register

Components that make the product's limits visible. This is a design system
feature, not a set of warnings bolted on.

| Fact the product knows | How the UI states it |
|---|---|
| `critical` is never emitted (Finding A) | Schema view says *"defined, not emitted by this detector"*; data views never show a zero-valued critical row |
| 5 anomaly classes never fire | Class filter defaults to the 2 live classes; dormant ones sit behind an explicit "show all" with that same note |
| `critical_anomalies` figures are computed over high+moderate (Finding A) | Report figure captions state the severity basis; the section title does not promise criticals |
| Forecast spans 12 months from 3 months of history | Cone width is drawn honestly and `confidence_note` is adjacent, never in a tooltip |
| `model_selection` may sample (`sampled`, `rows_available`, `sample_cap`) | A sampling banner shows the cap and the true row count whenever `sampled` is true |
| `near_tie` means the winner is fragile | A "close call" callout with the margin appears; the selection is not presented as decisive |
| `mape_backtest` is the model's own error | Shown beside every forecast, not buried |
| `total_savings_inr` ≠ programme figure (Finding C) | Only the programme figure is shown; the grouped-basis note is attached |
| `load_factor_pct` 62.76 is a judgement call | Rendered with the band it falls in, not as a bare percentage |
| `file_path` is null; no PDF exists | The export button exports what exists; no dead "Download PDF" |

Every one of these is a place where the product could quietly lie. Each is
specified to tell the truth instead.---

## 14. Page experiences

Every page follows one spine. It is not a suggestion; it is the page contract.

```
 0  ORIENT      breadcrumb + scope chip + one claim as the page title
 1  PRIMARY     ONE dominant visual that answers the stage's question
 2  SUPPORT     2–4 secondary panels, each answering a sub-question
 3  INVESTIGATE the data table, always present but visually subordinate
 4  EVIDENCE    provenance + method, one click away, never above the fold
 5  ACT         one primary action, always in the same place
```

**Level 1 is mandatory and singular.** A page with two competing heroes has no
hero. Everything below level 1 is progressive disclosure: visible on demand,
never hidden behind a wizard.

Shared rules for all pages:

- Header actions sit top-right, ordered: `Export`, `Secondary`, **`Primary`**.
- Every table has the same toolbar: search, filters, column control, density,
  export.
- Every chart has a title that states the claim, not the chart type.
- No page begins with a table. No page begins with a paragraph.

---

### 14.1 Overview (`/`)

**Question:** where does this estate stand, and what needs me?

- **Level 1 — Estate pulse.** A single wide hero: an **hour-of-week heatmap** of
  total estate consumption. This is the product's signature visual and it is
  here, at the front door, because it is the one picture that is always
  interesting. Overlaid: a marker for the current hour, and anomaly density
  encoded as a dot in each cell so problems are visible *as a pattern*.
- **Level 2 — Four live tiles:** data health (DQ score), monthly spend, open
  anomalies, annual recoverable value. Each with a sparkline and a `DeltaBadge`.
- **Level 2 — Pipeline strip.** The 10 stages as a horizontal `ProgressTrail`
  (§14.12), live-updating, clickable into each stage.
- **Level 2 — Needs attention.** The top 5 anomalies by excess cost, as rows,
  each opening the Inspector.
- **Level 3 — Recent analyses**, collapsed by default, last 10.

---

### 14.2 Dataset Library (`/library`)

**Question:** are we working with the right dataset, and is it complete?

- **Level 1 — Dataset cards**, not a table. Each card: name, a 168-cell
  micro-heatmap of its own data, granularity, readings, device count, DQ score
  badge, last analysed. The micro-heatmap lets you compare datasets *by their
  data*, which a table of row counts cannot.
- **Level 2** — selected dataset: hierarchy breakdown (buildings/floors/rooms/
  devices as a nested bar), provenance panel with `citation` and `random_seed`.
- **Level 3** — schema summary table.

---

### 14.3 Import (`/import/$datasetId`)

**Question:** did the data arrive intact and in the right shape?

- **Level 1 — Ingest receipt.** A left-to-right flow diagram: source → parse →
  normalise → store, each step with row counts in/out. A row-count mismatch is
  the single most important thing on this page, so it is the hero, not a stat.
- **Level 2 — Provenance card** (`provenance{}` — origin, license, collection
  method, version, `random_seed`, `citation`). Reproducibility is the product's
  claim; this is where it is proven.
- **Level 2 — Column intake**: 16 columns as a `DotMatrix` (nulls = hollow,
  unique = filled).
- **Level 3** — full column table.

---

### 14.4 Schema Discovery (`/schema/$datasetId`)

**Question:** do we understand what each column represents?

- **Level 1 — Schema map.** A treemap of columns sized by cardinality, coloured
  by `semantic_type`, with null-rate as a border. The shape of a dataset is
  understood by looking at it, not by reading a table.
- **Level 2 — Type inference confidence**: how many columns were inferred vs
  declared, and the `dropped_columns` list.
- **Level 2 — Distribution strip**: one small histogram per numeric column, in a
  row — a "strip plot" that makes outliers visible at a glance.
- **Level 3** — column table with `statistics{}`.
- **Inspector** on any column: full statistics, sample values, warnings.

---

### 14.5 Data Quality (`/quality/$datasetId`)

**Question:** can we trust this data enough to draw conclusions?

- **Level 1 — Quality score.** A large arc gauge for `overall_score`, with the
  five `by_dimension` values as a **radar** beneath it. The radar's *shape* is
  the insight: one bad dimension is a specific problem, a uniformly low shape is
  a data problem.
- **Level 2 — The 8 checks** as a traffic-light list: each with its score bar,
  severity, and pass/fail. Failing checks are pinned to the top; passing checks
  collapse into a single "7 checks passed" line.
- **Level 2 — Failure impact**: for each failing rule, the downstream stage it
  blocks. This turns a data-quality score into a consequence.
- **Level 3** — rule detail with `details{}`.

---

### 14.6 Transformation (`/transformation/$datasetId`)

**Question:** have we prepared the features without leaking information?

- **Level 1 — Transformation flow.** The 5 steps as an animated left-to-right
  `ProgressTrail`, each showing rows changed. Steps animate as they apply.
- **Level 2 — Shape delta**: `rows_in/out`, `columns_in/out` as a paired bar.
  A row count that changed is a **leakage warning** and is coloured accordingly.
- **Level 2 — Feature ledger**: the 10 created features, each with source
  columns, as a dependency list.
- **Level 3** — per-step fields.

---

### 14.7 Model Selection (`/model-selection/$datasetId`)

**Question:** which model predicts this building best, and can we trust that choice?

- **Level 1 — The race.** A **radar** of the 6 candidates over their 7 metrics,
  with the winner filled and the others as outlines. The `composite_score` is a
  ranked bar beneath it. The visual argument is "this one wins on the axes that
  matter" — which is what a composite score alone cannot show.
- **Level 2 — Why this model**: `rationale`, `winning_criteria`,
  `lost_criteria`, and `margin_over_second`. **If `near_tie` is true, a "close
  call" callout appears** (§13) — the product must not present a coin-flip as a
  decision.
- **Level 2 — Feature importance**: the 9 importances as a ranked bar.
  This is the page's most-used panel for an analyst.
- **Level 2 — Data honesty**: `target_cv`, `span_days`, train/test split, and
  the sampling banner when `sampled` is true.
- **Level 3** — full metric table across all candidates, with a **scatter of
  predicted vs actual** for the winner.

---

### 14.8 Anomaly Detection (`/anomalies/$datasetId`)

**Question:** what is wrong now, and where?

This is the page with the highest information density in the product, and the
one most at risk of becoming the "table page" the brief warns about.

- **Level 1 — Where and how bad.** A **building × device heatmap** of anomaly
  count (sequential ramp), because "where" is the question. Alongside it, a
  severity split as **three** bars — high/moderate/low only (§5.4).
- **Level 2 — The money**: `excess_kwh`, `excess_cost`, `excess_co2_kg` as three
  hero metrics with a stacked share bar by building. Cost is what gets the
  budget approved, so it gets the largest type.
- **Level 2 — What kind**: the 2 live classes, each with count, excess kWh and
  cost. Dormant classes are behind "show all classes" with the Finding A note.
- **Level 2 — Top 10 devices** as ranked bars, each opening the Inspector.
- **Level 3 — The table**: scoped, server-paginated, with the severity and class
  facets *scoped to match* (the existing correct behaviour). The table states it
  covers the worst 200 — it always has, and it must keep saying so.
- **Inspector** on any anomaly: expected vs actual (`expected_kwh` /
  `actual_kwh` as a paired bar), `deviation_pct`, `excess_*`, `score`,
  `baseline_method`, `threshold`, and the `evidence` sentence. That is a complete
  evidence pack from one click.

---

### 14.9 Explore (`/explore/$datasetId`)

**Question:** what do the raw readings actually say?

- **Level 1 — The readings.** A large time series of the current scope with a
  brush-to-zoom scrubber. Scope is applied here today and must stay applied.
- **Level 2 — Hour-of-week heatmap**, the 168-cell view. This replaces the
  current `DemandCurve` **table** with a proper heatmap — the same data, chosen
  because it answers "when" in one glance.
- **Level 2 — Distribution** of the current selection, and the device/category
  breakdown as a ranked bar.
- **Level 3** — the paged readings table, scope-filtered server-side before
  paging (existing correct behaviour).

---

### 14.10 Compare (`/compare/$datasetId`)

**Question:** how does this building differ from the other?

- **Level 1 — Side by side.** A `SplitPane` with synchronised charts: the same
  hour-of-week heatmap for two buildings, brushing linked.
- **Level 2 — The gap.** A diverging bar of the difference, per hour-of-week, so
  the *shape* of the difference is visible, not just the totals.
- **Level 2 — Divergent metrics**: a slope chart of peak, load factor, quality
  and anomalies between the two.
- **Level 3** — metric table with deltas.

---

### 14.11 Forecast (`/forecast/$datasetId`)

**Question:** what is coming, and how much will it cost?

- **Level 1 — The cone.** `hourly[720]` with its `lower_kwh`/`upper_kwh` band,
  across the selected horizon. The band is the point: it visibly widens with
  time, and `tariff_band` shades the background so expensive hours read as
  expensive before any number is read.
- **Level 2 — Four horizons** (`24h · 7d · 30d · 12m`) as four tiles, each with
  `total_kwh`, `total_cost_inr`, `peak_demand_kw`, `co2_tonnes`, and
  **`band_width_pct` as a confidence bar**. A user can see at a glance that the
  12-month number is the least trustworthy — which is exactly the judgement they
  need before quoting it.
- **Level 2 — Cost composition**: a waterfall from kWh to bill —
  `blended_rate_per_kwh`, `cost_by_band[3]`, `standing_charge_inr`. This is how
  a bill is actually built, and it is currently invisible.
- **Level 2 — Model basis**: `selected_algorithm`, `mape_backtest`,
  `exogenous_assumption`, `history_hours`. Adjacent, not buried.
- **Level 2 — Per-device forecast**: `scope_totals[102]` as a treemap or ranked
  bars, scope-filtered and exact.
- **Level 3** — the hourly table with tariff band per row.

---

### 14.12 Dataset Details (`/datasets/$datasetId`)

**Question:** what exactly is in this dataset?

- **Level 1 — The estate.** A **sunburst** of building → floor → room → device,
  sized by energy. Click any node to set scope and drill.
- **Level 2** — coverage timeline, granularity, reading count, device categories.
- **Level 3** — full hierarchy table.

---

### 14.13 Action Plan (`/report/$datasetId` tab)

**Question:** what should we do, and how much does it save?

- **Level 1 — The programme.** The estate number: `annual_recoverable_inr` with
  `payback_months` and `payback_verdict` — at 3× the size of everything else on
  the page, because it is the answer.
- **Level 2 — Priority matrix**: the 109 recommendations as a **risk matrix**
  (payback months × savings) with bubbles sized by `confidence` and coloured by
  `priority`. This immediately shows "ten things worth doing this month".
- **Level 2 — By building**: a grouped bar of `programme.buildings{}` for
  BLD-A and BLD-B side by side.
- **Level 2 — The P1 list**: 10 actions, each with title, device, savings,
  payback, confidence, and an `action` verb. Each opens the Inspector.
- **Level 3** — all 109, filterable, with the grouped-basis note from
  `savings_inventory` attached so the numbers reconcile.

---

### 14.14 Report (`/report/$datasetId`)

**Question:** what do we tell management, and on what evidence?

Per Finding B, this page currently under-uses the most executive-facing data in
the product. It becomes a **narrative document with a visual spine**:

- **Level 1 — Executive header**: the `summary` block as four metrics — health,
  spend, opportunity, and the programme payback — each with a one-line claim.
- **Level 2 — Each of the 12 sections** renders its `figures` as real charts
  inline, with `body` prose as a short lead-in rather than the whole content.
  `organization_summary` → building share stacked bar; `overall_health` → gauge
  row; `data_quality` → radar; `critical_anomalies` → severity bars;
  `predicted_consumption` → the four horizons; `estimated_savings` → waterfall.
- **Level 2 — Export**: the report exports as **what actually exists** — HTML and
  JSON. There is no PDF, because `reportlab` is in requirements but imported
  nowhere and `file_path` is `null`. The button must not promise a file the
  backend cannot produce (§13).
- **Level 3** — the full prose, available as a reading mode.

---

### 14.15 Recent Analyses (`/analyses`)

**Question:** what has this platform already told us?

- **Level 1 — Run history** as a timeline, not a table: each run as a segment,
  width = duration, colour = status, grouped by day.
- **Level 2** — per-run comparison: what changed between the last two runs.
- **Level 3** — run table with trace counts.

---

### 14.16 Login (`/login`)

- Split layout: the product's claim on the left (with a small animated
  hour-of-week heatmap as the hero — the product demonstrates what it does before
  you log in), the form on the right.
- No navigation chrome at all.
- Credentials prefilled in dev only; never in production.---

## 15. Cross-cutting rules

### 15.1 Consistency contract

These hold on every page. A violation is a bug, not a preference.

| Rule | Statement |
|---|---|
| **One hero** | Exactly one level-1 visual per page |
| **Action placement** | Primary action, bottom-right of the page footer, or header top-right. Never both |
| **Export** | Always top-right, always second, always the same icon + label |
| **Inspector** | Every visual object opens it. Nothing navigates instead |
| **Filtering** | Filters live in one place per page, above the content they filter, and are always visible — never behind a funnel icon |
| **Table behaviour** | Same toolbar, same density control, same export, same column pinning |
| **Chart interaction** | Hover = tooltip. Click = Inspector. Drag = brush/zoom. Right-click = context menu. Uniform everywhere |
| **Empty/error** | §8.7, on every page |
| **Loading** | Shape-matched skeletons, never a spinner over a whole page |
| **Scope** | Global, persistent, visible as a chip, announced on change |
| **Motion** | §7 vocabulary, identical triggers everywhere |
| **Numbers** | tabular, mono, en-IN grouping, no unit ambiguity |

### 15.2 Responsive behaviour

This is a desktop-first enterprise product. Tablet works; phone is not the
target and pretending otherwise produces a compromised desktop.

| Breakpoint | Behaviour |
|---|---|
| **≥1920px** | Canvas centres at 1600px. Inspector may dock rather than overlay |
| **1440–1919px** | Primary target. Full layout |
| **1280–1439px** | Secondary panels drop to 2-up. Split panes still work |
| **1024–1279px** | Nav panel becomes overlay-only. 3-up becomes 2-up. Inspector overlays |
| **768–1023px** | Single column. Inspector becomes a full-height sheet. Charts drop annotations below the plot |
| **<768px** | Read-only viewer mode: KPIs and charts only, tables become stacked cards, filters collapse to a sheet. The run controls are read-only. Honest about what it is |

Charts never simply shrink. Below 1280px they drop the second axis, then the
legend moves below the plot, then annotations move under the plot. A chart that
is unreadable at a width is not responsive.

### 15.3 Accessibility — a floor, not an aspiration

- Every semantic colour paired with an icon or text label (§5.3).
- Full keyboard operability of every control, drawer and palette (§9.5).
- Visible focus ring everywhere: 2px `--brand`, 2px offset, never removed.
- `aria-live="polite"` on streaming regions only — live metrics and the run
  indicator. Not on the whole page.
- Charts ship a text alternative: a summary sentence plus a data table behind
  "view as table". A chart nobody can read with a screen reader is not a chart,
  it is an image.
- Contrast ≥ 4.5:1 for text, ≥ 3:1 for chart marks and focus indicators, verified
  in both themes.
- Full `prefers-reduced-motion` support (§7.5).
- Tables use real `<th scope>`, sortable headers announce `aria-sort`.

### 15.4 The live system

"Liveness" must be honest. The product is alive when there is genuinely
something happening, and calm when there is not.

- **Connection states** are real and distinguished: `connected` (`--live`,
  pulsing), `reconnecting` (`--warn`, slow pulse), `offline` (`--neutral`, static
  with a retry affordance). The current implementation correctly distinguishes
  these and the redesign preserves it.
- **Live counters** tick only while a run is active.
- **Streaming logs** auto-scroll only when the user is already at the bottom;
  scrolling up stops it and offers "jump to latest".
- **Staleness is visible.** A run idle beyond the 30-minute reaper threshold
  shows as `stale` in the run bar rather than as a spinner that never resolves.
- **No fake liveness.** Nothing animates to look busy when the backend is idle.
  This is the line between "alive" and "theme park", and the product stays on the
  right side of it.

### 15.5 The simplification mandate

The brief asks for 50% less visible information and 300% more understanding. The
mechanism is progressive disclosure applied without mercy:

- Level 1 answers the question. **Everything else starts hidden.**
- The default view of any table is **the top 10 rows**, with an explicit "show
  all 2,227" — never 2,227 rows of scroll.
- Collapsing is the default for passing checks, dormant classes, and secondary
  sections. Expansion is one click and remembered per user.
- Every page gets a density check: if a panel can be replaced by a number, it
  becomes a number. If a section can be replaced by a chart, it becomes a chart.

The measurable test, applied per page: **count the elements visible without
scrolling on a 1440×900 screen. The target is under 20 per page.**

---

## 16. What ships, and in what order

The roadmap is in [REDESIGN_ROADMAP.md](REDESIGN_ROADMAP.md). Summary:

| Phase | Outcome |
|---|---|
| 0 | Design tokens extended; fonts self-hosted; new semantic colours live |
| 1 | Core component library rebuilt on the new tokens |
| 2 | Shell: nav overlay, topbar, scope bar, inspector drawer |
| 3 | Chart primitives rebuilt on the catalogue |
| 4 | High-value pages: Overview, Anomalies, Forecast, Report |
| 5 | Remaining stage pages |
| 6 | Workspace pages, comparison, command palette depth |
| 7 | Motion, empty states, responsive, accessibility sweep |
| 8 | Cleanup: delete replaced components, drop dead CSS, re-measure bundle |

Phases 0–2 are pure infrastructure and change no user-visible behaviour, so each
is independently shippable and independently revertable.

---

## 17. Definition of done

A page is done when all of these are true:

1. It passes the §1.3 one-sentence test on a 1440×900 screen.
2. It has exactly one level-1 visual.
3. Every visual is in the §11 catalogue and cites a real backend field.
4. Every visual object opens the Inspector.
5. It states every limit it has, per §13.
6. It has designed empty, loading and error states.
7. It is keyboard-operable and has chart text alternatives.
8. It holds under 20 visible elements before scroll.
9. It obeys the §15.1 consistency contract.
10. It renders correctly in both themes and at 1280px and 1920px.

## 18. What this redesign deliberately does not do

Stated plainly, so nobody re-litigates it later:

- **No backend changes.** Every number rendered is computed by existing backend
  code, except the four documented derivations in §11.9.
- **No new page.** Sixteen pages, same routes. The action plan stays a tab of
  the report — that decision is already right.
- **No mobile-first rewrite.** This is a desktop product; phone gets an honest
  read-only mode instead of a compromised one.
- **No PDF.** `reportlab` is installed and unused; the product exports HTML and
  JSON and says so.
- **No gates.** Every page remains reachable; unrun prerequisites show what is
  missing rather than a lock.
- **No invented metrics.** If the backend does not compute it, it is not shown —
  which is why §11.9 exists and is short.