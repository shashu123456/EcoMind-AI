import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ChevronRight, GitBranch, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { datasets, features as featuresApi, type Feature, type PreviewPayload } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, Button, colLabel, normRows } from '../lib/kit'
import { beatForStage } from '../lib/story'
import {
  Bar, EmptyState, LoadingState, MetricPill, Panel, SectionLabel, StageHeader,
  StatusChip, Advanced, ResultSummary, Hero, Stat,
} from '../lib/stagekit'

/* ── Author taxonomy ──────────────────────────────────────────────
   The backend writes `created_by = actor_id or "system"` (see
   feature_service.engineer), and the DB column defaults to "engineer"
   — so machine-authored rows arrive as system / engineer, never the
   literal "auto". Treat the whole machine set as auto.              */
const AUTO_AUTHORS = new Set(['auto', 'system', 'engineer', 'automated', 'pipeline'])

function isAutoAuthor(a?: string | null): boolean {
  return AUTO_AUTHORS.has(String(a || '').toLowerCase())
}

function authorLabel(f: Feature): string {
  return isAutoAuthor(f.created_by) ? 'auto' : (f.created_by || 'user')
}

/** importance_score is 0–1 from the API; normalise so bars read 0–100. */
function impPct(f: Feature): number {
  const v = Number(f?.importance_score)
  if (!Number.isFinite(v)) return 0
  const n = Math.abs(v)
  return n > 1 ? Math.min(100, n) : n * 100
}

function shortId(id?: string | null): string {
  return String(id || '—').slice(0, 8)
}

function shortName(name: string, len = 7): string {
  return name.length > len ? `${name.slice(0, len - 1)}…` : name
}

/* ── Correlation explorer maths ─────────────────────────────────── */
const MAX_COLS = 12
const MAX_ROWS = 200
const INK = '76, 95, 213' // primary-500

interface Series { name: string; values: number[] }

/** First ≤12 numeric preview columns, ≤200 rows, parsed to finite numbers. */
function numericSeries(payload: PreviewPayload | null): Series[] {
  if (!payload || !payload.columns?.length) return []
  const matrix = normRows((payload.rows as any[]) || [], payload.columns)
  const out: Series[] = []
  for (let ci = 0; ci < payload.columns.length && out.length < MAX_COLS; ci++) {
    const meta = payload.columns[ci]
    const name = colLabel(meta)
    if (!name) continue
    const dtype = String((typeof meta === 'string' ? '' : meta?.data_type) || '').toLowerCase()
    if (!/int|float|double|decimal|number/.test(dtype)) continue
    const values: number[] = []
    const limit = Math.min(matrix.length, MAX_ROWS)
    for (let r = 0; r < limit; r++) {
      const raw = matrix[r]?.[ci]
      const v = typeof raw === 'number' ? raw : Number(raw)
      values.push(Number.isFinite(v) ? v : NaN)
    }
    const valid = values.filter(v => Number.isFinite(v))
    if (valid.length < 4 || new Set(valid).size < 2) continue
    out.push({ name, values })
  }
  return out
}

function pearson(a: number[], b: number[]): number | null {
  let n = 0, sa = 0, sb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    n++; sa += x; sb += y
  }
  if (n < 3) return null
  const ma = sa / n, mb = sb / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const dx = x - ma, dy = y - mb
    num += dx * dy; da += dx * dx; db += dy * dy
  }
  const den = Math.sqrt(da * db)
  if (!den) return null
  return Math.max(-1, Math.min(1, num / den))
}

function cellBg(r: number | null): string | undefined {
  if (r === null) return undefined
  return `rgba(${INK}, ${(0.05 + 0.7 * Math.abs(r)).toFixed(3)})`
}

