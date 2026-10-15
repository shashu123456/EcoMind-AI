# UI / UX work plan and handoff

Living document. Read this before touching the frontend. It records what is
verified, what is queued, and the traps that have already cost time.

Repo: `EcoMind-AI-main` · branch `main`
Frontend: `frontend/client/src` (React + Vite + Recharts) — the shell is one large
file, `components/shell/AppShell.tsx` (~6,700 lines), styles in
`components/shell/AppShell.css` (one rule per line, grouped by feature).
Backend: FastAPI, serves the built `frontend/dist` at **http://127.0.0.1:8000**.

---

## 0. How to run and verify

```bash
# backend (must be running; serves the built frontend)
cd backend && python -m uvicorn app.main:app --port 8000

# frontend checks — all three must pass before claiming done
cd frontend && pnpm check          # tsc --noEmit
cd frontend && pnpm build:static   # vite build -> ../dist  (the backend serves this)
cd .. && python -m pytest -q       # 158 tests
```

**`preview_resize` reloads the browser tab and resets the app to Mission
control.** Always re-navigate after a resize or your measurements will be taken
on the wrong view. Take a fresh snapshot/screenshot after any interruption.

**After editing any frontend file you must rebuild** (`pnpm build:static`) — the
dev server is not in use, so a refresh without a rebuild serves stale code.

Sign-in persists in `localStorage.ecomind_token`. The seeded account shows as
"Admin User".

---

## 1. Verified complete (do not redo)

### Shell layout (viewport-locked)
`.eco-app` is `height: 100vh/100dvh; overflow: hidden`; `.app-main` is the single
scroll container; the sidebar is `height: 100%` with a working internal nav
scroll. Previously the document scrolled and the sidebar stretched to the full
page height (measured **2081px in a 1000px viewport**) with `overflow: hidden`.
`goTo()` now scrolls `#main-content`, not `window` — `window.scrollTo` moves
nothing in this layout.

### Context strip / run controls
Split into `.context-strip__meta` (scrolls sideways) and `.pipeline-quick`
(pinned, never clipped). The strip is `position: sticky`. Run/Step/Stop/New run
are always on screen; Previous/Next hide below 1040px. Values are capped at
230px with ellipsis.

### Responsive clipping
Top-line rows (`.quality-topline`, `.prediction-topline`, `.models-topline`,
`.anomaly-topline`) wrap below 1180px and `.models-layout` goes single-column
below 1080px — content between 881–1180px used to be clipped and unreachable.

### Dead CSS removed
A superseded `.schema-flow` block sat _before_ the live definitions, so its
`@media (max-width: 980px)` collapse rule was silently dead. Also removed dead
`.flow-packet`, `@keyframes packet-travel`, `.schema-flow__rows`,
`.schema-flow-row*` and a `.anomaly-chart--split .anomaly-chart` rule that
matched nothing.

### Auth
One token probe on boot (`authChecked` gates every workspace loader) so a stale
token costs exactly one 401 — verified by forcing a bad token. A **Sign out**
button was added to the profile popover.

### Anomaly chart (verified by measurement)
- **The whole series was compressed into 25% of the plot.** Cause: four `<Line>`
  children were passed `data={severitySeries}` while the chart also had its own
  `data`, so Recharts counted the window four extra times in the category axis.
  Data span went from **108px → 440px** of a 447px plot (99% coverage).
- The focus panel was **721px tall inside a 320px `overflow: hidden` box** — two
  thirds of it, including the AI and provenance sections, was invisible. The
  split variant now sets `height: auto; overflow: visible`, the plot gets its own
  `.anomaly-chart__plot` box, and the panel scrolls internally.
- Each severity band is drawn as a real line through the readings the stage
  classified into it (`high` 82 / `medium` 40 / `low` 53 points), all sharing the
  chart's single data array.
- **A fabricated threshold was removed.** The old rail was
  `baselineMax * 1.2` labelled `threshold +120%`, and the basis panel printed the
  normalised score as `+0.6% over baseline`. Severity is defined in **sigma**
  against each device's own learned MAD scale, so no single kWh value is "the
  threshold". The rail is now the empirical lowest flagged reading, and the basis
  panel states the real rule: `a reading enters the queue at 6.0σ (score 0.60)`
  plus `critical ≥ 9σ · high ≥ 7.5σ · medium ≥ 6σ`.
- Click **pins** a reading (`pinned ?? hover ?? most-severe`), with an Unpin
  control, a vertical rule marking the pinned moment, and `onMouseLeave` clearing
  the preview. Previously the parent's pinned selection was ignored entirely, so
  the panel always snapped back to the cursor.

---

## 2. Trap: the severity vocabulary

The stage names its bands `critical / high / moderate / low`. **Every frontend
surface says `medium`, not `moderate`.** `normaliseSeverity()` in
`lib/workspace.ts` is the single translation point; the points arriving from the
API carry `medium`. Reading the raw stage word anywhere else matches nothing and
fails silently — that mistake was made once already and reverted.

`LiveAnomalyMeta.severity` holds **raw backend keys**, so it can contain
`moderate` while the points say `medium`. Fold anything read from it through
`normaliseSeverity` before comparing.

