import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Gauge, LineChart as LineChartIcon } from 'lucide-react'
import clsx from 'clsx'
import {
  models as modelsApi,
  predictions as predictionsApi,
  type Model,
  type ModelMetrics,
  type PredictResult,
  type PredictionPoint,
} from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, ensureRun } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, Button } from '../lib/kit'
import { beatForStage } from '../lib/story'
import {
  Bar, EmptyState, LoadingState, MetricPill, Panel, SectionLabel, StageHeader,
  Stat, StatusChip, StoryFlow,
} from '../lib/stagekit'

const HORIZONS = [24, 48, 72, 168]
const TRAIN_ALGO = 'gradient_boosting'

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function stamp(ts?: string | null, withDate = true): string {
  if (!ts) return '—'
  const s = String(ts)
  return withDate ? s.slice(5, 16).replace('T', ' ') : s.slice(11, 16)
}

/** `confidence` is a 0–1 model score; tolerate a 0–100 payload. */
function confPct(confidence?: number | null): number {
  const c = num(confidence)
  if (c === null) return 0
  return Math.min(100, Math.max(0, Math.abs(c) > 1 ? c : c * 100))
}

/* ── Forecast timeline: pure React/SVG, no chart library ───────── */
const VW = 900
const VH = 300
const PAD = { l: 54, r: 16, t: 16, b: 36 }

function ForecastChart({ points }: { points: PredictionPoint[] }) {
  const n = points.length
  const vals: number[] = []
  for (const p of points) {
    for (const v of [p.lower, p.predicted, p.upper, p.actual]) {
      const x = num(v)
      if (x !== null) vals.push(x)
    }
  }
  if (n < 2 || vals.length < 2) return null

  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi === lo) { const mid = hi; lo = mid - 1; hi = mid + 1 }
  const pad = (hi - lo) * 0.12
  lo -= pad
  hi += pad

  const plotW = VW - PAD.l - PAD.r
  const plotH = VH - PAD.t - PAD.b
  const X = (i: number) => PAD.l + (i / (n - 1)) * plotW
  const Y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * plotH
  const path = (get: (p: PredictionPoint) => number) =>
    points
      .map((p, i) => {
        const v = num(get(p))
        return v === null ? '' : `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`
      })
      .filter(Boolean)
      .join(' ')
  const band = `${path(p => p.upper)} ${points
    .map((p, i) => ({ i, v: num(p.lower) }))
    .filter(d => d.v !== null)
    .reverse()
    .map(d => `L${X(d.i).toFixed(1)},${Y(d.v as number).toFixed(1)}`)
    .join(' ')} Z`

  const step = plotW / (n - 1)
  const ticks = [0, 1, 2, 3, 4].map(k => lo + ((hi - lo) * k) / 4)
  const mid = points[Math.floor(n / 2)]

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label="Forecast timeline with confidence band"
    >
      {/* gridlines + y axis */}
      {ticks.map((t, k) => (
        <g key={k}>
          <line x1={PAD.l} x2={VW - PAD.r} y1={Y(t)} y2={Y(t)} stroke="var(--color-border)" strokeWidth={1} />
          <text x={PAD.l - 8} y={Y(t) + 3} textAnchor="end" className="fill-current font-mono text-[9px] text-t-lo">
            {fmt(t, t < 10 ? 1 : 0)}
          </text>
        </g>
      ))}

      {/* confidence band */}
      <path d={band} fill="rgba(76,95,213,0.14)" stroke="none" />
      <path d={path(p => p.upper)} fill="none" stroke="rgba(76,95,213,0.5)" strokeWidth={1} strokeDasharray="4 4" />
      <path d={path(p => p.lower)} fill="none" stroke="rgba(76,95,213,0.5)" strokeWidth={1} strokeDasharray="4 4" />

      {/* predicted line */}
      <path d={path(p => p.predicted)} fill="none" stroke="#4C5FD5" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

      {/* actuals */}
      {points.map((p, i) => {
        const a = num(p.actual)
        if (a === null) return null
        return <circle key={`a${i}`} cx={X(i)} cy={Y(a)} r={2.5} fill="var(--color-accent-emerald)" />
      })}

      {/* predicted markers + hover targets */}
      {points.map((p, i) => {
        const v = num(p.predicted)
        if (v === null) return null
        const x = X(i)
        return (
          <g key={`p${i}`}>
            <circle cx={x} cy={Y(v)} r={1.8} fill="#4C5FD5" />
            <rect
              x={Math.max(PAD.l, Math.min(x - step / 2, VW - PAD.r - step))}
              y={PAD.t}
              width={step}
              height={plotH}
              fill="transparent"
            >
              <title>{`${p.timestamp}  ·  predicted ${fmt(v, 3)} kWh  ·  range ${fmt(p.lower, 3)}–${fmt(p.upper, 3)}  ·  confidence ${fmt(confPct(p.confidence), 0)}%`}</title>
            </rect>
          </g>
        )
      })}

      {/* x axis labels */}
      <text x={PAD.l} y={VH - 10} textAnchor="start" className="fill-current font-mono text-[9px] text-t-lo">
        {stamp(points[0]?.timestamp)}
      </text>
      <text x={(PAD.l + VW - PAD.r) / 2} y={VH - 10} textAnchor="middle" className="fill-current font-mono text-[9px] text-t-lo">
        {stamp(mid?.timestamp)}
      </text>
      <text x={VW - PAD.r} y={VH - 10} textAnchor="end" className="fill-current font-mono text-[9px] text-t-lo">
        {stamp(points[n - 1]?.timestamp)}
      </text>
    </svg>
  )
}

