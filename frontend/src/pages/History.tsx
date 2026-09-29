import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import {
  Archive, ArrowDown, ArrowDownUp, ArrowUp, Ban, ChevronDown, Database,
  ExternalLink, FileText, Layers, RefreshCw, Search, ShieldCheck, X,
} from 'lucide-react'
import {
  datasets, models, registry, workflows,
  type Dataset, type Model, type RegistryEntry, type Run, type RunDetail,
  type Trace, type WorkflowList,
} from '../lib/api'
import { useApi } from '../lib/hooks'
import { fmt, n } from '../lib/pagekit'
import { useJourney, WORKFLOW, nextStage, stagePath } from '../lib/journey'
import { beatForStage, storyForStage } from '../lib/story'
import {
  Bar, EmptyState, LoadingState, MetricPill, Panel, SectionLabel, StageHeader,
  StatusChip, Advanced, ResultSummary,
} from '../lib/stagekit'
import { AutoNext, Button, DoneChip } from '../lib/kit'
import { toast } from '../lib/toast'
import { cn } from '../lib/cn'

/* ── Registry vault · Beat 13 · History & Model Registry ───────────────
   The closing screen of the journey, so it is built as a two-door vault
   rather than another dashboard:

     · Run ledger — every workflow run ever started, sortable and
       searchable: dataset, status chip, stage progress, wall-clock and
       elapsed time. Clicking a row reopens it: the journey store is
       rehydrated (dataset · run · model · stage statuses) and the router
       moves to the stage that run is actually sitting on. The chevron
       opens the trace audit in place, without leaving the vault.

     · Model registry — every entry grouped by model as a shelf of
       versions, newest first, with the current version marked, the real
       performance_summary, the note filed with it, and promote / deprecate
       controls that write back to the API.

   No fabricated rows: the ledger is GET /workflows, the shelves are
   GET /registry enriched by GET /models and GET /datasets, and the two
   mutations are real POSTs.                                              */

const STAGE_KEY = 'history_registry'
const BEAT = beatForStage(STAGE_KEY)

/* History is the last stage in WORKFLOW, so the journey has nothing to
   chain to after it — nextStage() returns null here and the run closes on
   its completion summary, the same destination the automated run ends on. */
const CONTINUE_TO: string = nextStage({ datasetStageKey: STAGE_KEY }).path ?? '/journey-complete'

const LEDGER_COLS = 'grid grid-cols-[minmax(0,1fr)_10rem_8.5rem_3.75rem] items-center gap-3'

type Tone = 'ok' | 'running' | 'warn' | 'idle'
type SortKey = 'started' | 'progress' | 'status'
type RegFilter = 'all' | 'current' | 'promoted' | 'deprecated'
type BarTone = 'primary' | 'emerald' | 'amber' | 'rose'

const SORT_COLS: { key: SortKey; label: string }[] = [
  { key: 'started', label: 'dataset / run' },
  { key: 'progress', label: 'progress' },
  { key: 'status', label: 'status' },
]

const REG_FILTERS: { key: RegFilter; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'current', label: 'current' },
  { key: 'promoted', label: 'promoted' },
  { key: 'deprecated', label: 'deprecated' },
]

const RUN_TONE: Record<string, Tone> = {
  completed: 'ok', complete: 'ok', succeeded: 'ok', success: 'ok', done: 'ok',
  running: 'running', in_progress: 'running', active: 'running', started: 'running',
  failed: 'warn', error: 'warn', cancelled: 'warn', canceled: 'warn',
  pending: 'idle', queued: 'idle', created: 'idle', draft: 'idle', idle: 'idle',
}

const REG_TONE: Record<string, Tone> = {
  production: 'ok', promoted: 'ok', active: 'ok', live: 'ok', current: 'ok',
  staging: 'idle', draft: 'idle', candidate: 'idle', registered: 'idle', pending: 'idle', shadow: 'idle',
  deprecated: 'warn', retired: 'warn', archived: 'warn', rejected: 'warn', failed: 'warn',
}

const PROMOTED = new Set(['production', 'promoted', 'active', 'live'])
const DEPRECATED = new Set(['deprecated', 'retired', 'archived', 'rejected'])

/* Runs sort by operational urgency, not alphabetically. */
const STATUS_RANK: Record<string, number> = {
  running: 0, in_progress: 0, active: 0, started: 0,
  failed: 1, error: 1, cancelled: 1, canceled: 1,
  pending: 2, queued: 2, created: 2,
  completed: 3, complete: 3, succeeded: 3, done: 3,
}

