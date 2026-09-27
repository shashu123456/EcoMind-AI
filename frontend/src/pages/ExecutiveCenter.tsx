import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle, BarChart3, Crown, FileText, Layers, Presentation,
  RefreshCw, ShieldCheck, Sparkles, Trophy,
} from 'lucide-react'
import {
  ai, benchmarks, datasets, models, recommendations, workflows,
  type Model, type RunDetail,
} from '../lib/api'
import { useApi } from '../lib/hooks'
import { fmt, n, useRouteParams } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { beatForStage } from '../lib/story'
import {
  Bar, EmptyState, LoadingState, MetricPill, Panel, SectionLabel, StageHeader,
  Stat, StatusChip, StoryFlow,
} from '../lib/stagekit'
import { AutoNext, Button } from '../lib/kit'
import { cn } from '../lib/cn'

/* ── Executive briefing desk · Beat 12 · Executive Intelligence ─────────
   /executive carries NO route param, so the page resolves its own working
   dataset (see `resolveDataset` below) and then reads six real endpoints:
   ai.executive, ai.timeline, models.list, recommendations.list,
   benchmarks.list and datasets.list.

   ai.executive is typed `{summary: any}` and the backend builds the payload
   in backend/app/domain/executive_service.py::summary(), so every field is
   read through `normalizeSummary` — headline, trust/{verdict,trust_score,
   gate}, dq_score, best_model/{name,r2,metrics}, anomaly_summary/
   {total,by_type}, recommendations[], total_savings_kwh/_percent,
   top_recommendation, shap_drivers[], totals/{forecast_kwh,co2_kg,cost},
   leaderboard{} and pipeline/{completed,total_stages,status}. Nothing here
   is invented: every tile traces back to one of those keys or to one of the
   list endpoints.                                                      */

const STAGE_KEY = 'executive_center'
const BEAT = beatForStage(STAGE_KEY)

/* ── defensive readers ───────────────────────────────────────────────── */
function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function txt(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}
function pairs(v: unknown): Array<[string, number]> {
  return Object.entries(rec(v))
    .map(([k, x]) => [k, n(x)] as [string, number | null])
    .filter((e): e is [string, number] => e[1] !== null)
}
function words(v: unknown, cap = 6): string[] {
  const out: string[] = []
  for (const x of arr(v)) {
    const s = txt(x).trim()
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= cap) break
  }
  return out
}
function titleize(s: string): string {
  return s.replace(/[_-]+/g, ' ').trim()
}
function shortId(v: string): string {
  return v ? v.slice(0, 8) : '—'
}
function clockText(v: string): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v.slice(0, 16).replace('T', ' ')
  return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function pct(v: number | null): number {
  return v === null ? 0 : Math.max(0, Math.min(100, v))
}

/* ── normalised executive payload ────────────────────────────────────── */
type BarTone = 'primary' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet'

interface ExecGate {
  predictionConfidence: number | null
  dqScore: number | null
  modelRelevance: number | null
  shapStability: number | null
  factors: Array<[string, number]>
  weights: Array<[string, number]>
  missing: string[]
  explanation: string
  createdAt: string
}
interface ExecAction {
  title: string
  category: string
  priority: string
  savingsKwh: number | null
  savingsPct: number | null
  confidence: number | null
  status: string
}
interface BoardRow { id: string; metrics: Array<[string, number]> }
interface ExecSummary {
  headline: string
  trustScore: number | null
  verdict: string
  gate: ExecGate | null
  dqScore: number | null
  bestName: string
  bestR2: number | null
  bestMetrics: Array<[string, number]>
  anomalyTotal: number | null
  anomalyByType: Array<[string, number]>
  actions: ExecAction[]
  savingsKwh: number | null
  savingsPct: number | null
  topActionTitle: string
  drivers: string[]
  forecastKwh: number | null
  co2Kg: number | null
  cost: number | null
  board: BoardRow[]
  completed: number | null
  totalStages: number | null
  runStatus: string
}

const EMPTY_SUMMARY: ExecSummary = {
  headline: '', trustScore: null, verdict: '', gate: null, dqScore: null,
  bestName: '', bestR2: null, bestMetrics: [], anomalyTotal: null, anomalyByType: [],
  actions: [], savingsKwh: null, savingsPct: null, topActionTitle: '', drivers: [],
  forecastKwh: null, co2Kg: null, cost: null, board: [], completed: null,
  totalStages: null, runStatus: '',
}

