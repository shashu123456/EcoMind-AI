import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown, Lightbulb, RefreshCw, ShieldCheck, Sparkles, Target, TrendingDown, Zap,
} from 'lucide-react'
import { datasets, recommendations, type Dataset } from '../lib/api'
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

/* ── Advisor brief · Beat 11 · Recommendations ──────────────────────────
   This stage has to end the analysis in *action*, so the screen is built
   as an enterprise advisor brief rather than a chart wall:

     · a ranked action feed — priority chips, projected savings, a
       confidence bar and a status chip per recommendation, grouped by
       category (API by_category) or flattened to a single ranking
     · a savings-impact sidebar — the headline action, per-category
       savings share and the status tracker
     · supporting-evidence expanders — the basis string plus the SHAP
       drivers and anomaly aggregates the advisor actually used

   Every number is the real API payload (recommendations.list /
   recommendations.generate). Nothing is invented: when the list endpoint
   omits a total (it does), the figure is summed from the returned rows. */

const STAGE_KEY = 'recommendation'
const BEAT = beatForStage(STAGE_KEY)
const TOP_K = 8
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/* ── Normalised payload shapes ─────────────────────────────────────────
   The contract types (Rec / RecList) are widened here: the service also
   returns dataset_id, implementation_difficulty and created_at, and
   supporting_evidence is stored as a free-form object that can be empty. */
interface EvidenceFeature { feature?: string; value?: number }
interface EvidenceAnomaly { type?: string; count?: number; score?: number }

interface RecEvidenceRow {
  basis?: string
  anomaly_scores?: EvidenceAnomaly[]
  shap_top_features?: EvidenceFeature[]
  similar_cases?: unknown[]
}

interface RecRow {
  id: string
  dataset_id: string
  category: string
  title: string
  description: string
  priority: string
  estimated_savings_kwh: number
  estimated_savings_percent: number
  confidence: number
  status: string
  implementation_difficulty: string | null
  created_at: string | null
  supporting_evidence: RecEvidenceRow
}

interface RecListRow {
  recommendations: RecRow[]
  by_category: Record<string, number>
  total_savings_kwh: number | null
  total_savings_percent: number | null
  top_recommendation: RecRow | null
}

const EMPTY_LIST: RecListRow = {
  recommendations: [],
  by_category: {},
  total_savings_kwh: null,
  total_savings_percent: null,
  top_recommendation: null,
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v : String(v)
}

function clamp01(v: number | null): number {
  if (v === null) return 0
  return Math.min(1, Math.max(0, v))
}

function asRec(v: unknown): RecRow | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const id = str(o.id)
  const title = str(o.title)
  if (!id && !title) return null
  const ev = o.supporting_evidence && typeof o.supporting_evidence === 'object'
    ? (o.supporting_evidence as RecEvidenceRow)
    : {}
  return {
    id,
    dataset_id: str(o.dataset_id),
    category: str(o.category) || 'general',
    title: title || 'Untitled recommendation',
    description: str(o.description),
    priority: (str(o.priority) || 'medium').toLowerCase(),
    estimated_savings_kwh: n(o.estimated_savings_kwh) ?? 0,
    estimated_savings_percent: n(o.estimated_savings_percent) ?? 0,
    confidence: clamp01(n(o.confidence)),
    status: (str(o.status) || 'pending').toLowerCase(),
    implementation_difficulty: str(o.implementation_difficulty) || null,
    created_at: str(o.created_at) || null,
    supporting_evidence: {
      basis: str(ev.basis) || undefined,
      anomaly_scores: Array.isArray(ev.anomaly_scores) ? ev.anomaly_scores : [],
      shap_top_features: Array.isArray(ev.shap_top_features) ? ev.shap_top_features : [],
      similar_cases: Array.isArray(ev.similar_cases) ? ev.similar_cases : [],
    },
  }
}

