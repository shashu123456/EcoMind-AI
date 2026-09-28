import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { BarChart3, Check, Minus, Trophy } from 'lucide-react'
import {
  benchmarks,
  type BenchmarkList,
} from '../lib/api'
import { useApi } from '../lib/hooks'
import { fmt, n, useRouteParams } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { beatForStage } from '../lib/story'
import {
  Bar,
  EmptyState,
  LoadingState,
  MetricPill,
  Panel,
  SectionLabel,
  StageHeader,
  Stat,
  StatusChip,
  StoryFlow,
} from '../lib/stagekit'
import { AutoNext, Button, downloadCSV } from '../lib/kit'

/* ── Model leaderboard arena ──────────────────────────────────────────
   Beat 10 · Benchmarking. A sortable ranked table, a three-way podium
   and a run history — all straight off the benchmark API.           */

type LbRow = {
  name?: string
  model_id?: string | null
  algorithm?: string
  scores?: Record<string, number> | null
  total_score?: number
  rank?: number
  error?: string
}

type BenchRow = {
  id?: string
  dataset_id?: string
  created_at?: string | null
  methodology?: string
  model_count?: number
  best_model_id?: string | null
  metrics?: Record<string, number>
  name?: string
  description?: string
  model_ids?: string[] | null
  metrics_compared?: string[] | null
  results?: Record<string, unknown> | null
  winner?: string | null
}

type BenchListPayload = BenchmarkList & { leaderboard?: LbRow[] | null }

type RunPayload = {
  benchmark: BenchRow | null
  leaderboard: LbRow[] | null
  winner: string | LbRow | null
  elapsed_ms?: number
}

const METRIC_ORDER = ['r2', 'explained_variance', 'rmse', 'mae', 'mape']
const HIGHER_BETTER = new Set(['r2', 'explained_variance'])
const PODIUM_TONE = ['bg-primary-500/85', 'bg-accent-cyan/75', 'bg-accent-violet/65']
const MEDAL_TONE = ['bg-accent-gold', 'bg-gray-400', 'bg-accent-amber']

function algLabel(a?: string | null): string {
  const s = (a || '').toLowerCase()
  if (s.includes('ridge') || s.includes('linear')) return 'ridge · linear baseline'
  if (s.includes('xgb')) return 'xgboost · trees'
  if (s.includes('random_forest') || s.includes('forest')) return 'random forest'
  if (s.includes('grad')) return 'gradient boosting'
  return a || 'model'
}

function modelCount(b: BenchRow): number {
  const declared = n(b.model_count)
  if (declared !== null) return declared
  if (Array.isArray(b.model_ids) && b.model_ids.length) return b.model_ids.length
  return Object.keys(b.results ?? {}).length
}

/** stored runs record `best_model_id`; older payloads carry `winner`. */
function winnerOf(b: BenchRow | null | undefined): string | null {
  if (!b) return null
  return b.best_model_id || b.winner || null
}

