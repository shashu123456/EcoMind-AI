# EcoMind AI — Design Decisions

Every visual and interaction decision, with its rationale and the rule that must be kept.
**No design decision may exist only in code.** When a decision changes, change it here in the same commit.

Status legend: `DECIDED` (in force) · `PARTIAL` (in force but incomplete) · `GAP` (known inconsistency, scheduled).

---

## 1. Identity

| Decision | Value | Rationale |
|---|---|---|
| Product tone | Enterprise energy intelligence, inspectable by default | The product sells *trust*; the UI must look like an instrument, not a toy |
| Theme | Dark-first (`--eco-ink #0a110e`), light theme switchable | Control-room reading; long sessions; chart legibility |
| Own identity | Dark ink + mint accent + mono micro-labels + glass panels | Must not read as a bootstrap/tailwind template. `DECIDED` |
| Motion character | Ease-out / ease-in-out / spring, natural deceleration. **No bounce, no elastic** | Playful motion contradicts "enterprise instrument" |
| Reference bar | Microsoft Fabric, Power BI, Grafana, Datadog, Azure Monitor, Siemens MindSphere, Schneider EcoStruxure, GE Digital, Honeywell Forge, IBM Maximo, Splunk, Kibana, Looker | Principle study only. **Never copy a layout.** `DECIDED` |

---

## 2. Colour

### 2.1 Base tokens (`:root` in `AppShell.css`) — `DECIDED`
`--eco-ink`, `--eco-ink-2`, `--eco-panel`, `--eco-panel-2`, `--eco-panel-3`, `--eco-line`,
`--eco-line-strong`, `--eco-text`, `--eco-text-soft`, `--eco-text-muted`, `--eco-shadow`, `--eco-sidebar`.
Light theme redefines all of them under `.eco-app--light`, so no component may hard-code a base colour.

### 2.2 Semantic accents — `DECIDED` (intent) / `PARTIAL` (application)
| Token | Value | Meaning | Never use it for |
|---|---|---|---|
| `--eco-mint` | `#b6f36b` | Success, complete, AI core, primary action | Errors, warnings |
| `--eco-blue` | `#79d6c4` | Information, running, active | Success |
| `--eco-violet` | `#8d86ff` | Evidence, AI reasoning, forecast, confidence | Critical |
| `--eco-orange` | `#f5a56d` | High priority, warning | Success |
| `--eco-coral` | `#f07f6e` | Critical, error, anomaly | Success |
| `--eco-yellow` | `#e6ca78` | Medium severity | Critical |

**Rule:** colour is never the only carrier of meaning — severity is always also labelled in text.

### 2.3 GAP-1 — chart palette is not tokenised
Charts receive raw literals (`#b6f36b`, `#8d86ff`, `#f5a56d`, `#f07f6e`, `#718b7b`, `#15231b`, `#30473a`).
Consequence: a palette change cannot be made in one place, and light-theme charts keep dark-theme strokes.
**Scheduled as P3-1.**

---

## 3. Typography

| Decision | Value | Rationale |
|---|---|---|
| UI typeface | `Inter, "Segoe UI", system-ui, sans-serif` | Neutral, dense, excellent at small sizes |
| Data/label typeface | `ui-monospace, monospace` | Numbers and identifiers must align and be unambiguous (`1` vs `l`) |
| Micro-labels | Uppercase mono, tracking `.05em–.16em`, 8–11 px | Reads as instrumentation; separates label from value |
| Numerals | Tabular by font choice (mono) in tables and KPIs | Column alignment when values change during live runs |
| Headings | Negative tracking (`-.025em` → `-.075em`), weight 520–590 | Large headings need optical tightening |

### GAP-2 — no published type scale
Sizes are ad hoc: view titles `clamp(26px,3vw,42px)`, hero `clamp(42px,5.2vw,72px)`, mono labels 7–11 px.
There is no token layer, so a new component has to invent a size. **Scheduled as P3-2.**
Target scale: `.eco-hero` / `.eco-title` / `.eco-subtitle` / `.eco-body` / `.eco-micro` / `.eco-eyebrow`.