/** Never let a malformed payload through — every field is coerced once here. */
function asRecList(v: unknown): RecListRow {
  if (!v || typeof v !== 'object') return EMPTY_LIST
  const o = v as Record<string, unknown>
  const rows = Array.isArray(o.recommendations) ? o.recommendations : []
  const byCategory: Record<string, number> = {}
  if (o.by_category && typeof o.by_category === 'object') {
    for (const [k, raw] of Object.entries(o.by_category as Record<string, unknown>)) {
      const count = n(raw)
      if (k && count !== null && count > 0) byCategory[k] = count
    }
  }
  return {
    recommendations: rows.map(asRec).filter((r): r is RecRow => r !== null),
    by_category: byCategory,
    total_savings_kwh: n(o.total_savings_kwh),
    total_savings_percent: n(o.total_savings_percent),
    top_recommendation: asRec(o.top_recommendation),
  }
}

/* ── Priority / status vocabulary ───────────────────────────────────── */
type BarTone = 'primary' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet'
type ChipState = 'ok' | 'running' | 'warn' | 'idle'

interface PriTone {
  label: string
  icon: ReactNode
  chip: string
  text: string
  dot: string
  tone: BarTone
  weight: number
}

const NEUTRAL_PRI: PriTone = {
  label: 'Unset',
  icon: null,
  chip: 'border-border bg-panel2 text-t-mid',
  text: 'text-t-mid',
  dot: 'bg-t-lo',
  tone: 'primary',
  weight: 4,
}

const PRIORITY: Record<string, PriTone> = {
  critical: {
    label: 'Critical', icon: <Zap className="h-3 w-3" />,
    chip: 'border-accent-rose/30 bg-accent-rose/10 text-accent-rose',
    text: 'text-accent-rose', dot: 'bg-accent-rose', tone: 'rose', weight: 0,
  },
  high: {
    label: 'High', icon: <Zap className="h-3 w-3" />,
    chip: 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber',
    text: 'text-accent-amber', dot: 'bg-accent-amber', tone: 'amber', weight: 1,
  },
  medium: {
    label: 'Medium', icon: <Target className="h-3 w-3" />,
    chip: 'border-accent-gold/30 bg-accent-gold/[0.08] text-accent-gold',
    text: 'text-accent-gold', dot: 'bg-accent-gold', tone: 'violet', weight: 2,
  },
  low: {
    label: 'Low', icon: <ShieldCheck className="h-3 w-3" />,
    chip: 'border-cyan-500/30 bg-accent-cyan/[0.07] text-cyan-600',
    text: 'text-cyan-600', dot: 'bg-accent-cyan', tone: 'cyan', weight: 3,
  },
}

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low']

const STATUS: Record<string, { label: string; state: ChipState }> = {
  pending: { label: 'open', state: 'idle' },
  accepted: { label: 'accepted', state: 'running' },
  implemented: { label: 'done', state: 'ok' },
  rejected: { label: 'rejected', state: 'warn' },
}
const STATUS_ORDER = ['pending', 'accepted', 'implemented', 'rejected']