Other things to check before reaching for "the vocabulary is wrong":
- `lib/workspace.ts` mappers normalise aggressively. Read them first.
- Backend band authority: `backend/app/domain/anomaly_service.py`
  (`SEVERITY_BANDS`, `_severity`), `sigma_floor_for_detection`.

---

## 3. Queued work, in the order the user asked for it

Each item is deliberately described by outcome, not by edit. Verify with the
protocol in §0 and re-measure — do not claim a visual fix without numbers.

### 3.1 Every graph must explain itself
The anomaly chart now has a `.anomaly-chart-basis` block (what it shows, axes,
source, detection rule, bands). **Extend this pattern to the prediction chart and
any other Recharts surface**: what is plotted, on which axis, in what unit, from
which stage, over what window. Also state honestly when a series is empty and
why.

Open problem: the anomaly chart is hourly, so 1008 points over a ~450px column
reads as a barcode. Consider downsampling above a points-per-pixel threshold, or
defaulting to the 7d/30d window instead of 60d.

### 3.2 Transformation — show the data in the green evidence blocks
`TransformView` evidence cells (`.transform-evidence--changed`) only show the
shell of the change. When a dataset behaves normally, the block should still show
the recorded values, not hide them. Hiding an empty-but-real measurement is worse
than showing it.

### 3.3 Schema discovery — rebuild the flow visual
"Schema discovery" / `.schema-flow` currently reads as static boxes and lines and
does not convey how EcoMind reads the data. Rebuild it as an animated, legible
pipeline: recorded column → inferred role/family → storage operation, with motion
that communicates direction and arrival. The existing `.schema-flow-chip`
`chip-in` / `chip-pulse` animations are a starting vocabulary. Respect
`prefers-reduced-motion` (already handled for `.flow-line--live`).

### 3.4 Data quality — deepen the middle terminal
The centre "fixing" panel (`.repair-console` / `quality-panel--ai`) is the
weakest surface on the page. It should explain, per issue: the rule that fired,
the evidence (offsets, sample values), the proposed repair, why it preserves the
source, and the blast radius. Three-terminal layout stays three terminals; the
ask is depth and refinement, not restructuring.

### 3.5 Model competition — make the run feel alive
Replace the static bar/line chart with a live competition: contenders racing on
the metric that actually decides the winner, with progressive metric reveal as
the stage runs. Must reflect recorded values only — no invented progress.

### 3.6 Sign-in page — refine and polish
Treat as its own design problem. Current state is functional but plain.

### 3.7 Import page — the "active dataset" card is unexplained
Users cannot tell what the loaded active dataset is for or why it is shown beside
the dropzone. Either give it a clear role (context for what an upload will
supersede) or remove it and put the information where it is actionable.

### 3.8 Blank halves and excessive scrolling
Wherever a two-column layout leaves one side visually empty, or a view requires
scrolling a long way to reach the point, restructure: tabs, disclosure, denser
grouping, or moving the decisive content above the fold. Audit with the overflow
scan in §0 rather than by eye.

---

## 4. Reusable audit snippets

Run in the page via `preview_evaluate`. Overflow detector, all views:

```js
const clips = el => { let p = el.parentElement; while (p && p !== document.body) { if (getComputedStyle(p).overflowX !== 'visible') return true; p = p.parentElement; } return false; };
const items = [...document.querySelectorAll('.nav-item')];
for (let i = 0; i < items.length; i++) {
  [...document.querySelectorAll('.nav-item')][i].click();
  await new Promise(r => setTimeout(r, 400));
  const shell = document.querySelector('.view-shell');
  const off = [];
  shell.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if ((r.right > innerWidth + 1 || r.left < -1) && !clips(el)) off.push(el.className);
  });
  console.log(items[i].textContent.trim().replace(/\d+$/, ''), { off: [...new Set(off)], clipped: shell.scrollWidth - shell.clientWidth });
}
```

Chart coverage check (catches compression — expect ~99%):

```js
const c = document.querySelector('.anomaly-chart');
const svg = c.querySelector('.recharts-surface').getBoundingClientRect();
const g = c.querySelector('.recharts-cartesian-grid').getBoundingClientRect();
const xs = [...c.querySelectorAll('circle')].map(d => +d.getAttribute('cx')).filter(Number.isFinite);
const left = g.left - svg.left, right = g.right - svg.left;
`coverage ${Math.round((Math.max(...xs) - Math.min(...xs)) / (right - left) * 100)}%`
```

Known-good baseline (1600px viewport, 60d window): coverage **99%**, observed
1008 dots, high 82 / medium 40 / low 53, panel `clipped: false`.

---

## 5. Conventions that matter

- Dark-first palette via CSS custom properties (`--eco-*`); light theme is
  `.eco-app--light`. **Never hardcode a background colour into a chart** — the
  prediction confidence band currently paints `#132119` beneath itself, which is
  wrong in light mode. Use `var(--eco-panel)` / `var(--eco-ink)`.
- Numbers in charts are `tabular-nums`. Units come from `lib/units.ts`.
- Copy states what was recorded and by which stage. No invented thresholds, no
  fabricated progress. If the backend did not record it, say so.
- Charts must never use per-series `data` props alongside chart-level `data`
  (see §1) — put every series on one array.