function key(s: unknown): string {
  return String(s ?? '').trim().toLowerCase()
}

function tone(map: Record<string, Tone>, s: unknown): Tone {
  return map[key(s)] ?? 'idle'
}

function runBarTone(s: unknown): BarTone {
  const k = key(s)
  if (k === 'completed' || k === 'complete' || k === 'succeeded' || k === 'done') return 'emerald'
  if (k === 'failed' || k === 'error' || k === 'cancelled' || k === 'canceled') return 'rose'
  return 'primary'
}

function stageCount(run: Run): number {
  return Array.isArray(run?.stages_completed) ? run.stages_completed.length : 0
}

function clock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function epoch(iso: string | null | undefined): number {
  const t = Date.parse(iso ?? '')
  return Number.isFinite(t) ? t : 0
}

function durationMs(run: Run): number | null {
  const s = Date.parse(run?.started_at ?? '')
  const e = Date.parse(run?.completed_at ?? '')
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null
  return e - s
}

function ms(v: unknown): string {
  const x = n(v)
  if (x === null) return '—'
  if (x >= 60000) return `${(x / 60000).toFixed(1)}m`
  if (x >= 1000) return `${(x / 1000).toFixed(1)}s`
  return `${Math.round(x)}ms`
}

/** performance_summary is untyped in the API contract — read it defensively. */
function perfOf(summary: unknown): {
  r2: number | null; rmse: number | null; mae: number | null; mape: number | null
  known: number
} {
  const o = (summary && typeof summary === 'object' ? summary : {}) as Record<string, unknown>
  const known = ['r2', 'rmse', 'mae', 'mape'].filter(k => n(o[k]) !== null).length
  return { r2: n(o.r2), rmse: n(o.rmse), mae: n(o.mae), mape: n(o.mape), known }
}

/** Where a reopened run should land: the stage it is actually sitting on. */
function resumeTarget(run: Run, modelId: string | null): { path: string; label: string } | null {
  const ctx = {
    datasetId: run?.dataset_id || undefined,
    runId: run?.id,
    modelId: modelId || undefined,
  }
  const done = new Set(Array.isArray(run?.stages_completed) ? run.stages_completed : [])
  const cur = n(run?.current_stage)
  const live = key(run?.status) === 'running' && cur !== null ? WORKFLOW[cur] : undefined
  const ordered = [
    ...(live ? [live] : []),
    ...WORKFLOW.filter(s => !done.has(s.key)),
    ...WORKFLOW,
  ]
  for (const s of ordered) {
    const path = stagePath(s, ctx)
    /* a stage whose $modelId is unknown cannot be addressed — skip it */
    if (!path.includes('$')) return { path, label: s.label }
  }
  return null
}

