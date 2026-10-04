# EcoMind — Frontend Redesign Roadmap

**Companion to:** [DESIGN_SPEC.md](DESIGN_SPEC.md)
**Rule:** backend, APIs and business logic are fixed. This is a frontend-only
rebuild, bottom-up, in the order that keeps the product shippable throughout.

---

## Why this order

The rebuild goes **design system → shell → components → charts → pages**. That
is not conventional frontend sequencing, and the reason matters:

- **Every phase is independently shippable and revertable.** Phases 0–2 change
  no user-visible behaviour, so a bad token decision costs a revert, not a
  broken product.
- **Charts are built after the shell**, because every chart in this product is
  also an Inspector target. Building charts first means rebuilding them.
- **Pages last**, because a page is an arrangement of components. Rebuilding
  components after pages means rewriting every page.

**The bundle constraint is real and it is why Phase 0 ends with a measurement.**
The entry chunk is currently 343 kB / 109 kB gzip after route-level splitting. A
richer component library and more chart types will push on it. Phase 8 must not
regress the figure Phase 0 establishes.

---

## Phase 0 — Foundations

**Goal:** extend the token layer, change no component.

The existing `tokens.css` is genuinely good — one neutral ramp, semantic
colours, a type scale, a 4px space scale. It is kept and extended, not
replaced. That is the difference between a redesign and a rewrite.

| Task | Detail |
|---|---|
| Self-host fonts | Geist Sans + Geist Mono, `woff2`, latin + latin-ext, preloaded, `font-display: swap`. Drop the three Google Fonts requests |
| Extend neutrals | Add the `--ink-*` steps from §5.1 |
| Add `--live`, `--ai`, `--gain` | §5.3. With `-tint`, `-line`, `-ink` variants |
| Rebuild the severity ramp | Three data steps (§5.4); keep the five-step model ramp for schema docs only |
| Rebuild the categorical ramp | Eight hues per §5.5, tuned for CVD separation |
| Add sequential + diverging scales | §5.6 |
| Add `--metric-*` sizes | §4.2 |
| Density tokens | §6.2 |
| Motion tokens | `--dur-instant`, `--ease-standard`, `--ease-exit` (§7.2) |
| Collapse Tailwind colour usage | Pages must use semantic tokens, never raw palette classes |

**Exit:** `tsc` 0, tests green, `prettier` clean, no visual change, entry chunk
≤ 343 kB (regression gate for Phase 8).

**Do first, because everything after it depends on it.** A mistake here is
cheap; the same mistake in Phase 4 is a rewrite of fourteen pages.

---

## Phase 1 — Component library

**Goal:** the primitives and data-display components from §10, built once on the
new tokens. No page uses them yet.

Build order, because later components depend on earlier ones:

1. `Stack` / `Cluster` / `Grid` — the spacing primitives. **Pages are only
   allowed to use these**, which is how the consistency contract becomes
   mechanical rather than aspirational.
2. `Button` variants + `IconButton`, `Input` extensions, `Combobox`, `Slider`.
3. `KpiTile` + `sparkline` + `DeltaBadge` — **with the polarity rule (§10.5)
   enforced in one place from day one.**
4. `SeverityTag` with the 3-value vocabulary (§5.4). This is the component that
   prevents Finding A from ever shipping.
5. `ConfidenceBar`, `QualityBadge`, `DotMatrix`, `SparkTable`.
6. `DataGrid` extensions: pinning, column visibility, saved views, export.
7. `Inspector` drawer shell with its four tabs — built now, empty.
8. `LiveRegion`, shape-matched `Skeleton`.

**Exit:** every component in a Storybook-style gallery at all three densities,
both themes, keyboard-operable.

**The two components worth extra care:** `DeltaBadge` (polarity is easy to get
subtly wrong and wrong polarity is a trust-breaking bug) and `SeverityTag`
(getting this wrong means the product lies about its own data).

---

## Phase 2 — Shell

**Goal:** the application frame from §8. Navigation changes; page content does
not.

| Task | Detail |
|---|---|
| Nav as overlay | The 240px panel overlays instead of taking a column, returning canvas width at 1440px |
| Topbar rebuild | §8.3 ordering, fixed. Dataset switcher, breadcrumbs, time range with *disabled-when-inert* states, live indicator, palette trigger, theme, density, notifications |
| Scope bar | Collapsed pill by default; expanded on demand. Persist. **Announce changes via toast.** Keep the composite option values and the device dedup — both are existing correct fixes |
| Run bar | Contextual: collapsed idle, expanded during a run, hidden on workspace pages |
| Inspector | Opens on the 4 tabs, resolves entities from `getHierarchy`, deep-linkable via `?inspect=` |
| Command palette | Real actions, not just navigation (§9.4) |
| Keyboard map | §9.5 in full, plus the `?` sheet |
| Persistence | Scope, theme, density, time range, inspector state |

**Exit:** navigation is fully rebuilt and every page still works with its old
content. Revert is a single commit.

---

## Phase 3 — Chart primitives

**Goal:** rebuild the chart layer on the §11 catalogue. This is the phase that
earns the right to draw anything new.

### 3a — The frame

`ChartFrame` gains: claim-style titles, an interactive legend, a text
alternative + "view as table", empty vs insufficient-data as distinct states,
and a source/method footer. The existing `empty` prop is a *replacement* for
children, not an overlay, and that contract is preserved deliberately.

### 3b — The catalogue, in dependency order

1. `Sparkline`, `DeltaBadge` integration — the smallest marks, reused everywhere.
2. **Forecast cone** — needs `hourly[720]` with lower/upper. The band morph is
   the product's signature chart and should be right early.