function normalizeSummary(raw: unknown): ExecSummary {
  if (!raw || typeof raw !== 'object') return EMPTY_SUMMARY
  const s = rec(raw)
  const trust = rec(s.trust)
  const gateSrc = trust.gate != null ? trust.gate : s.gate
  const gateRec = gateSrc ? rec(gateSrc) : null
  const reasoning = gateRec ? rec(gateRec.reasoning) : null
  const best = rec(s.best_model)
  const anomaly = rec(s.anomaly_summary)
  const totals = rec(s.totals)
  const pipeline = rec(s.pipeline)
  const topRec = rec(s.top_recommendation)

  return {
    headline: txt(s.headline),
    trustScore: n(trust.trust_score) ?? n(s.trust_score),
    verdict: txt(trust.verdict) || txt(s.verdict),
    gate: gateRec
      ? {
          predictionConfidence: n(gateRec.prediction_confidence),
          dqScore: n(gateRec.dq_score),
          modelRelevance: n(gateRec.model_relevance),
          shapStability: n(gateRec.shap_stability),
          factors: pairs(gateRec.factors),
          weights: pairs(reasoning?.weights),
          missing: words(reasoning?.missing_factors, 6),
          explanation: txt(reasoning?.explanation),
          createdAt: txt(gateRec.created_at),
        }
      : null,
    dqScore: n(s.dq_score),
    bestName: txt(best.name) || txt(best.algorithm),
    bestR2: n(best.r2),
    bestMetrics: pairs(best.metrics),
    anomalyTotal: n(anomaly.total),
    anomalyByType: pairs(anomaly.by_type).sort((a, b) => b[1] - a[1]),
    actions: arr(s.recommendations).map(rawAction => {
      const a = rec(rawAction)
      return {
        title: txt(a.title) || 'Untitled action',
        category: titleize(txt(a.category)) || 'general',
        priority: titleize(txt(a.priority)) || 'low',
        savingsKwh: n(a.savings_kwh) ?? n(a.estimated_savings_kwh),
        savingsPct: n(a.savings_percent) ?? n(a.estimated_savings_percent),
        confidence: n(a.confidence),
        status: txt(a.status),
      }
    }),
    savingsKwh: n(s.total_savings_kwh),
    savingsPct: n(s.total_savings_percent),
    topActionTitle: txt(topRec.title),
    drivers: words(s.shap_drivers, 6),
    forecastKwh: n(totals.forecast_kwh),
    co2Kg: n(totals.co2_kg),
    cost: n(totals.cost),
    /* benchmarks.results → { model_id: { metric: value, rank } } */
    board: Object.entries(rec(s.leaderboard))
      .map(([id, v]) => ({ id, metrics: pairs(v) }))
      .filter(r => r.metrics.length > 0),
    completed: n(pipeline.completed),
    totalStages: n(pipeline.total_stages),
    runStatus: txt(pipeline.status),
  }
}

/* ── verdict / tone vocabulary ───────────────────────────────────────── */
function verdictLabel(verdict: string, score: number | null): string {
  const k = verdict.trim().toLowerCase()
  if (k === 'high_trust' || k === 'high trust') return 'high trust'
  if (k === 'moderate_trust' || k === 'moderate trust') return 'moderate trust'
  if (k === 'low_trust' || k === 'low trust') return 'low trust'
  if (k && k !== 'unknown') return titleize(k)
  return score === null ? 'no gate yet' : 'unrated'
}
function trustChip(score: number | null): 'ok' | 'warn' | 'idle' {
  if (score === null) return 'idle'
  return score >= 60 ? 'ok' : 'warn'
}
function trustTone(score: number | null): 'emerald' | 'amber' | 'rose' {
  if (score === null) return 'amber'
  return score >= 80 ? 'emerald' : score >= 60 ? 'amber' : 'rose'
}

const PRIORITY: Record<string, { label: string; chip: string; bar: BarTone }> = {
  critical: { label: 'Critical', chip: 'border-rose-500/30 bg-rose-500/[0.07] text-rose-500', bar: 'rose' },
  high: { label: 'High', chip: 'border-amber-500/30 bg-amber-500/[0.07] text-amber-500', bar: 'amber' },
  medium: { label: 'Medium', chip: 'border-accent-cyan/30 bg-accent-cyan/[0.06] text-accent-cyan', bar: 'cyan' },
  low: { label: 'Low', chip: 'border-border bg-panel2 text-t-lo', bar: 'primary' },
}
function prioOf(key: string) {
  return PRIORITY[key.trim().toLowerCase()] ?? PRIORITY.low
}

/* Trust formula as documented in backend/app/workflow/stages.py::TRUST_WEIGHTS;
   the live weights are read from gate.reasoning.weights when the API sends them. */
const FACTOR_ROWS: Array<{ key: string; label: string; weight: number }> = [
  { key: 'prediction_confidence', label: 'prediction confidence', weight: 0.4 },
  { key: 'dq_score', label: 'data quality', weight: 0.25 },
  { key: 'model_relevance', label: 'model relevance', weight: 0.2 },
  { key: 'shap_stability', label: 'SHAP stability', weight: 0.15 },
]

const TRACE_TONES: Record<string, { status: 'ok' | 'running' | 'warn' | 'idle'; label: string }> = {
  completed: { status: 'ok', label: 'completed' },
  complete: { status: 'ok', label: 'complete' },
  passed: { status: 'ok', label: 'passed' },
  success: { status: 'ok', label: 'success' },
  running: { status: 'running', label: 'running' },
  in_progress: { status: 'running', label: 'in progress' },
  started: { status: 'running', label: 'started' },
  active: { status: 'running', label: 'active' },
  failed: { status: 'warn', label: 'failed' },
  error: { status: 'warn', label: 'error' },
  skipped: { status: 'idle', label: 'skipped' },
  pending: { status: 'idle', label: 'pending' },
  queued: { status: 'idle', label: 'queued' },
}
function traceTone(status: string) {
  const k = status.trim().toLowerCase()
  return TRACE_TONES[k] ?? { status: 'idle' as const, label: k ? titleize(k) : 'unknown' }
}