export function HistoryPage() {
  const navigate = useNavigate()
  const reopenRun = useJourney(s => s.reopenRun)
  const markCompleted = useJourney(s => s.markCompleted)
  const resetContext = useJourney(s => s.setActive)
  const liveRunId = useJourney(s => s.runId)
  const historyDone = useJourney(s => s.stageStatuses[STAGE_KEY])

  const runs = useApi<WorkflowList>(() => workflows.list(), [])
  const reg = useApi<{ models: RegistryEntry[] }>(() => registry.list(), [])
  const dsList = useApi<{ datasets: Dataset[] }>(() => datasets.list(), [])
  const modelList = useApi<{ models: Model[] }>(() => models.list(), [])

  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'started', dir: 'desc' })
  const [query, setQuery] = useState('')
  const [regFilter, setRegFilter] = useState<RegFilter>('all')
  const [auditFor, setAuditFor] = useState<string | null>(null)
  const [audit, setAudit] = useState<RunDetail | null>(null)
  const [auditBusy, setAuditBusy] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [reopening, setReopening] = useState<string | null>(null)
  const [acting, setActing] = useState<{ modelId: string; action: 'promote' | 'deprecate' } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const hasLiveRun = Boolean(liveRunId)

  useEffect(() => {
    if (!hasLiveRun) return
    markCompleted(STAGE_KEY)
  }, [hasLiveRun, markCompleted])

  /* ── data shaping ──────────────────────────────────────────────── */

  const dsNames = useMemo(() => {
    const m = new Map<string, string>()
    ;(dsList.data?.datasets ?? []).forEach(d => { if (d?.id) m.set(d.id, d.name || d.id) })
    return m
  }, [dsList.data])

  const modelById = useMemo(() => {
    const m = new Map<string, Model>()
    ;(modelList.data?.models ?? []).forEach(x => { if (x?.id) m.set(x.id, x) })
    return m
  }, [modelList.data])

  const runList = useMemo<Run[]>(
    () => (Array.isArray(runs.data?.runs) ? runs.data.runs : []).filter(r => Boolean(r?.id)),
    [runs.data],
  )

  const regList = useMemo<RegistryEntry[]>(
    () => (Array.isArray(reg.data?.models) ? reg.data.models : [])
      .filter(e => Boolean(e?.id) || Boolean(e?.model_id)),
    [reg.data],
  )

  const dsName = (id: string | null | undefined) => {
    if (!id) return 'unknown dataset'
    return dsNames.get(id) ?? id.slice(0, 8)
  }

  const sorted = useMemo(() => {
    const arr = runList.slice()
    arr.sort((a, b) => {
      let d = 0
      if (sort.key === 'progress') d = stageCount(a) - stageCount(b)
      else if (sort.key === 'status') d = (STATUS_RANK[key(a.status)] ?? 9) - (STATUS_RANK[key(b.status)] ?? 9)
      if (d === 0) d = epoch(a.started_at) - epoch(b.started_at)
      return sort.dir === 'asc' ? d : -d
    })
    return arr
  }, [runList, sort])

  const q = query.trim().toLowerCase()
  const visibleRuns = useMemo(() => {
    if (!q) return sorted
    return sorted.filter(r =>
      `${dsName(r.dataset_id)} ${r.id ?? ''} ${r.status ?? ''} ${r.error_message ?? ''}`.toLowerCase().includes(q),
    )
  }, [sorted, q, dsNames])

  const filteredReg = useMemo(() => regList.filter(e => {
    const k = key(e.status)
    if (regFilter === 'current') return Boolean(e.is_current)
    if (regFilter === 'promoted') return PROMOTED.has(k)
    if (regFilter === 'deprecated') return DEPRECATED.has(k)
    return true
  }), [regList, regFilter])

  /* One shelf per model, versions newest-first, shelves by latest activity. */
  const shelves = useMemo(() => {
    const m = new Map<string, RegistryEntry[]>()
    filteredReg.forEach(e => {
      const k = String(e.model_id || e.id)
      const arr = m.get(k)
      if (arr) arr.push(e)
      else m.set(k, [e])
    })
    return Array.from(m.entries())
      .map(([modelId, entries]) => ({
        modelId,
        entries: entries.slice().sort((a, b) => (n(b.version) ?? 0) - (n(a.version) ?? 0)),
        latest: Math.max(...entries.map(e => epoch(e.promoted_at ?? e.created_at))),
      }))
      .sort((a, b) => b.latest - a.latest)
  }, [filteredReg])

  /* ── headline numbers ──────────────────────────────────────────── */

  const running = runList.filter(r => tone(RUN_TONE, r.status) === 'running').length
  const completedCount = runList.filter(r => tone(RUN_TONE, r.status) === 'ok').length
  const failedCount = runList.filter(r => tone(RUN_TONE, r.status) === 'warn').length
  const executions = runList.reduce((a, r) => a + stageCount(r), 0)
  const currentCount = regList.filter(e => e.is_current).length
  const promotedCount = regList.filter(e => PROMOTED.has(key(e.status))).length
  const completedPct = runList.length ? Math.round((completedCount / runList.length) * 100) : 0

  const liveRun = useMemo(
    () => runList.find(r => r.id === liveRunId) ?? null,
    [runList, liveRunId],
  )

  /* ── actions ───────────────────────────────────────────────────── */

  async function refreshAll() {
    if (refreshing) return
    setRefreshing(true)
    await Promise.allSettled([runs.refetch(), reg.refetch(), dsList.refetch(), modelList.refetch()])
    setRefreshing(false)
  }

  function toggleSort(k: SortKey) {
    setSort(s => (s.key === k
      ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key: k, dir: k === 'started' ? 'desc' : 'asc' }))
  }

  function go(path: string) {
    ;(navigate as any)({ to: path })
  }

  function newRun() {
    resetContext(null, null, null)
    go('/library')
  }

  async function reopenAt(run: Run) {
    if (reopening) return
    setReopening(run.id)
    try {
      /* rehydrates the journey store: dataset, run, model and stage statuses */
      const restored = await reopenRun(run.id)
      if (!restored) {
        toast('Could not open that run', 'The run detail did not load — retry from the ledger.', 'error')
        return
      }
      const target = resumeTarget(run, useJourney.getState().modelId)
      if (!target) {
        toast('No stage to reopen', 'This run has no addressable stage left — open the reports.', 'error')
        return
      }
      go(target.path)
    } catch (e: any) {
      toast('Could not open that run', String(e?.message ?? e), 'error')
    } finally {
      setReopening(null)
    }
  }

  async function toggleAudit(run: Run) {
    if (auditFor === run.id) {
      setAuditFor(null)
      setAudit(null)
      setAuditError(null)
      return
    }
    setAuditFor(run.id)
    setAudit(null)
    setAuditError(null)
    setAuditBusy(true)
    try {
      const detail = await workflows.get(run.id)
      setAudit(detail ?? null)
    } catch (e: any) {
      setAuditError(String(e?.message ?? e))
    } finally {
      setAuditBusy(false)
    }
  }

  async function actRegistry(action: 'promote' | 'deprecate', entry: RegistryEntry) {
    const modelId = String(entry.model_id || '')
    if (!modelId || acting) return
    setActing({ modelId, action })
    setActionError(null)
    try {
      const res = action === 'promote'
        ? await registry.promote(modelId)
        : await registry.deprecate(modelId)
      await Promise.allSettled([reg.refetch(), modelList.refetch()])
      const landed = res?.entry?.status
      toast(
        action === 'promote' ? 'Model promoted' : 'Model deprecated',
        `${modelId.slice(0, 8)}${landed ? ` · now ${String(landed)}` : ''}`,
        action === 'promote' ? 'done' : 'info',
      )
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      setActionError(msg)
      toast(action === 'promote' ? 'Promotion failed' : 'Deprecation failed', msg, 'error')
    } finally {
      setActing(null)
    }
  }

  /* ── lifecycle ─────────────────────────────────────────────────── */

  const runsLoading = runs.loading && !runs.data
  const regLoading = reg.loading && !reg.data
  const anyLoading = runsLoading || regLoading
  const traces: Trace[] = audit && audit.run && audit.run.id === auditFor && Array.isArray(audit.traces)
    ? audit.traces
    : []

  const activeStep = acting || auditFor || reopening
    ? 'next'
    : runList.length || regList.length
      ? 'produced'
      : 'entered'

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={BEAT.beat}
        chapter="Registry vault"
        title="History & Model Registry"
        tagline="Every run indexed with its traces, every model versioned and promotable. Click a run to reopen its context."
        icon={<Archive className="h-5 w-5 text-primary-500" />}
        right={
          <>
            {liveRun && tone(RUN_TONE, liveRun.status) === 'running' && (
              <StatusChip status="running">live run {liveRun.id.slice(0, 8)}</StatusChip>
            )}
            {historyDone === 'done' && <DoneChip text="Indexed" />}
            <Button
              size="sm"
              variant="secondary"
              onClick={refreshAll}
              disabled={refreshing}
              aria-busy={refreshing}
              className="whitespace-nowrap"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        }
      />

      {(runs.error || reg.error) && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status="warn">{runs.error ?? reg.error ?? 'request failed'}</StatusChip>
          <Button size="xs" variant="secondary" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {actionError && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status="warn">registry action failed — {actionError}</StatusChip>
        </div>
      )}

      {/* ── the two doors ─────────────────────────────────────────── */}
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* ── run ledger ──────────────────────────────────────────── */}
        <Panel
          title="Run ledger"
          right={
            <>
              <div className="flex items-center gap-1.5 rounded-button border border-border bg-panel2 px-2 py-1">
                <Search className="h-3.5 w-3.5 shrink-0 text-t-lo" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="dataset or run id"
                  aria-label="Search runs"
                  className="w-32 bg-transparent text-[12px] text-t-hi outline-none placeholder:text-t-lo"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-t-lo transition-colors hover:text-t-hi">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                {fmt(visibleRuns.length, 0)} / {fmt(runList.length, 0)}
              </span>
            </>
          }
          flush
        >
          {runsLoading ? (
            <div className="p-4"><LoadingState label="Indexing runs…" /></div>
          ) : runList.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No runs recorded yet"
                hint="The vault fills as soon as a dataset is run through the pipeline. Start one and it will be indexed here with its full trace."
                action={<Button size="sm" onClick={newRun}><Database className="h-4 w-4" /> Open the dataset library</Button>}
              />
            </div>
          ) : visibleRuns.length === 0 ? (
            <p className="p-4 text-[12px] text-t-lo">No run matches “{query}”.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[36rem]">
                <div className={cn(LEDGER_COLS, 'border-b border-border px-4 py-2')}>
                  {SORT_COLS.map((c, i) => {
                    const on = sort.key === c.key
                    const Caret = on ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        title={`Sort by ${c.label}`}
                        className={cn(
                          'flex items-center gap-1 text-left transition-colors hover:text-t-hi',
                          i === SORT_COLS.length - 1 && 'justify-end',
                          on ? 'text-t-hi' : 'text-t-lo',
                        )}
                      >
                        <SectionLabel className={on ? 'text-t-mid' : undefined}>{c.label}</SectionLabel>
                        <Caret className="h-3 w-3" />
                      </button>
                    )
                  })}
                  <SectionLabel className="text-right">traces</SectionLabel>
                </div>

                <div className="max-h-[30rem] overflow-y-auto">
                  {visibleRuns.map(run => {
                    const t = tone(RUN_TONE, run.status)
                    const total = n(run.total_stages) ?? 0
                    const done = stageCount(run)
                    const pct = total > 0 ? (done / total) * 100 : 0
                    const dur = durationMs(run)
                    const open = auditFor === run.id
                    const target = resumeTarget(run, null)
                    return (
                      <div key={run.id} className="border-b border-border last:border-0">
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            onClick={() => reopenAt(run)}
                            disabled={reopening !== null}
                            title={target ? `Reopen at ${target.label}` : 'Reopen this run'}
                            className={cn(
                              LEDGER_COLS,
                              'min-w-0 flex-1 px-4 py-2.5 text-left transition-colors hover:bg-panel2 disabled:cursor-wait disabled:opacity-60',
                              open && 'bg-panel2',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                {liveRunId === run.id && (
                                  <span className="rounded-button border border-primary-500/40 bg-primary-500/[0.06] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-500">
                                    active
                                  </span>
                                )}
                                <span className="truncate text-[13px] font-medium text-t-hi">{dsName(run.dataset_id)}</span>
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-t-lo">
                                <span>{run.id.slice(0, 8)}</span>
                                <span>·</span>
                                <span>{clock(run.started_at)}</span>
                                {run.completed_at && (<><span>→</span><span>{clock(run.completed_at)}</span></>)}
                                <span>·</span>
                                <span>{ms(dur)}</span>
                              </span>
                            </span>

                            <span className="min-w-0">
                              <Bar value={pct} className="w-full" tone={runBarTone(run.status)} />
                              <span className="mt-1 block font-mono text-[11px] text-t-lo">
                                {fmt(done, 0)}/{fmt(total, 0)} stages
                              </span>
                            </span>

                            <span className="min-w-0">
                              <StatusChip status={t}>{key(run.status) || 'unknown'}</StatusChip>
                              {reopening === run.id && (
                                <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-500">opening…</span>
                              )}
                            </span>

                            <span />
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleAudit(run)}
                            aria-expanded={open}
                            title={open ? 'Hide stage traces' : 'Inspect stage traces'}
                            className={cn(
                              'flex w-9 shrink-0 items-center justify-center border-l border-border text-t-lo transition-colors hover:bg-panel2 hover:text-t-hi',
                              open && 'bg-panel2 text-primary-500',
                            )}
                          >
                            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
                          </button>
                        </div>

                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div
                              key="audit"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-2.5 border-b border-border bg-panel2 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <SectionLabel>trace audit</SectionLabel>
                                  <StatusChip status={t}>{key(run.status) || 'unknown'}</StatusChip>
                                  <span className="font-mono text-[10px] text-t-lo">
                                    {run.id} · {run.dataset_id || 'no dataset'}
                                  </span>
                                  {target && (
                                    <Button
                                      size="xs"
                                      variant="secondary"
                                      className="ml-auto"
                                      disabled={reopening !== null}
                                      onClick={() => reopenAt(run)}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" /> Reopen at {target.label}
                                    </Button>
                                  )}
                                </div>

                                {run.error_message && (
                                  <p className="rounded-button border border-accent-rose/30 bg-accent-rose/10 px-2.5 py-1.5 text-[12px] leading-5 text-accent-rose">
                                    {run.error_message}
                                  </p>
                                )}

                                {auditBusy ? (
                                  <LoadingState label="Loading stage traces…" />
                                ) : auditError ? (
                                  <StatusChip status="warn">{auditError}</StatusChip>
                                ) : traces.length === 0 ? (
                                  <p className="text-[12px] text-t-lo">No stage traces were recorded for this run.</p>
                                ) : (
                                  <div className="overflow-hidden rounded-button border border-border bg-panel">
                                    <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_5.5rem_4.5rem] items-center gap-3 border-b border-border px-3 py-1.5">
                                      {['stage', 'status', 'elapsed', 'conf'].map(h => (
                                        <SectionLabel key={h} className={h === 'elapsed' || h === 'conf' ? 'text-right' : undefined}>{h}</SectionLabel>
                                      ))}
                                    </div>
                                    <div className="max-h-56 overflow-y-auto">
                                      {traces.map((tr, ti) => (
                                        <div
                                          key={tr.id || `${tr.stage_number}-${ti}`}
                                          className="grid grid-cols-[minmax(0,1fr)_8.5rem_5.5rem_4.5rem] items-center gap-3 border-b border-border px-3 py-1.5 last:border-0"
                                        >
                                          <span className="min-w-0">
                                            <span className="block truncate text-[12px] text-t-mid">
                                              {tr.stage_name || `Stage ${tr.stage_number}`}
                                            </span>
                                            {tr.decision && (
                                              <span className="mt-px block truncate font-mono text-[10px] text-t-lo">{tr.decision}</span>
                                            )}
                                          </span>
                                          <span><StatusChip status={tone(RUN_TONE, tr.status)}>{key(tr.status) || 'unknown'}</StatusChip></span>
                                          <span className="text-right font-mono text-[11px] text-t-mid">{ms(tr.duration_ms)}</span>
                                          <span className="text-right font-mono text-[11px] text-t-mid">
                                            {n(tr.confidence) === null ? '—' : `${fmt((n(tr.confidence) ?? 0) * 100, 0)}%`}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </Panel>

        {/* ── model registry ──────────────────────────────────────── */}
        <Panel
          title="Model registry"
          right={
            <>
              <div className="inline-flex rounded-button border border-border bg-panel2 p-0.5">
                {REG_FILTERS.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setRegFilter(f.key)}
                    aria-pressed={regFilter === f.key}
                    className={cn(
                      'rounded-button px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
                      regFilter === f.key ? 'bg-primary-500 text-white' : 'text-t-lo hover:text-t-hi',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          }
          flush
        >
          {regLoading ? (
            <div className="p-4"><LoadingState label="Opening the registry…" /></div>
          ) : regList.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No models registered yet"
                hint="A registry entry is written when a model is promoted. Run a prediction on a dataset and the versioned shelf appears here."
                action={<Button size="sm" onClick={() => go('/library')}><Database className="h-4 w-4" /> Open the dataset library</Button>}
              />
            </div>
          ) : shelves.length === 0 ? (
            <p className="p-4 text-[12px] text-t-lo">No entry matches the {regFilter} filter.</p>
          ) : (
            <div className="max-h-[30rem] overflow-y-auto">
              {shelves.map(shelf => {
                const head = modelById.get(shelf.modelId) ?? null
                const current = shelf.entries.find(e => e.is_current) ?? null
                return (
                  <div key={shelf.modelId} className="border-b border-border last:border-0">
                    <div className="flex items-center gap-2 bg-panel2 px-4 py-1.5">
                      <Layers className="h-3.5 w-3.5 shrink-0 text-t-lo" />
                      <span className="min-w-0 truncate text-[12px] font-semibold text-t-hi">
                        {head?.name || 'unnamed model'}
                      </span>
                      {head?.algorithm && (
                        <span className="shrink-0 font-mono text-[10px] text-t-lo">{head.algorithm}</span>
                      )}
                      {current && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-500">
                          <ShieldCheck className="h-3 w-3" /> v{fmt(n(current.version) ?? 0, 0)} current
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                        {fmt(shelf.entries.length, 0)} version{shelf.entries.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {shelf.entries.map(entry => {
                      const m = modelById.get(String(entry.model_id)) ?? null
                      const perf = perfOf(entry.performance_summary)
                      const st = key(entry.status)
                      const promoted = PROMOTED.has(st)
                      const deprecated = DEPRECATED.has(st)
                      const locked = acting !== null
                      const busy = acting?.modelId === entry.model_id ? acting.action : null
                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            'relative border-t border-border px-4 py-2.5',
                            entry.is_current && 'bg-primary-500/[0.04]',
                          )}
                        >
                          {entry.is_current && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary-500" />}

                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-button border border-border bg-panel2 px-1.5 py-px font-mono text-[10px] text-t-mid">
                                  v{fmt(n(entry.version) ?? 0, 0)}
                                </span>
                                {entry.is_current && (
                                  <span className="rounded-button border border-primary-500/40 bg-primary-500/[0.06] px-1.5 py-px text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-500">
                                    current
                                  </span>
                                )}
                                <span className="truncate font-mono text-[10px] text-t-lo" title={String(entry.model_id ?? '')}>
                                  {String(entry.model_id ?? '—').slice(0, 12)}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[12px] text-t-mid">
                                {m?.name || 'model not in the model store'}
                                <span className="text-t-lo"> · {dsName(entry.dataset_id)}</span>
                              </p>
                            </div>
                            <StatusChip status={tone(REG_TONE, entry.status)}>{st || 'unknown'}</StatusChip>
                          </div>

                          {perf.known > 0 ? (
                            <>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <MetricPill label="r²" value={fmt(perf.r2, 4)} accent="text-accent-emerald" />
                                <MetricPill label="rmse" value={fmt(perf.rmse, 3)} />
                                <MetricPill label="mae" value={fmt(perf.mae, 3)} />
                                <MetricPill label="mape" value={fmt(perf.mape, 2)} />
                              </div>
                              {perf.r2 !== null && (
                                <div className="mt-2 flex items-center gap-2">
                                  <Bar value={perf.r2 * 100} className="flex-1" tone={perf.r2 >= 0 ? 'emerald' : 'rose'} />
                                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">fit</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="mt-2 text-[11px] text-t-lo">No performance summary recorded for this version.</p>
                          )}

                          {entry.notes && (
                            <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-t-lo">{entry.notes}</p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Button
                              size="xs"
                              variant="success"
                              disabled={locked || promoted || deprecated}
                              onClick={() => actRegistry('promote', entry)}
                              title={promoted ? 'Already promoted' : deprecated ? 'A deprecated entry cannot be promoted' : 'Promote this model to production'}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {busy === 'promote' ? 'Promoting…' : promoted ? 'Promoted' : 'Promote'}
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              disabled={locked || deprecated}
                              onClick={() => actRegistry('deprecate', entry)}
                              title={deprecated ? 'Already deprecated' : 'Retire this version from the registry'}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              {busy === 'deprecate' ? 'Deprecating…' : 'Deprecate'}
                            </Button>
                            <span className="ml-auto font-mono text-[10px] text-t-lo">
                              {entry.promoted_at
                                ? `promoted ${clock(entry.promoted_at)}`
                                : entry.deprecated_at
                                  ? `retired ${clock(entry.deprecated_at)}`
                                  : `filed ${clock(entry.created_at)}`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {anyLoading && (
        <p className="flex items-center gap-2 text-[11px] text-t-lo">
          <FileText className="h-3.5 w-3.5" />
          {regLoading && runsLoading ? 'Indexing the vault…' : 'Finishing the vault index…'}
        </p>
      )}

      <ResultSummary
        verdict={
          runList.length === 0
            ? 'No runs indexed yet — every journey is recorded here with its traces and models.'
            : `${fmt(runList.length, 0)} runs indexed (${fmt(completedCount, 0)} completed), ${fmt(regList.length, 0)} model versions registered and promotable.`
        }
        facts={[
          { label: 'Runs', value: fmt(runList.length, 0) },
          { label: 'Completed', value: fmt(completedCount, 0) },
          { label: 'Models', value: fmt(regList.length, 0) },
        ]}
      />

      {hasLiveRun ? (
        <AutoNext to={CONTINUE_TO} label="Registry indexed — closing out the journey" />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-4 py-3">
          <p className="min-w-0 text-sm text-t-mid">{storyForStage(STAGE_KEY).next}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => go('/reports')}>
              <FileText className="h-4 w-4" /> Review reports
            </Button>
            <Button size="sm" onClick={newRun}>
              <Database className="h-4 w-4" /> Start a new run
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default HistoryPage