function prioOf(p: string): PriTone {
  return PRIORITY[p] ?? { ...NEUTRAL_PRI, label: p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Unset' }
}

function statusOf(s: string): { label: string; state: ChipState } {
  return STATUS[s] ?? { label: s || 'unknown', state: 'idle' }
}

function confTone(c: number): BarTone {
  if (c >= 0.8) return 'emerald'
  if (c >= 0.6) return 'amber'
  return 'cyan'
}

function humanKey(k: string): string {
  return k.replace(/_/g, ' ')
}

function whenText(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : '—'
}

/* ── Indeterminate progress — only while the advisor is working ─────── */
function Working() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-panel2 px-3 py-2">
      <StatusChip status="running">synthesizing actions</StatusChip>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel3">
        <motion.span
          className="absolute inset-y-0 w-1/3 rounded-full bg-primary-500"
          initial={{ x: '-130%' }}
          animate={{ x: ['-130%', '330%'] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
        anomalies · dq · shap drivers
      </span>
    </div>
  )
}

/* ── The evidence behind one recommendation ────────────────────────── */
function Evidence({ rec }: { rec: RecRow }) {
  const ev = rec.supporting_evidence
  const features = ev.shap_top_features ?? []
  const anomalies = ev.anomaly_scores ?? []
  const cases = ev.similar_cases ?? []
  const maxScore = anomalies.reduce((a, x) => Math.max(a, n(x.score) ?? 0), 0) || 1
  const nothing = !ev.basis && !features.length && !anomalies.length && !cases.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
        {rec.implementation_difficulty && <span>implementation · {rec.implementation_difficulty}</span>}
        <span>issued {whenText(rec.created_at)}</span>
        <span title={rec.id || undefined}>id {shortId(rec.id || null)}</span>
      </div>

      {nothing ? (
        <p className="text-[12px] text-t-lo">
          No supporting evidence was stored with this action — the advisor derived it without a
          recorded basis, anomaly aggregate or SHAP driver.
        </p>
      ) : (
        <>
          {ev.basis && (
            <div className="rounded-button border border-border bg-panel px-3 py-2">
              <SectionLabel>evidence basis</SectionLabel>
              <p className="mt-1 text-[12px] leading-relaxed text-t-mid">{ev.basis}</p>
            </div>
          )}

          {features.length > 0 && (
            <div>
              <SectionLabel>shap drivers</SectionLabel>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {features.map((f, i) => (
                  <span
                    key={`${str(f.feature)}-${i}`}
                    title={`${str(f.feature)} · global importance ${fmt(n(f.value) ?? 0, 4)}`}
                    className="inline-flex items-baseline gap-1.5 rounded-button border border-border bg-panel px-2 py-0.5 font-mono text-[10px] text-t-mid"
                  >
                    {str(f.feature) || '—'}
                    <span className="font-semibold text-accent-cyan">{fmt(n(f.value) ?? 0, 3)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {anomalies.length > 0 && (
            <div>
              <SectionLabel>anomaly aggregates</SectionLabel>
              <div className="mt-1.5 space-y-1">
                {anomalies.map((a, i) => {
                  const score = n(a.score) ?? 0
                  return (
                    <div key={`${str(a.type)}-${i}`} className="flex items-center gap-2.5">
                      <span className="w-40 shrink-0 truncate font-mono text-[10px] text-t-mid">
                        {humanKey(str(a.type) || 'anomaly')}
                      </span>
                      <Bar value={score} max={maxScore} className="flex-1" tone="rose" />
                      <span className="w-24 shrink-0 text-right font-mono text-[10px] text-t-lo">
                        {fmt(n(a.count) ?? 0, 0)} ev · {fmt(score, 3)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {cases.length > 0 && (
            <div>
              <SectionLabel>similar cases</SectionLabel>
              <ul className="mt-1.5 space-y-1">
                {cases.slice(0, 4).map((c, i) => (
                  <li key={i} className="truncate font-mono text-[10px] text-t-mid">
                    {typeof c === 'object' && c ? JSON.stringify(c) : String(c)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function RecommendationsPage() {
  const { datasetId } = useRouteParams()
  const { setActive, markCompleted } = useJourney()

  const list = useApi<RecListRow>(
    () => (datasetId
      ? recommendations.list(datasetId).then(asRecList)
      : Promise.resolve(EMPTY_LIST)),
    [datasetId],
  )
  const ctx = useApi<Dataset | null>(
    () => (datasetId ? datasets.get(datasetId) : Promise.resolve(null)),
    [datasetId],
  )

  const [busy, setBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  /** count returned by the last generate call — null when never drafted here */
  const [lastRunCount, setLastRunCount] = useState<number | null>(null)
  const [view, setView] = useState<'grouped' | 'ranked'>('grouped')
  const [openId, setOpenId] = useState<string | null>(null)

  const items = useMemo(() => list.data?.recommendations ?? [], [list.data])
  const byCategory = useMemo(() => {
    const counts = { ...(list.data?.by_category ?? {}) }
    for (const r of items) counts[r.category] = (counts[r.category] ?? 0) + 1
    return counts
  }, [list.data, items])

  const totalKwh = list.data?.total_savings_kwh
    ?? items.reduce((a, r) => a + r.estimated_savings_kwh, 0)
  const totalPct = list.data?.total_savings_percent
    ?? items.reduce((a, r) => a + r.estimated_savings_percent, 0)
  const maxKwh = useMemo(
    () => items.reduce((a, r) => Math.max(a, r.estimated_savings_kwh), 0),
    [items],
  )

  const avgConfidence = useMemo(
    () => (items.length ? items.reduce((a, r) => a + r.confidence, 0) / items.length : null),
    [items],
  )

  const openCount = useMemo(() => items.filter(r => r.status === 'pending').length, [items])
  const closedCount = items.length - openCount

  /* ranked: priority first, then projected savings, then title */
  const ranked = useMemo(() => {
    const arr = [...items]
    arr.sort((a, b) => (
      (prioOf(a.priority).weight - prioOf(b.priority).weight)
      || (b.estimated_savings_kwh - a.estimated_savings_kwh)
      || a.title.localeCompare(b.title)
    ))
    return arr
  }, [items])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; rows: RecRow[]; kwh: number }>()
    for (const r of ranked) {
      const g = map.get(r.category) ?? { key: r.category, rows: [], kwh: 0 }
      g.rows.push(r)
      g.kwh += r.estimated_savings_kwh
      map.set(r.category, g)
    }
    return Array.from(map.values()).sort((a, b) => b.kwh - a.kwh || b.rows.length - a.rows.length)
  }, [ranked])

  const categoryImpact = useMemo(
    () => groups.map(g => ({
      ...g,
      count: n(byCategory[g.key]) ?? g.rows.length,
      share: totalKwh > 0 ? (g.kwh / totalKwh) * 100 : 0,
    })),
    [groups, byCategory, totalKwh],
  )

  const statusImpact = useMemo(() => {
    const seen = new Set(items.map(r => r.status))
    const keys = [...STATUS_ORDER.filter(s => seen.has(s)), ...Array.from(seen).filter(s => !STATUS_ORDER.includes(s))]
    return keys.map(k => {
      const count = items.filter(r => r.status === k).length
      return {
        key: k,
        count,
        meta: statusOf(k),
        share: items.length ? (count / items.length) * 100 : 0,
      }
    })
  }, [items])

  const priorityCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of items) counts.set(r.priority, (counts.get(r.priority) ?? 0) + 1)
    return counts
  }, [items])

  /* the headline is always a row that exists in the current list */
  const top = useMemo<RecRow | null>(() => {
    const explicit = list.data?.top_recommendation
    if (explicit && items.some(r => r.id === explicit.id)) return explicit
    return ranked[0] ?? null
  }, [list.data, items, ranked])
  const topId = top?.id ?? null

  /* open the headline action by default; keep the user's choice */
  useEffect(() => {
    setOpenId(cur => (cur && ranked.some(r => r.id === cur) ? cur : ranked[0]?.id ?? null))
  }, [ranked])

  useEffect(() => {
    if (items.length && datasetId) {
      markCompleted(STAGE_KEY)
      setActive(datasetId)
    }
  }, [items.length, datasetId, markCompleted, setActive])

  async function generate() {
    if (!datasetId || busy) return
    setBusy(true)
    setGenError(null)
    try {
      const next = asRecList(await recommendations.generate(datasetId, { top_k: TOP_K }))
      setLastRunCount(next.recommendations.length)
      await list.refetch()
      markCompleted(STAGE_KEY)
      setActive(datasetId)
    } catch (e: any) {
      setGenError(e?.message || 'the advisor could not rebuild the brief')
    } finally {
      setBusy(false)
    }
  }

  const loading = list.loading && !list.data
  const failure = list.error
  const noDataset = !datasetId
  const activeStep = busy ? 'processed' : items.length ? 'produced' : 'entered'
  const hasData = items.length > 0

  if (noDataset) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        <StageHeader
          beat={BEAT.beat}
          chapter={BEAT.chapter}
          title="Advisor brief"
          tagline="The ranked actions this dataset supports — every one carrying the evidence that produced it."
          icon={<Lightbulb className="h-5 w-5 text-accent-amber" />}
        />
        <EmptyState
          title="No dataset in context"
          hint="The advisor reads anomaly, quality and explainability artifacts for one dataset. Open the library and pick one to continue."
        />
        <div className="shrink-0">
          <StoryFlow stageKey={STAGE_KEY} activeKey="entered" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={BEAT.beat}
        chapter={BEAT.chapter}
        title="Advisor brief"
        tagline="The ranked actions this dataset supports — every one carrying the evidence that produced it."
        icon={<Lightbulb className="h-5 w-5 text-accent-amber" />}
        right={
          <>
            {busy
              ? <StatusChip status="running">drafting</StatusChip>
              : failure
                ? <StatusChip status="warn">brief unavailable</StatusChip>
                : hasData
                  ? <StatusChip status="ok">{fmt(items.length, 0)} actions</StatusChip>
                  : <StatusChip status="idle">no actions yet</StatusChip>}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => list.refetch()}
              disabled={loading || busy}
              title="Re-read the stored brief"
              className="whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={generate}
              disabled={busy}
              aria-busy={busy}
              className="whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              {busy ? 'Drafting…' : hasData ? 'Rebuild brief' : 'Draft brief'}
            </Button>
          </>
        }
      />

      {/* ── headline strip ─────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Projected savings"
          value={`${fmt(totalKwh, 0)} kWh`}
          hint={hasData ? `sum across ${fmt(items.length, 0)} actions` : 'draft the brief to estimate'}
          accent="emerald"
          mono
        />
        <Stat
          label="CO₂ avoided"
          value={`${fmt(totalKwh * 0.5, 0)} kg`}
          hint={`0.5 kg CO₂e per kWh · ≈ ${fmt(totalKwh * 0.5 * 12, 0)} kg / year`}
          accent="cyan"
          mono
        />
        <Stat
          label="Cost impact · year"
          value={`$${fmt(totalKwh * 12 * 0.12, 0)}`}
          hint={`at $0.12/kWh · ${fmt(totalPct, 1)}% of consumption`}
          accent="amber"
          mono
        />
        <Stat
          label="Action plan"
          value={items.length ? `${fmt(openCount, 0)} open · ${fmt(items.length, 0)} total` : '—'}
          hint={hasData
            ? `start with ${ranked[0]?.category?.replace(/_/g, ' ') ?? 'top priority'} — priority × savings`
            : 'draft the brief to build the plan'}
          accent="primary"
          mono
        />
        <Stat
          label="Mean confidence"
          value={avgConfidence === null ? '—' : `${fmt(avgConfidence * 100, 1)}%`}
          hint={top ? `top action ${fmt(top.confidence * 100, 0)}%` : 'across the brief'}
          mono
        />
      </div>

      {/* ── context + composition strip ────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border bg-panel px-3.5 py-2.5">
        {priorityCounts.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <SectionLabel>by priority</SectionLabel>
            {PRIORITY_ORDER.filter(k => priorityCounts.has(k)).map(k => {
              const tone = PRIORITY[k]
              return (
                <span
                  key={k}
                  className={cn('inline-flex items-center gap-1.5 rounded-button border px-2 py-0.5 font-mono text-[11px]', tone.chip)}
                >
                  {tone.icon}
                  {tone.label}
                  <span className="font-semibold">{fmt(priorityCounts.get(k) ?? 0, 0)}</span>
                </span>
              )
            })}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MetricPill label="categories" value={fmt(groups.length, 0)} />
          <MetricPill label="headline" value={humanKey(top?.category ?? '—')} accent="text-accent-amber" />
          <span
            className="max-w-[22rem] truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo"
            title={ctx.data?.id ?? datasetId}
          >
            {ctx.data
              ? `${ctx.data.name} · ${fmt(n(ctx.data.row_count) ?? 0, 0)} rows · ${fmt(n(ctx.data.column_count) ?? 0, 0)} cols`
              : `dataset ${shortId(datasetId)}`}
          </span>
        </div>
      </div>

      {busy && <Working />}
      {!busy && genError && <StatusChip status="warn">{genError}</StatusChip>}

      {loading && <LoadingState label="Reading the advisor brief…" />}

      {!loading && failure && (
        <EmptyState
          title="The advisor brief is unavailable"
          hint={failure}
          action={<Button onClick={() => list.refetch()} size="sm">Retry</Button>}
        />
      )}

      {!loading && !failure && !hasData && (
        <EmptyState
          title={lastRunCount === null ? 'No actions drafted for this dataset' : 'The advisor derived no actions'}
          hint={
            lastRunCount === null
              ? 'Draft the brief to synthesize actions from the anomaly findings, the data-quality verdict and the SHAP drivers of this dataset.'
              : `The last draft returned ${fmt(lastRunCount, 0)} action${lastRunCount === 1 ? '' : 's'} — the advisor combined anomaly findings, the data-quality verdict and SHAP drivers and found nothing to act on. Run the earlier stages so those inputs exist.`
          }
          action={
            <Button size="sm" onClick={generate} disabled={busy}>
              <Sparkles className="h-4 w-4" /> Draft brief
            </Button>
          }
        />
      )}

      {hasData && (
        <div className="grid min-h-0 gap-3 xl:grid-cols-12">
          {/* ── ranked action feed ─────────────────────────────────── */}
          <Panel
            className="min-h-[28rem] xl:col-span-7"
            title={view === 'grouped' ? 'action feed · grouped by category' : 'action feed · ranked'}
            right={
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {view === 'grouped'
                    ? `${fmt(groups.length, 0)} categor${groups.length === 1 ? 'y' : 'ies'} · ${fmt(items.length, 0)} actions`
                    : `rank 01–${fmt(items.length, 0)}`}
                </span>
                <div className="inline-flex overflow-hidden rounded-button border border-border bg-panel2 p-0.5">
                  {(['grouped', 'ranked'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={cn(
                        'rounded-button px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
                        view === v ? 'bg-primary-500 text-white' : 'text-t-lo hover:text-t-hi',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            }
            flush
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === 'grouped' ? (
                groups.map(g => {
                  const count = n(byCategory[g.key]) ?? g.rows.length
                  return (
                    <div key={g.key}>
                      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-panel2 px-4 py-1.5">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY[g.rows[0]?.priority ?? '']?.dot ?? 'bg-t-lo')} />
                        <SectionLabel className="truncate">{humanKey(g.key)}</SectionLabel>
                        <span className="shrink-0 font-mono text-[10px] text-t-lo">
                          {fmt(count, 0)} action{count === 1 ? '' : 's'}
                        </span>
                        <div className="ml-1 hidden w-20 sm:block">
                          <Bar value={g.kwh} max={maxKwh || 1} tone="emerald" />
                        </div>
                        <span className="ml-auto shrink-0 font-mono text-[11px] font-semibold text-t-hi">
                          {fmt(g.kwh, 0)} kWh
                        </span>
                      </div>
                      {g.rows.map(r => (
                        <ActionRow
                          key={r.id || r.title}
                          rec={r}
                          rank={ranked.indexOf(r) + 1}
                          maxKwh={maxKwh}
                          open={openId === r.id}
                          isTop={topId === r.id}
                          onToggle={() => setOpenId(cur => (cur === r.id ? null : r.id))}
                        />
                      ))}
                    </div>
                  )
                })
              ) : (
                ranked.map(r => (
                  <ActionRow
                    key={r.id || r.title}
                    rec={r}
                    rank={ranked.indexOf(r) + 1}
                    maxKwh={maxKwh}
                    open={openId === r.id}
                    isTop={topId === r.id}
                    onToggle={() => setOpenId(cur => (cur === r.id ? null : r.id))}
                  />
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-border bg-panel2 px-4 py-2">
              <p className="font-mono text-[10px] leading-4 text-t-lo">
                ranked by priority, then projected savings · savings are estimates from the anomaly,
                quality and shap evidence attached to each action · status is read from the store and
                written by the workflow
              </p>
            </div>
          </Panel>

          {/* ── savings impact sidebar ────────────────────────────── */}
          <div className="grid min-h-0 gap-3 xl:col-span-5">
            <Panel
              title="headline action"
              right={
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {shortId(top?.id ?? null)}
                </span>
              }
            >
              {!top ? (
                <p className="text-[12px] text-t-lo">No action selected.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', prioOf(top.priority).chip)}>
                      {prioOf(top.priority).icon}
                      {prioOf(top.priority).label}
                    </span>
                    <StatusChip status={statusOf(top.status).state}>{statusOf(top.status).label}</StatusChip>
                    <span className="rounded-button border border-border bg-panel2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-mid">
                      {humanKey(top.category)}
                    </span>
                  </div>

                  <h3 className="text-[15px] font-semibold leading-snug text-t-hi">{top.title}</h3>
                  <p className="text-[12px] leading-relaxed text-t-mid">
                    {top.description || 'No description recorded for this action.'}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-button border border-border bg-panel2 px-3 py-2">
                      <SectionLabel>savings</SectionLabel>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-accent-emerald">
                        {fmt(top.estimated_savings_kwh, 0)} kWh
                      </p>
                    </div>
                    <div className="rounded-button border border-border bg-panel2 px-3 py-2">
                      <SectionLabel>reduction</SectionLabel>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-cyan-600">
                        {fmt(top.estimated_savings_percent, 1)}%
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <SectionLabel>confidence</SectionLabel>
                      <span className="font-mono text-[11px] text-t-mid">
                        {fmt(top.confidence * 100, 1)}%
                      </span>
                    </div>
                    <Bar value={top.confidence * 100} tone={confTone(top.confidence)} />
                  </div>

                  {top.implementation_difficulty && (
                    <p className="font-mono text-[10px] leading-4 text-t-lo">
                      implementation · {top.implementation_difficulty}
                    </p>
                  )}
                </div>
              )}
            </Panel>

            <Panel
              title="savings impact by category"
              right={
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {fmt(totalKwh, 0)} kWh total
                </span>
              }
            >
              {categoryImpact.length === 0 ? (
                <p className="text-[12px] text-t-lo">No category distribution yet.</p>
              ) : (
                <div className="space-y-2">
                  {categoryImpact.map(c => (
                    <div key={c.key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-t-mid">
                          {humanKey(c.key)}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-t-lo">
                          {fmt(c.count, 0)} action{c.count === 1 ? '' : 's'}
                        </span>
                        <span className="w-20 shrink-0 text-right font-mono text-[11px] font-semibold text-t-hi">
                          {fmt(c.kwh, 0)} kWh
                        </span>
                      </div>
                      <Bar value={c.share} tone="emerald" />
                    </div>
                  ))}
                  <p className="border-t border-border pt-2 font-mono text-[10px] text-t-lo">
                    share of the {fmt(totalKwh, 0)} kWh projected across the brief
                  </p>
                </div>
              )}
            </Panel>

            <Panel
              title="status tracker"
              right={
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {fmt(closedCount, 0)}/{fmt(items.length, 0)} closed
                </span>
              }
            >
              <div className="space-y-2">
                {statusImpact.map(s => (
                  <div key={s.key} className="flex items-center gap-2.5">
                    <StatusChip status={s.meta.state}>{s.meta.label}</StatusChip>
                    <div className="min-w-0 flex-1">
                      <Bar
                        value={s.share}
                        tone={s.meta.state === 'ok' ? 'emerald' : s.meta.state === 'warn' ? 'rose' : s.meta.state === 'running' ? 'primary' : 'amber'}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-[11px] text-t-mid">
                      {fmt(s.count, 0)}
                    </span>
                  </div>
                ))}
                {statusImpact.length === 0 && (
                  <p className="text-[12px] text-t-lo">No actions to track.</p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ── 5 questions + next stage ────────────────────────────────── */}
      <div className="shrink-0">
        <StoryFlow stageKey={STAGE_KEY} activeKey={activeStep} />
      </div>

      {hasData && (
        <div className="flex shrink-0 items-center gap-2">
          <TrendingDown className="h-3.5 w-3.5 shrink-0 text-t-lo" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
            next · executive intelligence consolidates this brief with every prior stage
          </span>
        </div>
      )}

      {hasData && (
        <AutoNext
          to="/executive"
          label="Advisor brief sealed — assembling the Executive Intelligence Center"
        />
      )}
    </div>
  )
}

/* ── One line of the action feed ───────────────────────────────────── */
function ActionRow({
  rec, rank, maxKwh, open, isTop, onToggle,
}: {
  rec: RecRow
  rank: number
  maxKwh: number
  open: boolean
  isTop: boolean
  onToggle: () => void
}) {
  const prio = prioOf(rec.priority)
  const status = statusOf(rec.status)
  const savings = maxKwh > 0 ? (rec.estimated_savings_kwh / maxKwh) * 100 : 0
  const evidenceCount =
    (rec.supporting_evidence.anomaly_scores?.length ?? 0)
    + (rec.supporting_evidence.shap_top_features?.length ?? 0)
    + (rec.supporting_evidence.similar_cases?.length ?? 0)
    + (rec.supporting_evidence.basis ? 1 : 0)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'grid w-full grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors sm:grid-cols-[1.5rem_minmax(0,1fr)_minmax(8rem,9.5rem)]',
          open ? 'bg-primary-500/[0.05]' : 'hover:bg-panel2',
        )}
      >
        <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-panel font-mono text-[9px] text-t-lo">
          {String(rank).padStart(2, '0')}
        </span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[13px] font-semibold text-t-hi">{rec.title}</span>
            {isTop && (
              <span className="shrink-0 rounded-button border border-primary-500/35 bg-primary-500/[0.07] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-500">
                headline
              </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">
              {evidenceCount > 0 ? `${fmt(evidenceCount, 0)} evidence` : 'no evidence'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', open ? 'rotate-180 text-t-mid' : 'text-t-lo')} />
            </span>
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]', prio.chip)}>
              {prio.icon}
              {prio.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-t-mid">
              <span className={cn('h-1.5 w-1.5 rounded-full', prio.dot)} />
              {humanKey(rec.category)}
            </span>
            <StatusChip status={status.state}>{status.label}</StatusChip>
          </span>

          {rec.description && (
            <span className={cn('mt-1.5 block text-[12px] leading-relaxed text-t-lo', open ? '' : 'line-clamp-2')}>
              {rec.description}
            </span>
          )}
        </span>

        <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-start-3 sm:flex-col sm:items-end sm:gap-1">
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold text-accent-emerald">
              {fmt(rec.estimated_savings_kwh, 0)}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">kWh</span>
            <span className="font-mono text-[10px] text-t-lo">· {fmt(rec.estimated_savings_percent, 1)}%</span>
          </span>
          <span className="w-full max-w-[9rem] sm:w-[8.5rem]">
            <Bar value={savings} max={100} tone="emerald" />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-t-lo">conf</span>
            <span className="w-14">
              <Bar value={rec.confidence * 100} tone={confTone(rec.confidence)} />
            </span>
            <span className="font-mono text-[10px] text-t-mid">{fmt(rec.confidence * 100, 0)}%</span>
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="evidence"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="border-t border-border bg-panel2 px-4 py-3"
          >
            <Evidence rec={rec} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default RecommendationsPage