export function FeatureEngineeringPage() {
  const { datasetId } = useRouteParams()
  const navigate = useNavigate()
  const { markCompleted, setActive } = useJourney()
  const beat = beatForStage('feature_engineering')

  const emptyPreview = useMemo<PreviewPayload>(
    () => ({ columns: [], rows: [], total_rows: 0, row_count: 0, column_count: 0 }),
    [],
  )

  const feats = useApi<{ features: Feature[] }>(
    async () => (datasetId ? featuresApi.list(datasetId) : { features: [] }),
    [datasetId],
  )
  const preview = useApi<PreviewPayload>(
    async () => (datasetId ? datasets.preview(datasetId, MAX_ROWS, 0) : emptyPreview),
    [datasetId],
  )

  const [busy, setBusy] = useState(false)
  const [ran, setRan] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set())

  const featureList = useMemo(() => feats.data?.features || [], [feats.data])

  useEffect(() => { if (datasetId) setActive(datasetId) }, [datasetId, setActive])
  useEffect(() => {
    if (featureList.length) markCompleted('feature_engineering')
  }, [featureList, markCompleted])

  const isNew = (f: Feature) => newIds.has(f.id)

  async function runEngineer() {
    if (!datasetId || busy) return
    setBusy(true)
    setLog([])
    const before = new Set(featureList.map(f => f.id))
    try {
      const res = await featuresApi.engineer(datasetId, { auto: true })
      const incoming = res.features || []
      setNewIds(new Set(incoming.filter(f => !before.has(f.id)).map(f => f.id)))
      setLog(res.messages?.length ? res.messages : ['feature set already complete — no new features created'])
      setRan(true)
      await feats.refetch()
    } catch (e: any) {
      setLog([`engineer failed — ${e?.message || 'unknown error'}`])
    } finally {
      setBusy(false)
    }
  }

  /* ── derived ─────────────────────────────────────────────────── */
  const ranked = useMemo(
    () => [...featureList].sort((a, b) => impPct(b) - impPct(a) || a.name.localeCompare(b.name)),
    [featureList],
  )
  const autoCount = useMemo(() => featureList.filter(f => isAutoAuthor(f.created_by)).length, [featureList])
  const topFeature = ranked[0] || null
  const topPct = topFeature ? impPct(topFeature) : 0
  const byAuthor = useMemo(
    () => (autoCount === featureList.length && featureList.length > 0 ? 'auto' : 'user'),
    [autoCount, featureList.length],
  )
  const sources = useMemo(
    () => Array.from(new Set(featureList.flatMap(f => f.source_columns || []))).sort(),
    [featureList],
  )
  const types = useMemo(
    () => Array.from(new Set(featureList.map(f => f.feature_type || 'custom'))).sort(),
    [featureList],
  )

  const series = useMemo(() => numericSeries(preview.data), [preview.data])
  const corr = useMemo(() => {
    const m: (number | null)[][] = series.map(() => series.map(() => null))
    for (let i = 0; i < series.length; i++) {
      for (let j = i; j < series.length; j++) {
        const r = i === j ? 1 : pearson(series[i].values, series[j].values)
        m[i][j] = r
        m[j][i] = r
      }
    }
    return m
  }, [series])

  const headerRight = (
    <>
      {busy ? <StatusChip status="running">engineering</StatusChip>
        : featureList.length ? <StatusChip status="ok">{featureList.length} features</StatusChip>
          : <StatusChip status="idle">not run</StatusChip>}
      <Button onClick={runEngineer} disabled={busy || !datasetId} variant="primary" size="sm">
        <Sparkles className={clsx('h-4 w-4', busy && 'animate-pulse')} />
        {busy ? 'Engineering…' : featureList.length ? 'Re-run feature engineering' : 'Run feature engineering'}
      </Button>
    </>
  )

  if (!datasetId) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        <StageHeader
          beat={beat.beat} chapter={beat.chapter}
          title="Feature Engineering"
          tagline="Generated, explainable energy features — every one with a source column and a reason."
          icon={<GitBranch className="h-5 w-5" />}
        />
        <EmptyState
          title="No dataset selected"
          hint="Feature engineering derives from a registered dataset. Pick one from the library to continue."
          action={<Button onClick={() => navigate({ to: '/library' })} variant="primary" size="sm">Open dataset library</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={beat.beat}
        chapter={beat.chapter}
        title="Feature Engineering"
        tagline="Raw columns become explainable energy features — temporal rhythms, lags and rolling context."
        icon={<GitBranch className="h-5 w-5" />}
        right={headerRight}
      />

      {log.length > 0 && (
        <div className="shrink-0">
          <Advanced label="Engineer log" hint={`${log.length} message(s)`}>
          <ul className="space-y-0.5">
            {log.map((m, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: i * 0.05 }}
                className="truncate font-mono text-[11px] text-t-mid"
              >
                <span className="text-primary-500">›</span> {m}
              </motion.li>
            ))}
          </ul>
          </Advanced>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
        {/* ── Feature generation flow ─────────────────────────── */}
        <Hero className="xl:col-span-7">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <SectionLabel>Feature generation flow</SectionLabel>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">{sources.length} source · {types.length} transform</span>
          </div>
          {feats.loading && <LoadingState label="Loading feature set…" />}
          {feats.error && (
            <EmptyState
              title="Could not load the feature set"
              hint={feats.error}
              action={<Button onClick={feats.refetch} variant="outline" size="sm">Retry</Button>}
            />
          )}
          {!feats.loading && !feats.error && featureList.length === 0 && (
            <EmptyState
              title="No features generated yet"
              hint="Run feature engineering to derive temporal, lag and rolling features from this dataset."
              action={<Button onClick={runEngineer} disabled={busy} variant="primary" size="sm">Run feature engineering</Button>}
            />
          )}
          {featureList.length > 0 && (
            <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
              <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                <SectionLabel>raw columns</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {sources.map(s => (
                    <span key={s} className="rounded-button border border-border bg-panel2 px-2 py-1 font-mono text-[10px] text-t-mid">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <ChevronRight className="mt-7 h-4 w-4 shrink-0 text-t-lo" />

              <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <SectionLabel>transformations</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {types.map(t => (
                    <span key={t} className="rounded-button border border-primary-500/30 bg-primary-500/[0.06] px-2 py-1 font-mono text-[10px] text-primary-500">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <ChevronRight className="mt-7 h-4 w-4 shrink-0 text-t-lo" />

              <div className="flex min-w-[300px] flex-[1.4] flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <SectionLabel>generated features</SectionLabel>
                  {newIds.size > 0 && <MetricPill label="new" value={newIds.size} accent="text-accent-emerald" />}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                  {ranked.slice(0, 12).map(f => {
                    const fresh = isNew(f) || isAutoAuthor(f.created_by)
                    return (
                      <div
                        key={f.id}
                        className={clsx(
                          'rounded-button border border-border bg-panel2 px-2.5 py-2',
                          fresh && 'border-l-2 border-l-accent-emerald',
                        )}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="truncate font-mono text-[11px] font-semibold text-t-hi" title={f.name}>{f.name}</span>
                          {fresh && <MetricPill label="new" value="✓" accent="text-accent-emerald" />}
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-t-lo" title={f.description}>{f.description || f.feature_type}</p>
                        <Bar value={impPct(f)} tone={fresh ? 'emerald' : 'primary'} className="mt-1.5" />
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">{f.feature_type}</span>
                          <span className="font-mono text-[10px] font-semibold text-primary-500">{fmt(impPct(f), 0)}%</span>
                        </div>
                      </div>
                    )
                  })}
                  {ranked.length > 12 && (
                    <div className="flex items-center rounded-button border border-dashed border-border px-2.5 py-2">
                      <span className="font-mono text-[10px] text-t-lo">+{ranked.length - 12} more in the ranked list</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </Hero>

        <div className="grid min-h-0 gap-3 xl:col-span-5 xl:grid-rows-2">
          {/* ── Importance preview ────────────────────────────── */}
          <details open className="rounded-card border border-border bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <SectionLabel>Importance preview</SectionLabel>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">ranked · {ranked.length}</span>
            </summary>
            <div className="p-4">
            {ranked.length === 0 ? (
              <EmptyState title="Nothing to rank" hint="Importance is scored once features exist." />
            ) : (
              <div className="space-y-1.5">
                {ranked.map((f, i) => {
                  const pct = impPct(f)
                  const fresh = isNew(f) || isAutoAuthor(f.created_by)
                  return (
                    <motion.div
                      key={f.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.03 }}
                      className={clsx(
                        'rounded-button border border-border bg-panel2 px-2.5 py-1.5',
                        fresh && 'border-l-2 border-l-accent-emerald',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 font-mono text-[10px] text-t-lo">{String(i + 1).padStart(2, '0')}</span>
                          <span className="truncate text-xs font-medium text-t-hi">{f.name}</span>
                          <span className="shrink-0 rounded-full border border-border bg-panel3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">
                            {f.feature_type || 'custom'}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-xs font-semibold text-primary-500">{fmt(pct, 1)}%</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Bar value={pct} tone="primary" className="flex-1" />
                        <span className="shrink-0 font-mono text-[9px] text-t-lo" title={f.id}>{shortId(f.id)}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div></details>

          {/* ── Correlation explorer ─────────────────────────── */}
          <details className="rounded-card border border-border bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <SectionLabel>Correlation explorer</SectionLabel>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">{series.length}×{series.length} pearson</span>
            </summary>
            <div className="p-4">
            {preview.loading && <LoadingState label="Profiling preview columns…" />}
            {!preview.loading && series.length < 2 && (
              <EmptyState
                title="Not enough numeric columns"
                hint="The correlation explorer needs at least two numeric preview columns with real variance. Re-run feature engineering or import a wider dataset."
              />
            )}
            {series.length >= 2 && (
              <div className="flex flex-col gap-2">
                <div className="overflow-auto">
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `minmax(64px, 88px) repeat(${series.length}, minmax(15px, 1fr))` }}
                  >
                    <div />
                    {series.map(s => (
                      <div key={`h-${s.name}`} className="truncate text-center font-mono text-[9px] text-t-lo" title={s.name}>
                        {shortName(s.name)}
                      </div>
                    ))}
                    {series.map((row, i) => (
                      <FragmentRow key={row.name} row={row} matrix={corr} all={series} index={i} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[9px] text-t-lo">|r| 0.0</span>
                  {[0, 1, 2, 3, 4, 5].map(k => (
                    <span key={k} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `rgba(${INK}, ${(0.05 + 0.14 * k).toFixed(2)})` }} />
                  ))}
                  <span className="font-mono text-[9px] text-t-lo">1.0</span>
                  <span className="ml-auto font-mono text-[9px] text-t-lo">
                    {Math.min(series[0]?.values.length ?? 0, MAX_ROWS)} sampled rows · diagonal = self
                  </span>
                </div>
              </div>
            )}
          </div></details>
        </div>
      </div>

      <ResultSummary
        verdict={
          featureList.length === 0
            ? 'Run feature engineering: raw columns become explainable energy features — temporal rhythms, lags and rolling context.'
            : `${featureList.length} features generated (${autoCount} auto) — "${topFeature?.name ?? '—'}" carries the most signal at ${fmt(topPct, 1)}% importance.`
        }
        facts={[
          { label: 'Features', value: featureList.length },
          { label: 'Top importance', value: `${fmt(topPct, 1)}%` },
          { label: 'Sources', value: sources.length },
        ]}
      />

      {ran && featureList.length > 0 && datasetId && (
        <AutoNext
          to={`/prediction/${datasetId}`}
          label="Features engineered — running the prediction engine"
        />
      )}
    </div>
  )
}

/** One correlation row: label + n cells. Diagonal is a recessed well. */
function FragmentRow({
  row, matrix, all, index,
}: {
  row: Series
  matrix: (number | null)[][]
  all: Series[]
  index: number
}) {
  return (
    <>
      <div className="truncate font-mono text-[9px] text-t-lo" title={row.name}>{shortName(row.name)}</div>
      {all.map((col, j) => {
        const r = matrix[index]?.[j] ?? null
        const self = index === j
        return (
          <div
            key={`${row.name}-${col.name}`}
            title={`${row.name} ↔ ${col.name}  r=${r === null ? 'n/a' : (r >= 0 ? '+' : '') + r.toFixed(2)}`}
            className={clsx('aspect-square rounded-[2px]', self && 'bg-panel3')}
            style={self ? undefined : { background: cellBg(r) }}
          />
        )
      })}
    </>
  )
}

export default FeatureEngineeringPage