---

## 4. Layout

| Decision | Value | Rationale |
|---|---|---|
| Shell grid | `grid-template-columns: var(--eco-sidebar) 1fr`, rows `64px 1fr`, aareas `sidebar topbar / sidebar main` | Persistent nav + persistent context, one scroll container |
| Sidebar | 256 px expanded, 76 px collapsed, sections Workspace / Understand / Analyze / System | Mirrors the frozen eleven-stage journey; the rail is the mental model |
| Nav status badge | Live count per section; sizing reserved so counts do not reflow the rail | Nav must not jump when data arrives |
| Context strip | 40 px, single row, horizontally scrollable | Always answers "which dataset / domain / baseline / model / run / freshness" |
| Max content width | 1540 px, centred | Ultra-wide legibility |
| Panel | 11 px radius, 1 px `--eco-line`, subtle white gradient sheen | Defines a surface without heavy borders |
| Grids | Explicit per-view grids, not a generic 12-col system | Each view has a different information shape; a generic grid would force compromise |
| Glass | `backdrop-filter` on topbar, sign-in card, chips only | Glass is expensive; reserved for floating surfaces over content |

### GAP-3 — no mobile breakpoints outside sign-in
`dashboard-grid`, `schema-layout`, `import-layout`, `quality-three-panel`, `models-layout`,
`anomaly-table-panel`, `recommendation-layout` are desktop-only. The three-terminal DQ layout is the worst case.
Reported screens must reflow to: cards first → charts optimised → inspector fullscreen. **Scheduled as P3-4.**