3. **Heatmap** (hour-of-week, calendar, matrix) — generic, then the 168-cell
   specialised view. **This replaces the current `DemandCurve` table.** Its data
   stays; only the presentation changes.
4. Ranked / grouped / diverging bars, `BulletChart`, `SparkTable`.
5. Treemap, sunburst.
6. `Waterfall` — required for cost composition (§14.11) and savings (§14.13).
7. Radar — used by Data Quality and Model Selection, two of the highest-value
   pages.
8. Scatter (predicted vs actual), histogram, box, ECDF.
9. `ProgressTrail` — the animated pipeline, on Overview and Transformation.
10. Sankey and force graph — **last, and only if the §11.9 derivations land**,
    because both require computed links the backend does not return.

### 3c — The rule

**No chart ships without a catalogue entry and a cited backend field.** If a page
needs a visual that is not in §11, it either goes back to the catalogue or the
page goes without it.

**Exit:** the catalogue renders, with fixtures drawn from the verified run
`e5050f33`. Recharts stays the engine; it is competent and swapping it would
cost more than it returns.

---

## Phase 4 — The four pages that matter

Highest information value, highest executive visibility, and where the design
gets its first real test. Built with Phase 1–3 components.

| Page | Why first |
|---|---|
| **Overview** | The front door. Proves the shell, the Inspector, the pipeline trail and the signature heatmap all at once |
| **Anomalies** | Densest page; proves the severity rules, facets and Inspector |
| **Forecast** | Proves the cone, the honesty rules and cost composition |
| **Report** | Proves Finding B — turning 74 computed figures back into visual claims |

**Sequenced as one page, review, next page.** Not four in parallel.

**Exit:** these four meet §17 definition-of-done. This is the milestone where
the product stops feeling like a college project.

---

## Phase 5 — Remaining stage pages

Library, Import, Schema, Quality, Transformation, Model Selection, Dataset
Details, Action Plan, Recent Analyses, Login.

Each is mechanical once Phase 4 has proven the pattern. Order by data richness:
Schema and Quality and Model Selection have the richest verified output and get
the most new visualisations.

**Exit:** all sixteen pages on the new system.

---

## Phase 6 — Workspace depth

| Task | Detail |
|---|---|
| Compare | `SplitPane`, synchronised brushing, diverging delta |
| Explore | Brush-to-zoom, the 168-cell heatmap replacing the table |
| Cross-filtering | Linked highlighting between anomaly charts and tables |
| Comparison mode | Pin entities, compare across scopes |
| Palette depth | Entity search across the in-memory hierarchy |

---

## Phase 7 — Craft

| Task | Detail |
|---|---|
| Motion pass | §7.3 implemented literally; verify every trigger; one pulse only |
| Empty states | Rewrite all copy per §8.7 — name what is missing and what fills it |
| Skeletons | Shape-match every page |
| Reduced motion | Explicit behaviour, not a blanket override |
| Responsive | The §15.2 table, verified at each breakpoint per page |
| Accessibility | Keyboard audit, contrast check both themes, chart text alternatives, screen-reader pass |
| Density | Verify compact mode on every table |
| Print stylesheet | Greyscale-safe, for the report |

---

## Phase 8 — Cleanup and verification

The phase that decides whether the redesign is actually done.

| Task | Detail |
|---|---|
| Delete replaced code | Old components, dead CSS, orphaned imports, unused tokens |
| Bundle measurement | **Entry must be ≤ 343 kB / 109 kB gzip.** Route splitting from the last phase makes this achievable; verify rather than assume |
| Dead CSS audit | Confirm no `--sev-critical` or old `--chart-N` references remain in data views |
| Full verification | `tsc` 0 · `vitest` green (≥ current 135) · `pytest` 17 · `prettier --check` clean · `npm run build` 0 |
| Browser pass | Every page, both themes, all breakpoints, keyboard-only |
| Doc update | Bring [HANDOFF.md](HANDOFF.md) and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) in line with what shipped |

---

## Sequencing, honestly

| Phases | Character | Risk |
|---|---|---|
| 0–2 | Infrastructure, no behaviour change | Low. Revertible individually |
| 3 | Chart primitives | **Highest technical risk.** If the catalogue does not cover the data, this is where it surfaces |
| 4 | First real pages | **Highest design risk.** This is the phase that proves or disproves the system |
| 5–6 | Repetition | Low. Pattern-proven |
| 7 | Craft | Low, but easy to under-invest in |
| 8 | Cleanup | Low risk, high value. Skipping it is how redesigns calcify |

**Two genuine risks, stated rather than hidden:**

1. **Phase 3 may find the catalogue is incomplete.** Sankey and force graph both
   need derived links. If the derivations prove unwieldy, drop those two charts —
   they are the only two in the catalogue that require inventing structure. Do
   not stretch the backend to serve them; that violates the constraint.
2. **Phase 4 is where "premium" becomes real or does not.** Four pages is a
   real test; sixteen pages built on a pattern that does not work is sixteen
   pages to redo. It is better to build Overview, review it honestly, and adjust
   the system before propagating it.

## Work that is not in this roadmap

Two items from the audit are real but separate, and are deliberately not bundled
into a redesign:

- **`critical` severity and five anomaly classes are never emitted** (Finding A).
  This is a backend detector question, not a frontend question. The design
  handles it honestly rather than hiding it, but deciding whether the detector
  *should* emit those classes is a model decision.
- **No DOM under test.** `vitest` runs in `environment: 'node'`, so component
  behaviour is unprotected. Setting up jsdom + RTL would normally come first;
  here it should land in Phase 1, because the Inspector, the severity tag and the
  scope selects are exactly the logic that regressed in the last round.