function isUuid(v: string | null | undefined): boolean {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function Running({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-panel2 px-3 py-2">
      <StatusChip status="running">{label}</StatusChip>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel3">
        <motion.span
          className="absolute inset-y-0 w-1/3 rounded-full bg-primary-500"
          initial={{ x: '-130%' }}
          animate={{ x: ['-130%', '330%'] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

export function BenchmarkingPage() {
  const { datasetId } = useRouteParams()
  const { setActive, markCompleted } = useJourney()

  const res = useApi<BenchListPayload>(
    () => (datasetId
      ? benchmarks.list(datasetId)
      : Promise.resolve({ benchmarks: [] })),
    [datasetId],
  )

  const [live, setLive] = useState<LbRow[] | null>(null)
  const [run, setRun] = useState<RunPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'rank', dir: 1 })
  const [picked, setPicked] = useState<string | null>(null)

  const bench = res.data
  const runs: BenchRow[] = useMemo(() => bench?.benchmarks ?? [], [bench])
  const rows: LbRow[] = useMemo(() => {
    if (live && live.length) return live
    return Array.isArray(bench?.leaderboard) ? bench.leaderboard : []
  }, [live, bench])

  const metrics = useMemo(() => {
    const seen = new Set<string>()
    rows.forEach(r => Object.keys(r.scores ?? {}).forEach(k => seen.add(k)))
    const rest = Array.from(seen).filter(k => !METRIC_ORDER.includes(k)).sort()
    return [...METRIC_ORDER.filter(k => seen.has(k)), ...rest]
  }, [rows])

  const bounds = useMemo(() => {
    const out: Record<string, { lo: number; hi: number }> = {}
    metrics.forEach(m => {
      const vals = rows
        .map(r => n(r.scores?.[m]))
        .filter((v): v is number => v !== null)
      out[m] = vals.length ? { lo: Math.min(...vals), hi: Math.max(...vals) } : { lo: 0, hi: 1 }
    })
    return out
  }, [metrics, rows])

  /** best-in-column = 100 %, worst = 0 % — mirrors the server-side scoring. */
  const norm = (metric: string, value: number | null): number => {
    if (value === null) return 0
    const b = bounds[metric]
    if (!b || b.hi - b.lo < 1e-9) return 100
    const t = HIGHER_BETTER.has(metric) ? (value - b.lo) / (b.hi - b.lo) : (b.hi - value) / (b.hi - b.lo)
    return Math.max(0, Math.min(1, t)) * 100
  }

  const byRank = useMemo(
    () => [...rows].sort((a, b) => (n(a.rank) ?? 99) - (n(b.rank) ?? 99)),
    [rows],
  )
  const podium = byRank.slice(0, 3)

  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      let d = 0
      if (sort.key === 'name') d = String(a.name ?? '').localeCompare(String(b.name ?? ''))
      else if (sort.key === 'status') d = (a.error ? 1 : 0) - (b.error ? 1 : 0)
      else if (sort.key === 'total') d = (n(a.total_score) ?? 0) - (n(b.total_score) ?? 0)
      else if (sort.key === 'rank') d = (n(a.rank) ?? 99) - (n(b.rank) ?? 99)
      else d = (n(a.scores?.[sort.key]) ?? 0) - (n(b.scores?.[sort.key]) ?? 0)
      return d * sort.dir
    })
    return arr
  }, [rows, sort])

  const latest = run?.benchmark ?? runs[0] ?? null
  const methodology = latest?.methodology || 'time_series_split'
  const runDate = latest?.created_at ? latest.created_at.slice(0, 10) : null
  const compared = Array.isArray(latest?.metrics_compared) && latest.metrics_compared.length
    ? latest.metrics_compared
    : metrics

  const winnerId = useMemo(() => {
    const w = run?.winner
    if (w && typeof w === 'object') return (w as LbRow).name ?? (w as LbRow).model_id ?? null
    if (typeof w === 'string') return w
    const top = byRank[0]
    if (top?.name || top?.model_id) return top.name ?? top.model_id ?? null
    return winnerOf(latest)
  }, [run, byRank, latest])

  const winnerRow = useMemo(
    () => byRank.find(r => r.name === winnerId || r.model_id === winnerId) ?? byRank[0] ?? null,
    [byRank, winnerId],
  )
  const winnerName = winnerRow?.name ?? winnerId ?? '—'
  const winnerHint = winnerRow
    ? `${fmt(n(winnerRow.total_score) ?? 0, 1)} pts · rank ${fmt(n(winnerRow.rank) ?? 1, 0)}`
    : winnerId
      ? isUuid(winnerId)
        ? `registered model ${winnerId.slice(0, 8)}`
        : winnerId
      : 'run a benchmark to crown a winner'

  const selected = useMemo(
    () => byRank.find(r => (r.name ?? r.model_id) === picked) ?? winnerRow,
    [byRank, picked, winnerRow],
  )

  async function execute() {
    if (!datasetId || busy) return
    setBusy(true)
    setError(null)
    try {
      const resp = await benchmarks.run(datasetId, {})
      setRun(resp as unknown as RunPayload)
      if (Array.isArray(resp?.leaderboard) && resp.leaderboard.length) {
        setLive(resp.leaderboard as unknown as LbRow[])
        setSort({ key: 'rank', dir: 1 })
        setPicked(null)
      }
      await res.refetch()
      markCompleted('benchmarking')
      setActive(datasetId)
    } catch (e: any) {
      setError(e?.message || 'benchmark run failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (rows.length && datasetId) {
      markCompleted('benchmarking')
      setActive(datasetId)
    }
  }, [rows.length, datasetId, markCompleted, setActive])

  const beat = beatForStage('benchmarking')
  const loading = res.loading && !res.data
  const activeStep = busy ? 'processed' : rows.length ? 'produced' : 'entered'
  const hasHistory = runs.length > 1

  function head(label: string, key: string, extra?: string) {
    const on = sort.key === key
    return (
      <button
        type="button"
        onClick={() =>
          setSort(s => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))
        }
        className={clsx('flex items-center gap-1 text-left', extra)}
        title={`Sort by ${label}`}
      >
        <span
          className={clsx(
            'truncate text-[10px] font-semibold uppercase tracking-[0.12em]',
            on ? 'text-primary-500' : 'text-t-lo',
          )}
        >
          {label}
        </span>
        <span className={clsx('font-mono text-[9px]', on ? 'text-primary-500' : 'text-t-lo opacity-50')}>
          {on ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
        </span>
      </button>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={beat.beat}
        chapter="Benchmarking"
        title="Model leaderboard arena"
        tagline="Every contender trained on identical features and the same chronological split — so the ranking measures model skill, not dataset luck."
        icon={<BarChart3 className="h-5 w-5 text-accent-amber" />}
        right={
          <>
            {rows.length > 0 ? (
              <StatusChip status="ok">{fmt(rows.length, 0)} ranked</StatusChip>
            ) : null}
            <Button
              size="sm"
              onClick={execute}
              disabled={busy}
              aria-busy={busy}
              className="whitespace-nowrap"
            >
              <Trophy className="h-4 w-4" />
              {busy ? 'Ranking…' : 'Run benchmark'}
            </Button>
          </>
        }
      />

      {/* ── top strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Models benchmarked"
          value={fmt(rows.length || n(latest?.model_count) || 0, 0)}
          hint={
            rows.length
              ? `across ${fmt(podium.length, 0)} podium slots`
              : latest
                ? 'in the latest stored run'
                : 'no run yet'
          }
        />
        <Stat
          label="Winner"
          value={<span className="block truncate">{winnerName}</span>}
          hint={winnerHint}
          accent="emerald"
        />
        <Stat
          label="Methodology"
          value={<span className="block truncate">{methodology.replace(/_/g, ' ')}</span>}
          hint={`${fmt(compared.length, 0)} metrics compared`}
          mono
        />
        <Stat
          label="Run date"
          value={<span className="block truncate">{runDate ?? '—'}</span>}
          hint={
            run?.elapsed_ms != null
              ? `${fmt(run.elapsed_ms, 0)} ms · last run`
              : latest
                ? 'latest stored run'
                : 'no benchmark stored'
          }
          mono
        />
      </div>

      {busy && <Running label="scoring contenders" />}
      {!busy && error && <StatusChip status="warn">{error}</StatusChip>}

      {loading && <LoadingState label="Loading leaderboard…" />}

      {!loading && !rows.length && !run && (
        <EmptyState
          title={runs.length ? 'Stored runs, no ranked leaderboard' : 'No benchmark results yet'}
          hint={
            runs.length
              ? `${fmt(runs.length, 0)} benchmark run${runs.length === 1 ? '' : 's'} stored for this dataset — run one to rebuild the ranked leaderboard below.`
              : 'Run a benchmark to train every contender on the same split and rank them head-to-head.'
          }
          action={
            <Button size="sm" onClick={execute} disabled={busy}>
              <Trophy className="h-4 w-4" /> Run benchmark
            </Button>
          }
        />
      )}

      {(rows.length > 0 || runs.length > 0) && (
        <>
          {/* ── enterprise leaderboard ─────────────────────────── */}
          {rows.length > 0 && (
            <Panel
              title="Enterprise leaderboard"
              right={
                <button
                  type="button"
                  onClick={() => exportLeaderboard(rows, metrics)}
                  className="rounded-button border border-border bg-panel2 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-mid transition-colors hover:bg-panel3 hover:text-t-hi"
                  title="Download leaderboard as CSV"
                >
                  export csv
                </button>
              }
              flush
            >
              <div className="overflow-x-auto">
                <div className="min-w-[52rem]">
                  <div
                    className="grid gap-3 border-b border-border px-4 py-2"
                    style={{ gridTemplateColumns: gridCols(metrics.length) }}
                  >
                    {head('rank', 'rank')}
                    {head('model', 'name')}
                    <SectionLabel>algorithm</SectionLabel>
                    {metrics.map(m => head(m, m))}
                    {head('total', 'total', 'justify-end text-right')}
                    {head('state', 'status', 'justify-end text-right')}
                  </div>
  
                  {sorted.map((r, i) => {
                    const rank = n(r.rank) ?? i + 1
                    const total = n(r.total_score) ?? 0
                    const won = rank === 1
                    const on = (selected?.name ?? selected?.model_id) === (r.name ?? r.model_id)
                    return (
                      <button
                        key={r.name ?? r.model_id ?? i}
                        type="button"
                        onClick={() => setPicked(r.name ?? r.model_id ?? null)}
                        className={clsx(
                          'grid w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0',
                          won
                            ? 'border-l-2 border-l-accent-emerald bg-accent-emerald/[0.06]'
                            : 'border-l-2 border-l-transparent',
                          on ? 'bg-primary-500/[0.05]' : 'hover:bg-panel2',
                        )}
                        style={{ gridTemplateColumns: gridCols(metrics.length) }}
                      >
                        <span className="flex items-center gap-1.5">
                          {rank <= 3 ? (
                            <span
                              className={clsx('h-2 w-2 shrink-0 rounded-full', MEDAL_TONE[rank - 1])}
                              aria-hidden
                            />
                          ) : null}
                          <span className="font-mono text-[11px] text-t-mid">{fmt(rank, 0)}</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-t-hi">
                            {r.name ?? r.model_id ?? `Model ${rank}`}
                          </span>
                          {won && <Check className="h-3.5 w-3.5 shrink-0 text-accent-emerald" />}
                        </span>
                        <span className="block min-w-0 truncate rounded-button border border-border bg-panel2 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                          {algLabel(r.algorithm)}
                        </span>
                        {metrics.map(m => {
                          const v = n(r.scores?.[m])
                          return (
                            <span key={m} className="min-w-0">
                              <span className="block font-mono text-[11px] text-t-mid">
                                {v === null ? '—' : fmt(v, 3)}
                              </span>
                              <Bar
                                value={norm(m, v)}
                                className="mt-1"
                                tone={won ? 'emerald' : 'primary'}
                              />
                            </span>
                          )
                        })}
                        <span
                          className={clsx(
                            'text-right font-mono text-sm font-semibold',
                            won ? 'text-accent-emerald' : 'text-t-hi',
                          )}
                        >
                          {fmt(total, 1)}
                        </span>
                        <span className="flex justify-end">
                          {r.error ? (
                            <span
                              title={r.error}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent-rose/30 bg-accent-rose/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-rose"
                            >
                              failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-panel2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                              <Check className="h-3 w-3" /> scored
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
  
                  <div className="border-t border-border bg-panel2 px-4 py-2">
                    <p className="font-mono text-[10px] leading-4 text-t-lo">
                      total_score = Σ norm(metric) × 25 · max 100 pts · r2 / explained_variance higher
                      is better → norm = (v − worst)/(best − worst) · rmse / mae / mape lower is better →
                      norm = (worst − v)/(worst − best) · bars are normalised per column, the number is
                      the raw metric
                    </p>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* ── top-performance highlight ──────────────────────── */}
          {podium.length > 0 && metrics.length > 0 && (
            <Panel
              title="Top-performance comparison"
              right={
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {fmt(podium.length, 0)} contenders
                </span>
              }
            >
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                {metrics.map(m => (
                  <div key={m}>
                    <div className="flex items-baseline justify-between gap-2">
                      <SectionLabel>{m}</SectionLabel>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">
                        {HIGHER_BETTER.has(m) ? '↑ better' : '↓ better'}
                      </span>
                    </div>
                    <div className="relative mt-2 h-[68px]">
                      {podium.map((r, i) => {
                        const v = n(r.scores?.[m])
                        const rank = n(r.rank) ?? i + 1
                        return (
                      <div
                        key={r.name ?? i}
                        className="absolute inset-x-0 flex items-center gap-2"
                        style={{ top: i * 11, zIndex: podium.length - i }}
                      >
                        <span className="w-4 shrink-0 font-mono text-[9px] text-t-lo">
                          {fmt(rank, 0)}
                        </span>
                        <span className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-panel3">
                              <motion.span
                                initial={{ width: 0 }}
                                animate={{ width: `${norm(m, v)}%` }}
                                transition={{ duration: 0.55, delay: i * 0.07, ease: 'easeOut' }}
                                className={clsx('absolute inset-y-0 left-0 rounded-full', PODIUM_TONE[i])}
                              />
                            </span>
                            <span className="w-14 shrink-0 text-right font-mono text-[10px] text-t-mid">
                              {v === null ? '—' : fmt(v, 3)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {podium.map((r, i) => (
                        <span
                          key={r.name ?? i}
                          className="inline-flex items-center gap-1 text-[10px] text-t-lo"
                        >
                          <span
                            className={clsx('h-1.5 w-1.5 rounded-full', PODIUM_TONE[i])}
                            aria-hidden
                          />
                          {r.name ?? `rank ${i + 1}`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* ── best-model selection ───────────────────────────── */}
          {selected && (
            <Panel
              title="Best-model selection"
              right={
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {picked ? 'your pick' : 'auto · rank 1'}
                </span>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-t-hi">
                  {selected.name ?? selected.model_id ?? '—'}
                </span>
                <span className="rounded-button border border-border bg-panel2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {algLabel(selected.algorithm)}
                </span>
                <MetricPill label="total" value={fmt(n(selected.total_score) ?? 0, 1)} accent="text-accent-emerald" />
                <MetricPill label="rank" value={fmt(n(selected.rank) ?? 1, 0)} />
                {selected.model_id && (
                  <MetricPill label="model id" value={selected.model_id.slice(0, 8)} />
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {metrics.map(m => {
                  const v = n(selected.scores?.[m])
                  return (
                    <MetricPill
                      key={m}
                      label={m}
                      value={v === null ? '—' : fmt(v, 3)}
                      accent={HIGHER_BETTER.has(m) ? 'text-accent-emerald' : 'text-accent-cyan'}
                    />
                  )
                })}
              </div>
              <p className="mt-3 flex items-start gap-2 rounded-button bg-panel2 px-3 py-2 text-[11px] text-t-lo">
                <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t-lo" />
                <span>
                  {isUuid(winnerOf(latest))
                    ? `Winner recorded as model ${winnerOf(latest)}. Promotion to the active registry entry happens on the next stage.`
                    : 'The leaderboard carries algorithm names, not model ids — promotion to the active registry entry happens on the next stage.'}
                </span>
              </p>
            </Panel>
          )}

          {/* ── historical comparison ──────────────────────────── */}
          <Panel
            title="Historical comparison"
            right={
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                {fmt(runs.length, 0)} stored run{runs.length === 1 ? '' : 's'}
              </span>
            }
            flush={hasHistory}
          >
            {hasHistory ? (
              <div className="overflow-x-auto">
                <div className="min-w-[40rem]">
                  <div className="grid grid-cols-[minmax(0,6rem)_minmax(0,6.5rem)_minmax(0,1fr)_4rem_minmax(0,9rem)] gap-3 border-b border-border px-4 py-2">
                    {['run', 'date', 'methodology', 'models', 'best model'].map(h => (
                      <SectionLabel key={h} className="truncate">
                        {h}
                      </SectionLabel>
                    ))}
                  </div>
                  {runs.map((b, i) => (
                    <div
                      key={b.id ?? i}
                      className={clsx(
                        'grid grid-cols-[minmax(0,6rem)_minmax(0,6.5rem)_minmax(0,1fr)_4rem_minmax(0,9rem)] items-center gap-3 border-b border-border px-4 py-2 last:border-0',
                        i === 0 && 'bg-primary-500/[0.05]',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {i === 0 && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500"
                            aria-hidden
                          />
                        )}
                        <span className="truncate font-mono text-[11px] text-t-mid">
                          {b.id ? b.id.slice(0, 8) : '—'}
                        </span>
                      </span>
                      <span className="truncate font-mono text-[11px] text-t-mid">
                        {b.created_at ? b.created_at.slice(0, 10) : '—'}
                      </span>
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                        {(b.methodology || 'time_series_split').replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-[11px] text-t-mid">
                        {fmt(modelCount(b), 0)}
                      </span>
                      <span className="truncate">
                        {winnerOf(b) ? (
                          <span
                            title={winnerOf(b) ?? undefined}
                            className="inline-flex max-w-full items-center gap-1 rounded-button border border-accent-emerald/30 bg-accent-emerald/10 px-2 py-0.5 font-mono text-[10px] text-accent-emerald"
                          >
                            <Trophy className="h-3 w-3 shrink-0" />
                            <span className="truncate">{winnerOf(b)}</span>
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-t-lo">no winner</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : runs[0] ? (
              <div className="rounded-card border border-border bg-panel2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SectionLabel>Baseline</SectionLabel>
                  <StatusChip status="idle">single run</StatusChip>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] text-t-mid">
                  <span>{runs[0].id ? runs[0].id.slice(0, 8) : '—'}</span>
                  <span>{runs[0].created_at ? runs[0].created_at.slice(0, 10) : '—'}</span>
                  <span>{(runs[0].methodology || 'time_series_split').replace(/_/g, ' ')}</span>
                  <span>{fmt(modelCount(runs[0]), 0)} models</span>
                </div>
                {winnerOf(runs[0]) && (
                  <p className="mt-2 text-[11px] text-t-lo">
                    best model{' '}
                    <span className="font-mono text-t-hi">{winnerOf(runs[0])}</span> — re-run the
                    benchmark after more models register to build a comparison.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-t-lo">
                No stored runs yet — the run above will be recorded against this dataset.
              </p>
            )}
          </Panel>
        </>
      )}

      <StoryFlow stageKey="benchmarking" activeKey={activeStep} />

      {rows.length > 0 && (
        <AutoNext
          to={datasetId ? `/recommendations/${datasetId}` : '/library'}
          label="Pipeline benchmarked — generating recommendations"
        />
      )}
    </div>
  )
}

function gridCols(metricCount: number): string {
  return [
    '3rem',
    'minmax(0,1.1fr)',
    'minmax(0,0.8fr)',
    ...Array.from({ length: metricCount }, () => 'minmax(0,0.85fr)'),
    '4.5rem',
    '5rem',
  ].join(' ')
}

function exportLeaderboard(rows: LbRow[], metrics: string[]) {
  const flat = rows.map(r => {
    const row: Record<string, unknown> = {
      rank: n(r.rank),
      name: r.name ?? r.model_id,
      algorithm: r.algorithm,
      total_score: n(r.total_score),
      status: r.error ? `failed: ${r.error}` : 'scored',
    }
    metrics.forEach(m => {
      row[m] = n(r.scores?.[m])
    })
    return row
  })
  downloadCSV(
    ['rank', 'name', 'algorithm', 'total_score', 'status', ...metrics],
    flat,
    'ecomind-benchmark-leaderboard.csv',
  )
}

export default BenchmarkingPage