### GAP-4 — activity terminal is an overlay
Expanded, it covers page content (observed over the anomaly chart's dataset/baseline sub-block).
Decision: the terminal is a **docked bottom surface with reserved height**, not a floating sheet, so nothing is
ever hidden. **Scheduled as P3-6.**

---

## 5. Navigation

| Decision | Value | Rationale |
|---|---|---|
| Views are frozen | 14 views + landing (spec §1). Never add or move one | The navigation *is* the product's story |
| Router | None — `activeView` state in the shell | One screen, one workflow; a router would add history states the pipeline does not have |
| Stage gating in nav | Locked items are visibly disabled until the prerequisite completes | Mirrors the backend's positional gate; the UI must never imply a reachable stage |
| Stage → view mapping | `STAGE_KEY_BY_VIEW` bridges the eleven pipeline keys to the 14 view ids | One place for the mapping; prevents drift between rail and backend |
| Pipeline rail | Clickable stage nodes showing number, label, status and real duration | The rail is the primary progress instrument; durations come from stage traces |
| Top bar | Breadcrumb, search, notifications, theme toggle, profile | Standard enterprise affordances; must never carry pipeline state |

### GAP-5 — a 15th nav destination exists
`NavId` includes `notifications` while the view freeze names 14 + landing. Notifications belong in the top-bar
popover (where they also exist). Resolve by either removing the nav entry or amending the freeze explicitly —
do not leave it ambiguous.

---

## 6. Motion

| Decision | Value | Rationale |
|---|---|---|
| Sound | **No per-interaction sounds.** `useSound().play()` is a silent no-op that still fires `onPlay` so existing wiring is unchanged | 49 interaction sounds made the product feel like a toy |
| Sound allowed | One completion chime (`playCompletionChime`), Web Audio, two-note rising arpeggio, volume 0.12 | Only real milestones: sign-in, stage complete, run complete |
| Animation rule | **Every animation must represent a real backend event.** No decorative motion | Motion is documentation of what the system is doing |
| Ambient motion allowance | Orbit rings, radar sweep, signal drift, telemetry grid on the sign-in/hero panels, plus the pipeline energy flow | These represent "AI core idle/online", not a fake process. Permitted as ambient only on non-data surfaces |
| Timing | 140 ms micro (hover/colour), 280 ms view enter, 220 ms sidebar width, 400 ms progress width | Fast enough to feel immediate, slow enough to read |
| Technique | CSS keyframes, transform/opacity only, `prefers-reduced-motion` honoured | GPU-safe, accessibility-safe |
| Naming | `view-in`, `pulse-ring`, `orbit-spin(-reverse)`, `signal`, `blink`, `flow-line`, `flow-node`, `flow-spark`, `radar-spin(-reverse)`, `core-breathe`, `chip-float`, `signin-card-in`, `signin-grid-drift`, `terminal-beacon`, `terminal-row-in`, `toast-in`, `pop-in`, `inspector-breathe` | Stable vocabulary; new motion reuses or extends these |

**Pending (P6):** database-write animation, AI-reasoning animation, pipeline energy flow bound to live stage
transitions. Currently only the pipeline rail and terminal carry live state motion.

---

## 7. Charts

| Decision | Value | Rationale |
|---|---|---|
| Library | `recharts` (already a project dependency) | Do not introduce a second chart library |
| Palette in charts | Token values, not literals | See GAP-1 |
| Tooltip | Custom-styled dark panel, 11 px, 8 px radius, matching border | Default recharts tooltips break the dark surface |
| Grid | Dashed `2 5`, vertical lines off on time series | Reduces noise; time is already implied by the axis |
| Observed vs baseline | Observed = solid accent; baseline = dashed muted `4 4` | Dashed = "learned/reference", solid = "measured" |
| Trust band | Forecast confidence drawn as a filled gradient overlay (violet, 0.25 → 0.02) | Uncertainty must be visible, not implied |
| Anomaly markers | Coral dots with a panel-coloured ring, `connectNulls={false}` | Only real anomalies get a marker; no interpolated phantom points |
| Threshold line | Orange dashed reference line at the recorded threshold | Honesty: the reader sees the rule that fired |
| Axis labels | Muted, 10 px, tick lines off | Axis furniture must not compete with data |
| Units | **Always labelled, always derived from the recorded target column** — see §9 | An unlabelled or wrong axis is a correctness bug, not a styling choice |

**Pending (P4):** linked hover/cross-filter, brush, zoom, fullscreen, export, accessible data-table fallback,
heatmap, device tree, scenario comparison.

---

## 8. Icons

| Decision | Value | Rationale |
|---|---|---|
| Set | `lucide-react` at `strokeWidth 1.8`, sizes 13–23 | Single visual language, outline style suits instrumentation |
| Domain icons | `Building2` building · `Factory` industry · `Warehouse` logistics | Drives dataset card, summary, hero |
| Meter-family icons | `Cpu` motor · `Activity` hvac · `Lightbulb` lighting · `Cog` compressor · `Warehouse` conveyor · `Snowflake` cold room · `Thermometer` chiller · `ArrowUpDown` lift · `Waves` pump · `Zap` utility | Equipment families must be recognisable at a glance |
| Role affordance | Icon per role (calendar → index, leaf → target, building → entity, user → context, zap → signal) | Makes the schema table scannable |
| Decorative icons | Always `aria-hidden` | Icons never carry unlabelled meaning |
| Status dots | 6 px, accent + 3 px glow ring | Small, calm, unmistakably "live" |

### GAP-6 — five required domains have no identity
Hospitals, University Campuses, Shopping Malls, Office Complexes and Data Centres fall back to the three
existing domains because `domainOf()` classifies only building / industry / logistics. The spec requires
per-domain icons, hierarchy labels, terminology, KPI focus and units. **Scheduled as P3-5.**

---

## 9. Numbers and units  ← *most important correctness decision*

**Decision:** the frontend owns **display formatting only**. It never invents, converts or assumes a unit.

| Quantity | Unit source | Display |
|---|---|---|
| Modelled target (energy, power, …) | `target_column` recorded by `model_selection` (fallback `forecast`) | `lib/units.ts → unitForColumn()` |
| Model error (MAE / RMSE) | **the modelled target's unit** | same as target |
| Energy totals, forecast totals | the modelled target's unit | same as target |
| Cost | backend records `*_inr` | `₹` via `displayUnit()` |
| Carbon | backend records `*_co2_kg` | `kgCO₂` via `displayUnit()` |
| Per-column units in the schema view | derived from the column name | `unitForColumn()` |
| Column role (index / entity / context / target / signal) | backend `semantic_type` first, column name to disambiguate | `lib/schema.ts → roleForColumn()` |
| Column signal family (hvac, chiller, cold chain, it load, …) | the column's own name tokens | `lib/schema.ts → familyForColumn()` |

**Rules**
1. If the backend recorded no unit, **omit the unit** — never guess. `withUnit()` simply drops it.
2. A model trained on `energy_kwh` has error in **kWh, not kW**. This was a real shipped defect
   (label `kW`, axis `MAE / kW`) and is now fixed and verified (`MAE 364.91 kWh`, axis `MAE / kWh`).
3. **Never assert an intensity denominator the dataset does not contain.** `kWh / m²`, `kWh / tonne` and
   `kWh / pallet` were fabricated from a domain template; the field was dead and has been deleted. If an
   area/turnover/production denominator ever becomes real, it must arrive from the backend.
4. Cost and carbon are separate axes from energy; they never share an axis or a unit token.
5. Rounding: integers for counts, 2 dp for model error, 3 dp for R², 1 dp for percentages.
   Locale grouping must be consistent (GAP-7).
6. **A unit literal may not appear in a view.** Currency, carbon and target units all resolve through
   `displayUnit()`; a hard-coded glyph is a defect even when the glyph is currently correct.
7. **Roles and families are derived, never catalogued.** There is no per-domain field list: the backend
   records column names, not a field catalogue, so a hard-coded one is fabrication by construction.
   An unrecognised column falls through to the `signal` role and `signal` family — which is honest —
   rather than being assigned a plausible-looking unit it does not have.
8. Schema fields are listed **index → entity → context → target → signal** (stable sort, backend order
   preserved inside a role) so the reader meets the time axis and the entities before the measurements.

**Deliberately not done:** inferring a unit from the *values* of a column. A column named `reading_1`
with values in the 0–1 range could be a ratio or a normalised index; guessing would reintroduce exactly
the class of defect this section exists to prevent. Unknown stays unknown.

### GAP-7 — inconsistent number formatting
Records mix `en-IN` grouping (`2,36,757`) with Western grouping (`5541`, `75,76,850`) and mixed precision.
**Scheduled as P3-3.**

---

## 10. Cards, panels, states

| Decision | Value | Rationale |
|---|---|---|
| Panel | 11 px radius, `--eco-panel` surface, hairline border, header padding `20px 20px 0` | Consistent surface for all content |
| Metric block | Label (mono 9 px) → value (25 px, accent) → delta (10 px, direction colour) | Fixed vertical rhythm so KPI rows align across views |
| Delta direction | `up` = coral, `down` = mint | In energy, *down is good*. Direction is semantic, not arithmetic |
| Data table | Sticky header row, hairline row separators, mono identifiers, `code` for keys | Dense reading without zebra striping (striping fights the dark surface) |
| TinyTag | 8 px mono uppercase, per-tone border + 8 % fill | Small enough to sit inline in a table cell |
| Empty state | `table-empty-note` / `library-empty` / `forecast-breakdown__empty`, muted mono, one sentence | Must state *why* it is empty, e.g. "No anomalies recorded for this dataset." |
| Loading | Never a bare spinner — stage, operation, records, logs, skeletons | A spinner teaches the user nothing |
| Error | Calm: problem + reason + retry + logs. **No shake** | Errors must not feel like punishment |
| Success | Check/pulse + pipeline advances + logs update | Success is a state change, not a confetti moment |
| Interactive rows | `:hover` raises surface, `:focus-visible` visible ring | Every clickable row must be reachable by keyboard |

---

## 11. Sign-in / entry (FE-003)

| Element | Decision | Rationale |
|---|---|---|
| Split layout | Narrative panel + glass credential card | The first screen must explain the product, not just gate it |
| Narrative | "From raw signal to resilient operations." + a 5-step flow rail (INGEST → UNDERSTAND → REPAIR → PREDICT → ACT) | Nine pipeline stages compressed to five human verbs |
| Flow spark | A travelling spark along the rail, `flow-spark` 4.6 s infinite | Shows the pipeline *as a flow*, in the one place ambient motion is allowed |
| Stat chips | Three floating glass chips (10-stage pipeline · raw data immutable · score-ranked models) | Claims must be true of the product — no invented counts |
| Radar core | Three counter-rotating rings + leaf core, `core-breathe` | "AI core online" without pretending to process anything |
| Credentials | Email + password with a register fallback; demo account documented | A reviewer must get in without setup |
| Compliance copy | SOC2-ready controls · human-in-the-loop by default | Enterprise signal, calm, not boastful |
| Breakpoints | 980 px and 620 px defined | Entry is the one surface fully responsive today |

---

## 12. Accessibility commitments

| Commitment | Where |
|---|---|
| Skip link to main content | `.skip-link` in the shell |
| Every icon-only control is labelled | `aria-label` on nav, terminal, inspector, history replay |
| Toggle state exposed | `aria-pressed` on transform toggles |
| Regions named | `aria-label` on the activity terminal and inspector |
| Colour never alone | Severity rendered as text next to every colour cue |
| Reduced motion honoured | `prefers-reduced-motion` block over the keyframe set |
| Focus visible | `:focus-visible` rings on interactive surfaces |

**Pending (P8):** `aria-live` on the terminal, roving focus in the rail and queue, inspector focus
trap + restore, contrast pass on micro-labels, chart data-table alternatives.

---

## 13. Decision log

| # | Decision | Rationale | Status |
|---|---|---|---|
| D-1 | Remove all per-interaction sounds; keep one completion chime | Trust and tone | `DECIDED` |
| D-2 | Delete all module-level mock data; empty states instead | Honesty is a product feature | `DECIDED` |
| D-3 | Units derive from the recorded target column | A wrong unit is a wrong number | `DECIDED` |
| D-4 | Delete intensity units the data never had (`/ m²`, `/ tonne`, `/ pallet`) | Do not claim measurements that do not exist | `DECIDED` |
| D-5 | Empty state over sample data, always | A reviewer must never mistake a demo for a measurement | `DECIDED` |
| D-6 | Vendor chunks split, app chunk ≤ 500 kB | First-paint budget | `DECIDED` |
| D-7 | No second chart library | Every added dependency is a maintenance liability | `DECIDED` |
| D-8 | Fix mojibake rather than hide it | `Â·` in a UI is a visible quality failure | `DECIDED` |
| D-9 | Terminal becomes docked, not floating | It must never cover data | `GAP` → P3-6 |
| D-10 | Palette tokenised for charts | One place to change a colour | `GAP` → P3-1 |
| D-11 | Type scale published | New components must not invent sizes | `GAP` → P3-2 |
| D-12 | Eight domain identities | The spec promises automatic domain adaptation | `GAP` → P3-5 |
| D-13 | One unit vocabulary (`lib/units.ts`); no unit literal in any view | A glyph that is right today is wrong the moment the target changes | `DECIDED` |
| D-14 | One schema vocabulary (`lib/schema.ts`); roles and families derived from real columns | A hard-coded field catalogue is fabrication by construction | `DECIDED` |
| D-15 | Unknown column → `signal` role, `signal` family, no unit | An honest blank beats a plausible guess | `DECIDED` |
| D-16 | No value-based unit inference | Range heuristics cannot distinguish ratio from index; guessing reintroduces the defect class | `DECIDED` |