const TIMELINE_CAP = 8

export function ExecutiveCenterPage() {
  const navigate = useNavigate()
  const route = useRouteParams()
  const { datasetId: journeyDs, runId: journeyRun, setActive, markCompleted } = useJourney()
  const [pick, setPick] = useState<string | null>(null)

  /* ── no-param context resolution ───────────────────────────────────── */
  const catalog = useApi(() => datasets.list(), [])
  const catalogItems = catalog.data?.datasets ?? []

  /* the journey always keeps datasetId + runId together, but a reopened or
     polled run can be the only handle we have — resolve it through the run. */
  const runDetail = useApi<RunDetail | null>(
    () => (journeyRun ? workflows.get(journeyRun) : Promise.resolve(null)),
    [journeyRun],
  )
  const runDatasetId = runDetail.data?.run?.dataset_id ?? ''

  const fallbackDatasetId = useMemo(() => {
    const sorted = [...catalogItems].sort(
      (a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''),
    )
    return sorted[0]?.id ?? ''
  }, [catalogItems])

  const datasetId = pick || route.datasetId || journeyDs || runDatasetId || fallbackDatasetId
  const dataset = useMemo(
    () => catalogItems.find(d => d.id === datasetId) ?? null,
    [catalogItems, datasetId],
  )
  const resolving = !datasetId && (catalog.loading || (Boolean(journeyRun) && runDetail.loading))

  /* ── the six reads this briefing is built from ─────────────────────── */
  const brief = useApi(
    () => (datasetId ? ai.executive(datasetId) : Promise.resolve({ summary: null })),
    [datasetId],
  )
  const timeline = useApi(
    () => (datasetId ? ai.timeline(datasetId) : Promise.resolve({ stages: [] })),
    [datasetId],
  )
  const modelList = useApi(
    () => (datasetId ? models.list() : Promise.resolve({ models: [] })),
    [datasetId],
  )
  const recList = useApi(
    () => (datasetId ? recommendations.list(datasetId) : Promise.resolve({ recommendations: [] })),
    [datasetId],
  )
  const benchList = useApi(
    () => (datasetId ? benchmarks.list(datasetId) : Promise.resolve({ benchmarks: [] })),
    [datasetId],
  )

  const summary = useMemo(() => normalizeSummary(brief.data?.summary), [brief.data])

  /* ── models on this dataset ────────────────────────────────────────── */
  const datasetModels = useMemo<Model[]>(() => {
    const all = modelList.data?.models ?? []
    if (!datasetId) return []
    return all.filter(m => !m.dataset_id || m.dataset_id === datasetId)
  }, [modelList.data, datasetId])

  const labelOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of datasetModels) map.set(m.id, m.name || m.algorithm || m.id.slice(0, 8))
    return (id: string) => map.get(id) ?? shortId(id)
  }, [datasetModels])

  const rankedModels = useMemo(
    () => [...datasetModels].sort((a, b) => (n(b.metrics?.r2) ?? -Infinity) - (n(a.metrics?.r2) ?? -Infinity)),
    [datasetModels],
  )

  /* ── benchmark standings (benchmarks.results + model names) ────────── */
  const standings = useMemo(() => {
    const metric = (row: BoardRow, key: string) => {
      const hit = row.metrics.find(([k]) => k === key)
      return hit ? hit[1] : null
    }
    return summary.board
      .map(row => ({
        id: row.id,
        label: labelOf(row.id),
        r2: metric(row, 'r2'),
        rmse: metric(row, 'rmse'),
        mae: metric(row, 'mae'),
        mape: metric(row, 'mape'),
        rank: metric(row, 'rank'),
      }))
      .sort((a, b) => {
        if (a.rank !== null && b.rank !== null) return a.rank - b.rank
        if (a.rank !== null) return -1
        if (b.rank !== null) return 1
        return (b.r2 ?? -Infinity) - (a.r2 ?? -Infinity)
      })
  }, [summary.board, labelOf])

  const latestBenchmark = useMemo(() => {
    const list = benchList.data?.benchmarks ?? []
    return [...list].sort(
      (a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''),
    )[0] ?? null
  }, [benchList.data])

  const winnerId = standings[0]?.id || latestBenchmark?.best_model_id || ''
  const winnerName = winnerId ? labelOf(winnerId) : ''

  /* ── action register (recommendations.list — full rows, not the top 3) */
  const actions = useMemo(() => {
    const list = recList.data?.recommendations ?? []
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return [...list].sort(
      (a, b) =>
        (order[a.priority] ?? 4) - (order[b.priority] ?? 4) ||
        (n(b.estimated_savings_kwh) ?? 0) - (n(a.estimated_savings_kwh) ?? 0),
    )
  }, [recList.data])

  const actionKwh = useMemo(
    () => actions.reduce((acc, r) => acc + (n(r.estimated_savings_kwh) ?? 0), 0),
    [actions],
  )
  const actionPct = useMemo(
    () => actions.reduce((acc, r) => acc + (n(r.estimated_savings_percent) ?? 0), 0),
    [actions],
  )
  const savingsKwh = summary.savingsKwh ?? actionKwh
  const savingsPct = summary.savingsPct ?? actionPct

  /* ── timeline of analysis (ai.timeline → stages: Trace[]) ─────────── */
  const stages = useMemo(
    () => arr(timeline.data?.stages).map((raw, i) => {
      const t = rec(raw)
      const ms = n(t.duration_ms) ?? 0
      const confidence = n(t.confidence)
      return {
        key: txt(t.id) || `trace-${i}`,
        index: n(t.stage_number) ?? i + 1,
        name: titleize(txt(t.stage_name)) || `stage ${i + 1}`,
        status: txt(t.status),
        decision: txt(t.decision),
        /* the API sends 0–1 for traces, 0–100 for gate factors */
        confidence: confidence === null ? null : confidence > 1 ? confidence : confidence * 100,
        ms,
        at: txt(t.completed_at) || txt(t.started_at),
      }
    }),
    [timeline.data],
  )
  const maxMs = useMemo(() => stages.reduce((a, s) => Math.max(a, s.ms), 0), [stages])
  const totalMs = useMemo(() => stages.reduce((a, s) => a + s.ms, 0), [stages])
  const stagesRun = stages.filter(s => s.ms > 0).length
  const visibleStages = stages.slice(0, TIMELINE_CAP)
  const hiddenStages = stages.length - visibleStages.length

  /* ── lifecycle ─────────────────────────────────────────────────────── */
  const hasBriefing =
    summary.headline !== '' ||
    summary.trustScore !== null ||
    summary.dqScore !== null ||
    (summary.anomalyTotal ?? 0) > 0 ||
    summary.actions.length > 0 ||
    stages.length > 0

  useEffect(() => {
    if (datasetId) setActive(datasetId)
    if (datasetId && hasBriefing) markCompleted(STAGE_KEY)
  }, [datasetId, hasBriefing, setActive, markCompleted])

  const briefLoading = brief.loading && !brief.data
  const supportingLoading =
    !datasetId ||
    (timeline.loading && !timeline.data) ||
    (modelList.loading && !modelList.data) ||
    (recList.loading && !recList.data)

  const completed = summary.completed ?? stages.length
  const totalStages = summary.totalStages ?? datasetModels.length
  const pipelinePct = totalStages ? pct(((completed ?? 0) / totalStages) * 100) : 0
  const gateFactors = summary.gate

  const hero = (
    <StageHeader
      beat={BEAT.beat}
      chapter={BEAT.chapter}
      title="Executive briefing"
      tagline="Everything the pipeline concluded on one screen — the verdict, the evidence, the exposure and the actions behind it."
      icon={<Presentation className="h-5 w-5 text-primary-500" />}
      right={
        <>
          {catalogItems.length > 1 && (
            <select
              value={datasetId}
              onChange={e => setPick(e.target.value)}
              aria-label="briefing dataset"
              className="max-w-[13rem] rounded-button border border-border bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-t-hi outline-none focus:border-primary-500/50"
            >
              {catalogItems.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          {hasBriefing
            ? <StatusChip status="ok">briefing assembled</StatusChip>
            : <StatusChip status="idle">nothing consolidated yet</StatusChip>}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void brief.refetch()
              void timeline.refetch()
              void modelList.refetch()
              void recList.refetch()
              void benchList.refetch()
            }}
            disabled={!datasetId || briefLoading}
            title="Re-read the executive summary, timeline and supporting records"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', briefLoading && 'animate-spin')} /> Refresh
          </Button>
        </>
      }
    />
  )

  if (!datasetId && !resolving) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        {hero}
        <EmptyState
          title="No dataset in context"
          hint="The executive briefing consolidates one dataset's DQ, trust, anomaly and recommendation records. Open the library to pick one, or run an analysis so the journey registers it."
          action={
            <Button size="sm" onClick={() => navigate({ to: '/library' })}>
              <Layers className="h-3.5 w-3.5" /> Open dataset library
            </Button>
          }
        />
        <div className="shrink-0">
          <StoryFlow stageKey={STAGE_KEY} activeKey="entered" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      {hero}

      {resolving && <LoadingState label="Resolving the dataset for this briefing…" />}

      {briefLoading && <LoadingState label="Consolidating the executive summary…" />}

      {!resolving && !briefLoading && brief.error && (
        <EmptyState
          title="The briefing endpoint did not answer"
          hint={brief.error}
          action={<Button size="sm" onClick={brief.refetch}>Retry</Button>}
        />
      )}

      {!resolving && !briefLoading && !brief.error && datasetId && !hasBriefing && (
        <EmptyState
          title="Nothing consolidated for this dataset yet"
          hint="The executive summary is built from the confidence gate, the DQ assessment, anomaly records and recommendations. Run those pipeline stages first and the briefing assembles itself."
          action={
            <Button size="sm" onClick={() => navigate({ to: '/dashboard' })}>
              <BarChart3 className="h-3.5 w-3.5" /> Open mission control
            </Button>
          }
        />
      )}

      {datasetId && hasBriefing && (
        <>
          {/* ── verdict hero ─────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-card border border-border bg-panel shadow-[0_1px_2px_rgba(20,28,48,.05),0_8px_24px_rgba(20,28,48,.07)]">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
                <div className="flex flex-wrap items-center gap-2">
                  <SectionLabel>the call</SectionLabel>
                  <StatusChip status={trustChip(summary.trustScore)}>
                    {verdictLabel(summary.verdict, summary.trustScore)}
                  </StatusChip>
                  {summary.runStatus && (
                    <span className="rounded-full border border-border bg-panel2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-t-lo">
                      run {summary.runStatus.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>

                <h2 className="mt-2.5 text-lg font-semibold leading-snug tracking-tight text-t-hi sm:text-xl">
                  {summary.headline || 'Energy intelligence briefing'}
                </h2>

                <p className="mt-1.5 text-[13px] leading-relaxed text-t-mid">
                  {[
                    summary.bestName
                      ? `${summary.bestName} leads the portfolio at R² ${fmt(summary.bestR2, 3)}`
                      : '',
                    rankedModels.length
                      ? `${fmt(rankedModels.length, 0)} model${rankedModels.length === 1 ? '' : 's'} registered on this dataset`
                      : '',
                    (summary.anomalyTotal ?? 0) > 0
                      ? `${fmt(summary.anomalyTotal, 0)} anomalies under watch`
                      : '',
                    savingsKwh !== null
                      ? `${fmt(savingsKwh, 0)} kWh of savings quantified`
                      : '',
                  ].filter(Boolean).join(' · ') || 'The pipeline produced no comparable figures for this dataset.'}
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <Bar value={pipelinePct} className="flex-1" tone={pipelinePct >= 100 ? 'emerald' : 'primary'} />
                  <span className="shrink-0 font-mono text-[11px] text-t-mid">
                    {fmt(completed ?? 0, 0)} / {fmt(totalStages ?? 0, 0)} stages
                  </span>
                </div>

                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-t-lo">
                  {dataset?.name || 'dataset'} · {shortId(datasetId)}
                  {journeyRun ? ` · run ${shortId(journeyRun)}` : ''}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4">
                <Stat
                  label="Trust score"
                  value={summary.trustScore === null ? '—' : fmt(summary.trustScore, 1)}
                  hint={verdictLabel(summary.verdict, summary.trustScore)}
                  accent="primary"
                  mono
                />
                <Stat
                  label="Data quality"
                  value={summary.dqScore === null ? '—' : fmt(summary.dqScore, 1)}
                  hint="latest DQ assessment"
                  accent="cyan"
                  mono
                />
                <Stat
                  label="Best model R²"
                  value={summary.bestR2 === null ? '—' : fmt(summary.bestR2, 3)}
                  hint={summary.bestName || 'no model on this dataset'}
                  accent="emerald"
                  mono
                />
                <Stat
                  label="Savings quantified"
                  value={savingsKwh === null ? '—' : fmt(savingsKwh, 0)}
                  hint={
                    savingsPct === null
                      ? `${fmt(actions.length, 0)} action${actions.length === 1 ? '' : 's'}`
                      : `${fmt(savingsPct, 1)}% across ${fmt(actions.length, 0)} action${actions.length === 1 ? '' : 's'}`
                  }
                  mono
                />
              </div>
            </div>
          </section>

          {/* ── briefing narrative + analysis timeline ───────────────── */}
          <div className="grid gap-3 xl:grid-cols-12">
            <Panel
              className="min-h-0 xl:col-span-7"
              title="briefing"
              right={
                <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                  ai.executive · {summary.actions.length} finding{summary.actions.length === 1 ? '' : 's'}
                </span>
              }
            >
              <div className="space-y-4">
                {/* 01 · what the pipeline produced */}
                {(summary.actions.length > 0 || summary.topActionTitle) && (
                  <section>
                    <SectionLabel>01 · what the pipeline produced</SectionLabel>
                    <div className="mt-2 space-y-1.5">
                      {summary.actions.map((a, i) => {
                        const prio = prioOf(a.priority)
                        return (
                          <div
                            key={`${a.title}-${i}`}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 pb-1.5 last:border-b-0"
                          >
                            <span
                              className={cn(
                                'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest',
                                prio.chip,
                              )}
                            >
                              {prio.label}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-t-hi" title={a.title}>
                              {a.title}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-t-mid">
                              {a.savingsKwh === null ? '—' : `${fmt(a.savingsKwh, 1)} kWh`}
                              {a.savingsPct === null ? '' : ` · ${fmt(a.savingsPct, 1)}%`}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-t-lo">
                              {a.category}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* 02 · what to watch */}
                {summary.anomalyByType.length > 0 && (
                  <section>
                    <SectionLabel>02 · what to watch</SectionLabel>
                    <div className="mt-2 space-y-1.5">
                      {summary.anomalyByType.map(([type, count]) => {
                        const top = Math.max(...summary.anomalyByType.map(([, c]) => c), 1)
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <span className="w-40 shrink-0 truncate text-[12px] text-t-mid" title={type}>
                              {titleize(type)}
                            </span>
                            <Bar value={count} max={top} className="flex-1" tone="rose" />
                            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-t-mid">
                              {fmt(count, 0)}
                            </span>
                          </div>
                        )
                      })}
                      <p className="font-mono text-[10px] text-t-lo">
                        {fmt(summary.anomalyTotal ?? 0, 0)} anomalies on record across{' '}
                        {fmt(summary.anomalyByType.length, 0)} pattern{summary.anomalyByType.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </section>
                )}

                {/* 03 · what drove the model */}
                <section>
                  <SectionLabel>03 · what drove the model</SectionLabel>
                  {summary.drivers.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {summary.drivers.map(d => (
                        <span
                          key={d}
                          title={d}
                          className="max-w-[14rem] truncate rounded-button border border-accent-cyan/30 bg-accent-cyan/[0.05] px-2 py-1 font-mono text-[10px] text-accent-cyan"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[12px] text-t-lo">
                      No SHAP drivers recorded — the explainability stage has not attributed this model yet.
                    </p>
                  )}
                </section>

                {/* 04 · what it is worth */}
                <section>
                  <SectionLabel>04 · what it is worth</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MetricPill label="forecast" value={summary.forecastKwh === null ? '—' : `${fmt(summary.forecastKwh, 1)} kWh`} />
                    <MetricPill label="co₂" value={summary.co2Kg === null ? '—' : `${fmt(summary.co2Kg, 1)} kg`} accent="text-emerald-600" />
                    <MetricPill label="cost" value={summary.cost === null ? '—' : fmt(summary.cost, 2)} accent="text-amber-600" />
                    <MetricPill label="savings" value={savingsKwh === null ? '—' : `${fmt(savingsKwh, 0)} kWh`} accent="text-primary-500" />
                  </div>
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-t-lo">
                    forecast, co₂ and cost are the model horizon totals; savings are the recommendation engine's
                    estimate for the same portfolio.
                  </p>
                </section>
              </div>
            </Panel>

            <Panel
              className="min-h-0 xl:col-span-5"
              title="analysis timeline"
              right={
                stages.length > 0 ? (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                    {fmt(stagesRun, 0)} timed · {fmt(totalMs, 0)} ms
                  </span>
                ) : undefined
              }
            >
              {stages.length === 0 ? (
                <p className="text-[12px] text-t-lo">
                  No stage traces recorded for this dataset yet — the timeline fills as the workflow advances.
                </p>
              ) : (
                <div className="space-y-1">
                  {visibleStages.map((s, i) => {
                    const tone = traceTone(s.status)
                    const last = i === visibleStages.length - 1 && hiddenStages === 0
                    return (
                      <div key={s.key} className="flex items-center gap-3">
                        <div className="relative flex w-5 shrink-0 justify-center self-stretch">
                          <span
                            className={cn('absolute inset-y-0 left-1/2 w-px -translate-x-1/2', last ? 'top-4' : 'top-0', 'bg-border')}
                            aria-hidden
                          />
                          <span
                            className={cn(
                              'relative z-10 mt-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-panel font-mono text-[9px]',
                              tone.status === 'ok' ? 'border-emerald-500/50 text-emerald-600'
                                : tone.status === 'running' ? 'border-primary-500/50 text-primary-500'
                                  : tone.status === 'warn' ? 'border-amber-500/50 text-amber-600'
                                    : 'border-border text-t-lo',
                            )}
                          >
                            {fmt(s.index, 0)}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1 pb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-mono text-[11px] font-semibold text-t-hi">{s.name}</span>
                            <StatusChip status={tone.status}>{tone.label}</StatusChip>
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-t-lo">{clockText(s.at)}</span>
                          </div>
                          {s.decision && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-t-lo" title={s.decision}>
                              {s.decision}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <Bar value={s.ms} max={maxMs || 1} className="flex-1" tone="primary" />
                            <span className="w-16 shrink-0 text-right font-mono text-[10px] text-t-mid">
                              {fmt(s.ms, 0)} ms
                            </span>
                            <span className="w-14 shrink-0 text-right font-mono text-[10px] text-t-lo">
                              {s.confidence === null ? 'conf —' : `conf ${fmt(s.confidence, 0)}%`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {hiddenStages > 0 && (
                    <p className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                      + {fmt(hiddenStages, 0)} earlier stage{hiddenStages === 1 ? '' : 's'} in the run record
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </div>

          {/* ── trust composition · standings · registered models ──────── */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel
              title="trust composition"
              right={
                <StatusChip status={trustChip(summary.trustScore)}>
                  {summary.trustScore === null ? 'no gate' : `${fmt(summary.trustScore, 1)} / 100`}
                </StatusChip>
              }
            >
              <div className="space-y-2.5">
                {FACTOR_ROWS.map(f => {
                  const value =
                    f.key === 'prediction_confidence' ? gateFactors?.predictionConfidence ?? null
                      : f.key === 'dq_score' ? gateFactors?.dqScore ?? null
                        : f.key === 'model_relevance' ? gateFactors?.modelRelevance ?? null
                          : gateFactors?.shapStability ?? null
                  const live = gateFactors?.factors.find(([k]) => k === f.key)?.[1] ?? value
                  const weight = gateFactors?.weights.find(([k]) => k === f.key)?.[1] ?? f.weight
                  return (
                    <div key={f.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] text-t-mid">{f.label}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-[10px] text-t-lo">w {fmt(weight * 100, 0)}%</span>
                          <span className={cn('font-mono text-[11px] font-semibold', live === null ? 'text-t-lo' : 'text-t-hi')}>
                            {live === null ? '—' : fmt(live, 1)}
                          </span>
                        </span>
                      </div>
                      <Bar
                        value={pct(live)}
                        className="h-1"
                        tone={live === null ? 'primary' : trustTone(summary.trustScore)}
                      />
                    </div>
                  )
                })}

                {gateFactors && gateFactors.missing.length > 0 && (
                  <p className="flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-amber-600">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                    not yet computed: {gateFactors.missing.map(titleize).join(', ')}
                  </p>
                )}

                {gateFactors?.explanation && (
                  <p className="border-t border-border pt-2 text-[12px] leading-relaxed text-t-lo">
                    {gateFactors.explanation}
                  </p>
                )}
                {gateFactors?.createdAt && (
                  <p className="font-mono text-[10px] text-t-lo">gate recorded {clockText(gateFactors.createdAt)}</p>
                )}
                {!gateFactors && (
                  <p className="text-[12px] text-t-lo">
                    The confidence gate has not been evaluated for this dataset — run the gate stage to score these factors.
                  </p>
                )}
              </div>
            </Panel>

            <Panel
              title="benchmark standings"
              right={
                <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                  {latestBenchmark
                    ? `${titleize(latestBenchmark.methodology || 'benchmark')} · ${fmt(latestBenchmark.model_count ?? 0, 0)} models`
                    : `${fmt(standings.length, 0)} scored`}
                </span>
              }
            >
              {standings.length === 0 ? (
                <p className="text-[12px] text-t-lo">
                  {latestBenchmark
                    ? 'A benchmark exists for this dataset but carries no per-model scores — the winner below is taken from the run record.'
                    : 'No benchmark has been run for this dataset yet.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {standings.slice(0, 5).map((row, i) => (
                    <div
                      key={row.id}
                      className={cn(
                        'rounded-button border px-2.5 py-1.5',
                        i === 0 ? 'border-primary-500/35 bg-primary-500/[0.05]' : 'border-border bg-panel2',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-4 shrink-0 font-mono text-[10px] text-t-lo">
                          {row.rank === null ? String(i + 1).padStart(2, '0') : fmt(row.rank, 0)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-t-hi" title={row.label}>
                          {row.label}
                        </span>
                        {i === 0 && <Trophy className="h-3.5 w-3.5 shrink-0 text-primary-500" />}
                        <span className="shrink-0 font-mono text-[11px] text-t-mid">
                          R² {row.r2 === null ? '—' : fmt(row.r2, 3)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Bar value={(row.r2 ?? 0) * 100} className="flex-1" tone={i === 0 ? 'primary' : 'violet'} />
                        <span className="shrink-0 font-mono text-[10px] text-t-lo">
                          rmse {row.rmse === null ? '—' : fmt(row.rmse, 3)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {winnerName && (
                <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
                  <Crown className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">winner</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-t-hi">{winnerName}</span>
                  <span className="shrink-0 font-mono text-[10px] text-t-lo">{shortId(winnerId)}</span>
                </div>
              )}
            </Panel>

            <Panel
              title="registered models"
              right={
                <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                  {fmt(datasetModels.length, 0)} on dataset
                </span>
              }
            >
              {rankedModels.length === 0 ? (
                <p className="text-[12px] text-t-lo">
                  No model has been trained on this dataset yet — the prediction stage registers them here.
                </p>
              ) : (
                <div className="space-y-1">
                  {rankedModels.slice(0, 5).map(m => {
                    const r2 = n(m.metrics?.r2)
                    const active = m.is_active === true || m.status === 'production'
                    return (
                      <div key={m.id} className="flex items-center gap-2 border-b border-border/60 pb-1.5 last:border-b-0">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-t-mid" title={m.name || m.algorithm}>
                          {m.algorithm || m.name || m.id}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-t-lo">v{m.version || '—'}</span>
                        <span className="w-14 shrink-0 text-right font-mono text-[11px] text-t-hi">
                          {r2 === null ? '—' : fmt(r2, 3)}
                        </span>
                        {active
                          ? <StatusChip status="ok">active</StatusChip>
                          : <StatusChip status="idle">{m.status ? titleize(m.status) : 'draft'}</StatusChip>}
                      </div>
                    )
                  })}
                </div>
              )}
              {datasetModels.length > 5 && (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-t-lo">
                  + {fmt(datasetModels.length - 5, 0)} more on this dataset
                </p>
              )}
            </Panel>
          </div>

          {/* ── action register + exposure ───────────────────────────── */}
          <div className="grid gap-3 xl:grid-cols-12">
            <Panel
              className="min-h-0 xl:col-span-7"
              title="action register"
              right={
                supportingLoading ? (
                  <StatusChip status="running">loading actions</StatusChip>
                ) : actions.length > 0 ? (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                    {fmt(actions.length, 0)} actions · {fmt(actionKwh, 0)} kWh
                  </span>
                ) : undefined
              }
            >
              {actions.length === 0 ? (
                <p className="text-[12px] text-t-lo">
                  No recommendations on record for this dataset — the recommendation stage turns anomalies and SHAP
                  drivers into ranked actions.
                </p>
              ) : (
                <div className="space-y-2">
                  {actions.slice(0, 4).map((r, i) => {
                    const prio = prioOf(r.priority)
                    const kwh = n(r.estimated_savings_kwh)
                    const conf = n(r.confidence)
                    return (
                      <article
                        key={r.id || i}
                        className={cn(
                          'rounded-button border px-3 py-2.5',
                          i === 0
                            ? 'border-primary-500/35 bg-primary-500/[0.04]'
                            : 'border-border bg-panel2',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-t-hi" title={r.title}>
                            {r.title || 'Untitled action'}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest',
                              prio.chip,
                            )}
                          >
                            {prio.label}
                          </span>
                        </div>

                        {r.description && (
                          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-t-lo">{r.description}</p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                          <span className="font-mono text-[11px] text-t-mid">
                            {kwh === null ? '—' : `${fmt(kwh, 1)} kWh`}
                          </span>
                          <span className="font-mono text-[11px] text-t-mid">
                            {n(r.estimated_savings_percent) === null ? '—' : `${fmt(n(r.estimated_savings_percent), 1)}% below baseline`}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-t-lo">
                            {titleize(r.category || 'general')}
                          </span>
                          {r.status && <span className="font-mono text-[10px] text-t-lo">{r.status}</span>}
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <SectionLabel className="shrink-0">confidence</SectionLabel>
                          <Bar value={pct((conf ?? 0) * 100)} className="flex-1" tone={prio.bar} />
                          <span className="w-11 shrink-0 text-right font-mono text-[10px] text-t-mid">
                            {conf === null ? '—' : `${fmt(conf * 100, 0)}%`}
                          </span>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </Panel>

            <Panel
              className="min-h-0 xl:col-span-5"
              title="exposure & evidence"
              right={
                <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                  {latestBenchmark ? `benchmarked ${clockText(latestBenchmark.created_at)}` : 'no benchmark'}
                </span>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-button border border-border bg-panel2 px-2.5 py-2">
                    <SectionLabel>anomalies</SectionLabel>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-t-hi">
                      {fmt(summary.anomalyTotal ?? 0, 0)}
                    </p>
                  </div>
                  <div className="rounded-button border border-border bg-panel2 px-2.5 py-2">
                    <SectionLabel>patterns</SectionLabel>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-t-hi">
                      {fmt(summary.anomalyByType.length, 0)}
                    </p>
                  </div>
                  <div className="rounded-button border border-border bg-panel2 px-2.5 py-2">
                    <SectionLabel>co₂ estimate</SectionLabel>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-t-hi">
                      {summary.co2Kg === null ? '—' : `${fmt(summary.co2Kg, 1)} kg`}
                    </p>
                  </div>
                  <div className="rounded-button border border-border bg-panel2 px-2.5 py-2">
                    <SectionLabel>cost exposure</SectionLabel>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-t-hi">
                      {summary.cost === null ? '—' : fmt(summary.cost, 2)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-button border border-border bg-panel2 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel>savings captured</SectionLabel>
                    <span className="font-mono text-[11px] font-semibold text-t-hi">
                      {savingsKwh === null ? '—' : `${fmt(savingsKwh, 0)} kWh`}
                    </span>
                  </div>
                  <Bar value={pct(savingsPct)} tone="emerald" />
                  <p className="font-mono text-[10px] text-t-lo">
                    {savingsPct === null ? 'no savings estimate on record' : `${fmt(savingsPct, 1)}% below the current baseline`}
                  </p>
                </div>

                <div>
                  <SectionLabel>best model metrics</SectionLabel>
                  {summary.bestMetrics.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {summary.bestMetrics.map(([k, v]) => (
                        <MetricPill key={k} label={k} value={fmt(v, 3)} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[12px] text-t-lo">
                      No metrics recorded for the current model on this dataset.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-border pt-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-t-lo">
                    {summary.trustScore === null
                      ? 'No gate verdict on record — decisions stay provisional until the confidence stage runs.'
                      : `Gate returned ${verdictLabel(summary.verdict, summary.trustScore)} at ${fmt(summary.trustScore, 1)} / 100 — every figure above is traceable to a pipeline stage.`}
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          {/* ── 5 questions + the next beat ──────────────────────────── */}
          <div className="shrink-0">
            <StoryFlow stageKey={STAGE_KEY} activeKey="produced" />
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-t-lo" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                next · report generation turns this briefing into audit-ready deliverables
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate({ to: '/reports' })}
              title="Open Report Generation"
            >
              <Sparkles className="h-3.5 w-3.5" /> Open reports
            </Button>
          </div>

          <div className="shrink-0">
            <AutoNext to="/reports" label="Briefing assembled — generating audit-ready reports" />
          </div>
        </>
      )}
    </div>
  )
}

export default ExecutiveCenterPage