function MetricGrid({ metrics }: { metrics: ModelMetrics }) {
  const cells: { k: string; label: string; value: string; accent?: 'emerald' | 'amber' | 'primary' }[] = [
    { k: 'r2', label: 'R²', value: fmt(metrics.r2, 4), accent: 'emerald' },
    { k: 'rmse', label: 'RMSE', value: `${fmt(metrics.rmse, 3)} kWh`, accent: 'primary' },
    { k: 'mae', label: 'MAE', value: `${fmt(metrics.mae, 4)} kWh` },
    { k: 'mape', label: 'MAPE', value: `${fmt(metrics.mape, 2)}%`, accent: 'amber' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map(c => (
        <Stat key={c.k} label={c.label} value={c.value} hint="model fit" accent={c.accent} mono />
      ))}
    </div>
  )
}

export function PredictionPage() {
  const params = useRouteParams()
  const datasetId = params.datasetId
  const navigate = useNavigate()
  const { markCompleted, setActive, mode } = useJourney()
  const journeyRunId = useJourney(s => s.runId)
  const beat = beatForStage('prediction')

  const mdl = useApi<{ models: Model[] }>(() => modelsApi.list(), [])
  const [modelId, setModelId] = useState<string | null>(null)
  const [horizon, setHorizon] = useState(48)
  const [res, setRes] = useState<PredictResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [training, setTraining] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const autoRan = useRef(false)

  const candidates = useMemo<Model[]>(() => {
    const all = mdl.data?.models || []
    const mine = all.filter(m => m.dataset_id === datasetId)
    return mine.length ? mine : all
  }, [mdl.data, datasetId])

  const selected = useMemo(
    () => candidates.find(m => m.id === modelId) || null,
    [candidates, modelId],
  )

  useEffect(() => {
    if (modelId && candidates.some(m => m.id === modelId)) return
    const best =
      candidates.find(m => m.is_active) ||
      [...candidates].sort((a, b) => (num(b.metrics?.r2) ?? 0) - (num(a.metrics?.r2) ?? 0))[0]
    setModelId(best?.id ?? null)
  }, [candidates, modelId])

  useEffect(() => { if (datasetId) setActive(datasetId, runId || journeyRunId || undefined) }, [datasetId, runId, journeyRunId, setActive])

  const points = useMemo(() => res?.predictions || [], [res])
  const hs = res?.horizon_summary
  const metrics = res?.metrics
  const withActual = useMemo(() => points.filter(p => num(p.actual) !== null), [points])

  async function trainModel() {
    if (!datasetId || training) return
    setTraining(true)
    setError(null)
    setNote(null)
    try {
      const r = await modelsApi.train({ dataset_id: datasetId, algorithm: TRAIN_ALGO, use_processed: true })
      const m = r.model
      if (m?.id) setModelId(m.id)
      setNote(`trained ${m?.algorithm || TRAIN_ALGO} v${m?.version || 1} · ${fmt(m?.training_rows, 0)} rows · r² ${fmt(m?.metrics?.r2, 4)}`)
      await mdl.refetch()
    } catch (e: any) {
      setError(`training failed — ${e?.message || 'unknown error'}`)
    } finally {
      setTraining(false)
    }
  }

  async function runForecast() {
    if (!datasetId || !modelId || busy) return
    setBusy(true)
    setError(null)
    setProgress(0)
    const iv = window.setInterval(() => setProgress(p => Math.min(100, p + 1.8)), 40)
    try {
      const r = await predictionsApi.run({ dataset_id: datasetId, model_id: modelId, horizon, use_processed: true })
      window.clearInterval(iv)
      setRes(r)
      setProgress(100)
      markCompleted('prediction')
      const rid = runId || journeyRunId || (await ensureRun(datasetId))
      setRunId(rid)
      setActive(datasetId, rid, modelId)
    } catch (e: any) {
      window.clearInterval(iv)
      setProgress(0)
      setError(`forecast failed — ${e?.message || 'unknown error'}`)
    } finally {
      window.clearInterval(iv)
      setBusy(false)
    }
  }

  /* Auto mode: produce the forecast once a model is available. */
  useEffect(() => {
    if (mode !== 'auto' || !datasetId || !modelId || busy || res || autoRan.current) return
    autoRan.current = true
    void runForecast()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, datasetId, modelId, busy, res])

  const headerRight = (
    <>
      {busy ? <StatusChip status="running">forecasting</StatusChip>
        : res ? <StatusChip status="ok">{points.length} points</StatusChip>
          : <StatusChip status="idle">no forecast</StatusChip>}
      <select
        value={modelId || ''}
        onChange={e => setModelId(e.target.value || null)}
        disabled={busy || candidates.length === 0}
        aria-label="Select model"
        className="max-w-[220px] rounded-button border border-border bg-panel2 px-2.5 py-1.5 text-xs text-t-hi outline-none focus:border-primary-500 disabled:opacity-50"
      >
        {candidates.length === 0 && <option value="">no model available</option>}
        {candidates.map(m => (
          <option key={m.id} value={m.id}>
            {`${m.name || m.algorithm} · ${m.algorithm} · r² ${fmt(m.metrics?.r2, 3)}`}
          </option>
        ))}
      </select>
      <select
        value={horizon}
        onChange={e => setHorizon(Number(e.target.value))}
        disabled={busy}
        aria-label="Forecast horizon"
        className="rounded-button border border-border bg-panel2 px-2.5 py-1.5 text-xs text-t-hi outline-none focus:border-primary-500 disabled:opacity-50"
      >
        {HORIZONS.map(h => <option key={h} value={h}>{h}h</option>)}
      </select>
      <Button onClick={runForecast} disabled={busy || !datasetId || !modelId} variant="primary" size="sm">
        <LineChartIcon className={clsx('h-4 w-4', busy && 'animate-pulse')} />
        {busy ? 'Forecasting…' : 'Run forecast'}
      </Button>
    </>
  )

  if (!datasetId) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        <StageHeader
          beat={beat.beat} chapter={beat.chapter}
          title="Prediction Engine"
          tagline="Trained models, live forecast timeline and confidence intervals."
          icon={<Gauge className="h-5 w-5" />}
        />
        <EmptyState
          title="No dataset selected"
          hint="Forecasting runs against a registered dataset. Pick one from the library to continue."
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
        title="Prediction Engine"
        tagline="Real trained metrics, a live forecast horizon and the confidence interval behind every point."
        icon={<Gauge className="h-5 w-5" />}
        right={headerRight}
      />

      {busy && (
        <div className="shrink-0 rounded-card border border-border bg-panel px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>live progress</SectionLabel>
            <span className="font-mono text-[10px] text-t-lo">{Math.round(progress)}% · requesting {horizon}h horizon</span>
          </div>
          <Bar value={progress} className="mt-1.5" />
        </div>
      )}

      {error && (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-card border border-accent-rose/30 bg-accent-rose/10 px-3 py-2">
          <p className="truncate text-xs text-accent-rose">{error}</p>
          <Button onClick={runForecast} variant="outline" size="xs">Retry</Button>
        </div>
      )}

      {note && (
        <div className="shrink-0 rounded-card border border-border bg-panel2 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>training log</SectionLabel>
            <span className="font-mono text-[10px] text-t-lo">{training ? 'running…' : 'complete'}</span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-t-mid">
            <span className="text-primary-500">›</span> {note}
          </p>
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Horizon total" value={hs ? `${fmt(hs.total_kwh, 1)} kWh` : '—'} hint={`${horizon}h requested`} accent="emerald" mono />
        <Stat label="Peak" value={hs ? `${fmt(hs.peak_kw, 2)} kW` : '—'} hint={hs?.peak_time ? stamp(hs.peak_time) : 'awaiting run'} accent="amber" mono />
        <Stat label="Average" value={hs ? `${fmt(hs.avg_kw, 2)} kW` : '—'} hint="across the horizon" mono />
        <Stat label="CO₂ estimate" value={hs ? `${fmt(hs.co2_estimate_kg, 1)} kg` : '—'} hint="0.5 kg / kWh" accent="cyan" mono />
        <Stat label="Cost estimate" value={hs ? `$${fmt(hs.cost_estimate, 2)}` : '—'} hint="$0.28 / kWh" mono />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
        {/* ── Forecast timeline ──────────────────────────────── */}
        <Panel
          className="xl:col-span-8"
          title="forecast timeline"
          right={
            <div className="flex items-center gap-2">
              {res?.forecast_start && (
                <span className="font-mono text-[10px] text-t-lo">
                  {stamp(res.forecast_start)} → {stamp(res.forecast_end)}
                </span>
              )}
            </div>
          }
        >
          {mdl.loading && <LoadingState label="Loading models…" />}
          {!mdl.loading && candidates.length === 0 && (
            <EmptyState
              title="Train a model first"
              hint={`No trained model exists for this dataset. Train a ${TRAIN_ALGO} regressor on the processed frame to unlock the forecast.`}
              action={
                <Button onClick={trainModel} disabled={training} variant="primary" size="sm">
                  {training ? 'Training…' : `Train ${TRAIN_ALGO}`}
                </Button>
              }
            />
          )}
          {!mdl.loading && candidates.length > 0 && points.length === 0 && (
            <EmptyState
              title="No forecast yet"
              hint="Select a model and horizon, then run the forecast to plot the horizon with its confidence interval."
              action={<Button onClick={runForecast} disabled={busy} variant="primary" size="sm">Run forecast</Button>}
            />
          )}
          {points.length > 0 && (
            <motion.div
              key={`${modelId}-${horizon}-${points.length}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
              className="flex h-full min-h-[240px] flex-col gap-2"
            >
              <div className="min-h-0 flex-1">
                <ForecastChart points={points} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <SectionLabel>confidence axis · per point</SectionLabel>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-[9px] text-t-lo">
                      <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-primary-500)' }} /> predicted
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[9px] text-t-lo">
                      <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent-emerald)' }} /> actual
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[9px] text-t-lo">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: 'rgba(76,95,213,0.25)' }} /> interval
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-[2px] overflow-hidden">
                  {points.map((p, i) => (
                    <Bar
                      key={`c${i}`}
                      value={confPct(p.confidence)}
                      tone="violet"
                      className="min-w-[3px] flex-1"
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </Panel>

        <div className="grid min-h-0 gap-3 xl:col-span-4 xl:grid-rows-2">
          {/* ── Historical vs predicted ──────────────────────── */}
          <Panel title="historical vs predicted" right={<SectionLabel>fit</SectionLabel>}>
            {mdl.loading && <LoadingState label="Reading metrics…" />}
            {!mdl.loading && !metrics && (
              <EmptyState title="No metrics yet" hint="Model fit metrics arrive with the forecast result." />
            )}
            {metrics && (
              <div className="flex flex-col gap-3">
                <MetricGrid metrics={metrics} />
                <div className="flex flex-col gap-1.5 rounded-button border border-border bg-panel2 px-2.5 py-2">
                  <SectionLabel>target variance split</SectionLabel>
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 font-mono text-[10px] text-t-lo">explained</span>
                    <Bar value={Math.max(0, Math.min(100, (num(metrics.r2) ?? 0) * 100))} tone="emerald" className="flex-1" />
                    <span className="w-12 shrink-0 text-right font-mono text-[10px] font-semibold text-accent-emerald">
                      {fmt((num(metrics.r2) ?? 0) * 100, 1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 font-mono text-[10px] text-t-lo">residual</span>
                    <Bar value={Math.max(0, Math.min(100, (1 - (num(metrics.r2) ?? 0)) * 100))} tone="rose" className="flex-1" />
                    <span className="w-12 shrink-0 text-right font-mono text-[10px] font-semibold text-accent-rose">
                      {fmt((1 - (num(metrics.r2) ?? 0)) * 100, 1)}%
                    </span>
                  </div>
                </div>
                {selected && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetricPill label="model" value={selected.name || selected.algorithm} />
                    <MetricPill label="algo" value={selected.algorithm} />
                    <MetricPill label="rows" value={fmt(selected.training_rows, 0)} />
                    <MetricPill label="active" value={selected.is_active ? 'yes' : 'no'} />
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* ── Actual vs predicted deltas ───────────────────── */}
          <Panel
            title="actual vs predicted"
            right={<SectionLabel>{withActual.length} of {points.length} with actuals</SectionLabel>}
          >
            {points.length === 0 ? (
              <EmptyState title="Awaiting a forecast" hint="Point-level deltas appear once a forecast has run." />
            ) : withActual.length === 0 ? (
              <div className="flex flex-col gap-2">
                <EmptyState
                  title="No actuals recorded"
                  hint="The predict endpoint returns actual: null for every horizon point, so per-point deltas cannot be computed until actuals are backfilled."
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <MetricPill label="points" value={points.length} />
                  <MetricPill label="interval ±" value={fmt((num(points[0]?.upper) ?? 0) - (num(points[0]?.predicted) ?? 0), 2)} />
                  <MetricPill label="confidence" value={`${fmt(confPct(points[0]?.confidence), 0)}%`} />
                </div>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">timestamp</th>
                      <th className="py-1.5 pr-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">actual</th>
                      <th className="py-1.5 pr-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">predicted</th>
                      <th className="py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withActual.slice(0, 12).map((p, i) => {
                      const a = num(p.actual) as number
                      const v = num(p.predicted) as number
                      const d = a - v
                      const tol = Math.max(0.05, 0.1 * Math.abs(v))
                      return (
                        <tr key={`${p.timestamp}-${i}`} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-2 font-mono text-t-lo">{stamp(p.timestamp, false)}</td>
                          <td className="py-1.5 pr-2 text-right font-mono text-t-hi">{fmt(a, 2)}</td>
                          <td className="py-1.5 pr-2 text-right font-mono text-t-mid">{fmt(v, 2)}</td>
                          <td className={clsx('py-1.5 text-right font-mono font-semibold', Math.abs(d) <= tol ? 'text-accent-emerald' : 'text-accent-rose')}>
                            {d >= 0 ? '+' : ''}{fmt(d, 2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {withActual.length > 12 && (
                  <p className="mt-1.5 font-mono text-[10px] text-t-lo">+{withActual.length - 12} further points</p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="shrink-0">
        <StoryFlow
          stageKey="prediction"
          activeKey={busy || training ? 'processed' : res ? 'produced' : 'entered'}
        />
      </div>

      {res && runId && (
        <AutoNext to={`/confidence/${runId}`} label="Forecast complete — grading confidence" />
      )}
    </div>
  )
}

export default PredictionPage
