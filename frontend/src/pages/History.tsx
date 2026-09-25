import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { History, RotateCcw, Database, FolderOpen, ExternalLink, X, ArrowUpCircle, Ban, Box } from 'lucide-react'
import { workflows, datasets, registry, models } from '../lib/api'
import type { Model, RegistryEntry } from '../lib/api'
import { useApi } from '../lib/hooks'
import { fmt, ErrorBox, EmptyBox, TraceSummary } from '../lib/pagekit'
import { useJourney, WORKFLOW, STAGE_BY_KEY, stagePath } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, PulseDot } from '../lib/kit'
import clsx from 'clsx'

const STATUS_BADGE: Record<string, string> = {
  production: 'bg-emerald-500/10 text-emerald-400',
  promoted: 'bg-emerald-500/10 text-emerald-400',
  deprecated: 'bg-rose-500/10 text-rose-400',
  draft: 'bg-gray-500/10 text-gray-400',
}

export function HistoryPage() {
  const { setActive, reopenRun } = useJourney()
  const navigate = useNavigate()
  const dsList = useApi<any>(() => datasets.list() as any, [])
  const runs = useApi<any>(() => workflows.list() as any, [])
  const reg = useApi<any>(() => registry.list() as any, [])
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [regOpen, setRegOpen] = useState<RegistryEntry | null>(null)
  const [regDetail, setRegDetail] = useState<Model | null>(null)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  async function openReg(entry: RegistryEntry) {
    setRegOpen(entry); setRegDetail(null); setRegError(null); setRegLoading(true)
    try {
      setRegDetail(await models.get(entry.model_id))
    } catch (e: any) {
      setRegError(String(e?.message || e))
    } finally { setRegLoading(false) }
  }

  async function act(mode: 'promote' | 'deprecate', entry: RegistryEntry) {
    setActing(mode + entry.model_id)
    try {
      const res = mode === 'promote'
        ? await registry.promote(entry.model_id)
        : await registry.deprecate(entry.model_id)
      const updated = res.entry
      setRegOpen(updated)
      if (regDetail) setRegDetail({ ...regDetail, status: updated.status, is_active: updated.status === 'production' ? true : regDetail.is_active })
      await reg.refetch()
    } catch (e: any) {
      setRegError(String(e?.message || e))
    } finally { setActing(null) }
  }

  async function reopen(runId: string) {
    setOpenId(runId); setDetail(null); setLoadingDetail(true)
    try {
      const res: any = await workflows.get(runId)
      setDetail(res)
    } catch { } finally { setLoadingDetail(false) }
  }

  async function openRun(runId: string) {
    const ctx = await reopenRun(runId)
    if (!ctx) return
    const det: any = await workflows.get(runId)
    const run = det?.run || {}
    const completed: string[] = run.stages_completed || []
    const full = run.status === 'completed' || (completed.length || 0) >= WORKFLOW.length
    const lastKey = WORKFLOW.map(s => s.key).filter(k => completed.includes(k)).pop()
    if (!lastKey || full) { navigate({ to: '/executive' }); return }
    const stage = STAGE_BY_KEY[lastKey]
    navigate({ to: stagePath(stage, { datasetId: ctx.datasetId || undefined, runId }) })
  }

  const dsName = (id: string) => dsList.data?.datasets?.find((d: any) => d.id === id)?.name || id.slice(0, 8)
  const runList = (runs.data?.runs || []) as any[]
  const regList = (reg.data?.models || []) as any[]
  const open = detail?.run as any
  const traces = (detail?.traces || []) as any[]

  const completed = runList.filter((r: any) => r.status === 'completed')

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 15 · History & Model Registry"
        title="History & Model Registry"
        tagline="Every journey is versioned. Reopen any past run — trace, trust score and verdict included."
        icon={<History className="h-6 w-6 text-primary-400" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Runs" value={runList.length} hint="all journeys" accent />
        <FlowStat label="Completed" value={completed.length} hint="finished end-to-end" />
        <FlowStat label="Stages" value={runList.reduce((a: number, r: any) => a + (r.stages_completed?.length || 0), 0)} hint="total stage executions" />
        <FlowStat label="Registry" value={regList.length} hint="promoted models" />
      </div>

      {runs.error && <ErrorBox message={runs.error} onRetry={runs.refetch} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Reveal delay={0.05}>
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Interaction timeline</p>
                <span className="text-xs font-mono text-gray-400">dataset version · model version · trust</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {runList.map((r: any, i: number) => {
                  const running = r.status === 'running'
                  return (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}>
                      <button onClick={() => reopen(r.id)}
                        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
                        <PulseDot color={running ? 'bg-accent-amber' : 'bg-accent-emerald'}
                          ping={running ? 'bg-accent-amber/60' : 'bg-accent-emerald/60'} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-200 truncate">{dsName(r.dataset_id)}</p>
                          <p className="text-xs font-mono text-gray-400">
                            v{r.config?.dataset_version || '1'} · {r.stages_completed?.length || 0}/{r.total_stages} stages ·{' '}
                            <span className="text-primary-300">
                              {typeof r.total_stages === 'number' && r.total_stages > 0
                                ? Math.round(((r.stages_completed?.length || 0) / r.total_stages) * 100) + '%'
                                : '—'}
                            </span>
                            {r.error_message ? ' · ' + r.error_message : ''}
                          </p>
                        </div>
                        <span className={clsx('rounded-full px-2 py-0.5 text-xs font-mono',
                          running ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400')}>
                          {running ? 'RUNNING' : r.status}
                        </span>
                        <span className="font-mono text-xs text-gray-400">{new Date(r.started_at).toLocaleString()}</span>
                        <FolderOpen className="h-4 w-4 text-gray-400" />
                      </button>

                      <AnimatePresence>
                        {openId === r.id && loadingDetail && !detail && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            <p className="px-4 pb-3 text-xs text-primary-400 font-mono">loading traces…</p>
                          </motion.div>
                        )}
                        {openId === r.id && open && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="space-y-2 overflow-hidden px-4 pb-4">
                            <div className="flex flex-wrap gap-2 pt-1">
                              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-gray-400">started {new Date(open.started_at).toLocaleString()}</span>
                              {open.completed_at && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-gray-400">completed {new Date(open.completed_at).toLocaleString()}</span>}
                              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-gray-400">trace count {traces.length}</span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                              <button onClick={() => openRun(r.id)}
                                className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_14px_rgba(76,95,213,0.25)] transition-shadow hover:shadow-[0_0_22px_rgba(76,95,213,0.45)]">
                                <ExternalLink className="h-3.5 w-3.5" /> Open in journey
                              </button>
                              <span className="text-xs font-mono text-gray-400">deep-link restores dataset · run · model context</span>
                            </div>
                            <StageTimingStrip traces={traces} totalMs={runDurationMs(open)} />
                            <div className="space-y-1.5">
                              {traces.map((t: any, ti: number) => (
                                <TraceSummary key={t.id || ti} res={{ trace: t }} stageName={t.stage_name || `Stage ${t.stage_number}`} />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
                {!runList.length && <EmptyBox title="No journeys recorded yet." hint="Run an analysis from the Library to start the history." />}
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.08}>
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <Database className="h-4 w-4 text-primary-400" />
              <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Model Registry</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {regList.map((m: any, i: number) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <button onClick={() => openReg(m)}
                    className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm text-gray-200 truncate">
                        {m.is_current && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-mono text-amber-400">CURRENT</span>}
                        {m.model_id?.slice(0, 8)}
                      </p>
                      <p className="text-xs font-mono text-gray-400">v{m.version} · {m.status}{m.promoted_at ? ` · ${new Date(m.promoted_at).toLocaleDateString()}` : ''}</p>
                      <ScoreSpark m={m} />
                    </div>
                    <span className="flex items-center gap-1.5">
                      <span className={clsx('rounded-full px-2 py-0.5 text-xs font-mono', STATUS_BADGE[m.status] ?? 'bg-gray-500/10 text-gray-400')}>
                        {m.status}
                      </span>
                      <Box className="h-4 w-4 text-gray-400 transition-colors group-hover:text-primary-400" />
                    </span>
                  </button>
                </motion.div>
              ))}
              {!regList.length && <EmptyBox title="No models registered yet." hint="Promote a winner from Prediction." />}
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.12}>
        <div className="glass-panel flex flex-wrap items-center gap-3">
          <RotateCcw className="h-4 w-4 text-accent-amber" />
          <p className="text-sm text-gray-300">Want to run it all again on a fresh dataset?</p>
          <span className="ml-auto inline-flex items-center gap-2 rounded-button bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400"
            onClick={() => setActive(null, null, null)}>
            Back to the Library
          </span>
        </div>
      </Reveal>

      {/* Registry detail drawer */}
      <AnimatePresence>
        {regOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setRegOpen(null)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.28, ease: 'easeOut' }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/[0.08] bg-[var(--panel2)] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary-400" />
                  <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Registry detail</p>
                </div>
                <button onClick={() => setRegOpen(null)} className="rounded-button p-1.5 text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 px-5 py-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-semibold text-gray-100">{regOpen.model_id}</h3>
                    {regOpen.is_current && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-mono text-amber-400">CURRENT</span>}
                    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-mono', STATUS_BADGE[regOpen.status] ?? 'bg-gray-500/10 text-gray-400')}>
                      {regOpen.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-mono text-gray-500">
                    {regDetail?.algorithm || 'model'} · {regDetail?.task_type || regOpen.dataset_id} · v{regOpen.version}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {regOpen.promoted_at && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-gray-400">promoted {new Date(regOpen.promoted_at).toLocaleString()}</span>}
                    {regOpen.deprecated_at && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-gray-400">deprecated {new Date(regOpen.deprecated_at).toLocaleString()}</span>}
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-gray-400">registered {new Date(regOpen.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-mono uppercase tracking-[0.18em] text-gray-500">Performance</p>
                  {regLoading ? (
                    <p className="text-xs font-mono text-primary-400">loading model detail…</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        const ps: any = regOpen.performance_summary || {}
                        const mtr: any = regDetail?.metrics || {}
                        const rows = [
                          ['R²', mtr.r2 ?? ps.r2], ['RMSE', mtr.rmse ?? ps.rmse],
                          ['MAE', mtr.mae ?? ps.mae], ['MAPE', mtr.mape ?? ps.mape],
                        ]
                        return rows.map(([label, val]) => (
                          <div key={label} className="rounded-button bg-white/[0.03] px-3 py-2">
                            <p className="text-xs font-mono uppercase text-gray-500">{label}</p>
                            <p className="font-mono text-sm font-semibold text-gray-100">
                              {typeof val === 'number' ? (label === 'RMSE' || label === 'MAE' ? val.toLocaleString(undefined, { maximumFractionDigits: 3 }) : val.toFixed(4)) : '—'}
                            </p>
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                  {regDetail?.training_time_seconds !== undefined && (
                    <p className="mt-2 text-xs font-mono text-gray-600">
                      trained on {regDetail.training_rows ?? '—'} rows · {regDetail.training_time_seconds.toFixed(2)}s
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-mono uppercase tracking-[0.18em] text-gray-500">Hyperparameters</p>
                  {regLoading ? (
                    <p className="text-xs font-mono text-primary-400">loading…</p>
                  ) : regDetail?.hyperparameters && Object.keys(regDetail.hyperparameters).length ? (
                    <div className="space-y-1">
                      {Object.entries(regDetail.hyperparameters).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between rounded-button bg-white/[0.02] px-3 py-1.5">
                          <span className="text-xs font-mono text-gray-500">{k}</span>
                          <span className="max-w-[55%] truncate font-mono text-xs text-gray-200">{fmt(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600">Not available for this model.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-mono uppercase tracking-[0.18em] text-gray-500">Notes</p>
                  <p className="rounded-button bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-gray-400">
                    {regOpen.notes || 'No notes recorded for this registry entry.'}
                  </p>
                </div>

                {regError && regDetail && (
                  <p className="text-xs text-rose-400">{regError}</p>
                )}

                <div className="flex items-center gap-2 border-t border-white/[0.06] pt-4">
                  <button
                    onClick={() => act('promote', regOpen)}
                    disabled={acting !== null || regOpen.is_current || regOpen.status === 'production' || regOpen.status === 'promoted'}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-button bg-gradient-to-r from-accent-emerald to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-[0_0_18px_rgba(91,111,224,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowUpCircle className={clsx('h-4 w-4', acting === 'promote' + regOpen.model_id && 'animate-pulse')} />
                    {acting === 'promote' + regOpen.model_id ? 'Promoting…' : regOpen.is_current || regOpen.status === 'production' || regOpen.status === 'promoted' ? 'Promoted' : 'Promote to production'}
                  </button>
                  <button
                    onClick={() => act('deprecate', regOpen)}
                    disabled={acting !== null || regOpen.status === 'deprecated'}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-button border border-rose-500/30 px-4 py-2.5 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Ban className={clsx('h-4 w-4', acting === 'deprecate' + regOpen.model_id && 'animate-pulse')} />
                    {acting === 'deprecate' + regOpen.model_id ? 'Deprecating…' : regOpen.status === 'deprecated' ? 'Deprecated' : 'Deprecate'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}

export default HistoryPage

function runDurationMs(run: any): number | null {
  if (!run || !run.completed_at || !run.started_at) return null
  const s = new Date(run.started_at).getTime()
  const e = new Date(run.completed_at).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null
  return e - s
}

function ScoreSpark({ m }: { m: any }) {
  const ps: any = m?.performance_summary || {}
  const r2 = typeof ps?.r2 === 'number' ? ps.r2 : undefined
  if (r2 === undefined) return null
  const pct = Math.max(0, Math.min(100, r2 * 100))
  return (
    <div className="mt-1 flex w-28 items-center gap-1.5" title={`R² ${r2.toFixed(4)}`}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-cyan"
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }}
        />
      </div>
      <span className="font-mono text-[11px] text-primary-300">{r2.toFixed(3)}</span>
    </div>
  )
}

function StageTimingStrip({ traces, totalMs }: { traces: any[]; totalMs: number | null }) {
  const items = (traces || []).filter(t => typeof t?.duration_ms === 'number' && t.duration_ms >= 0)
  if (!items.length) return null
  const max = Math.max(...items.map(t => t.duration_ms), 1)
  const avg = items.reduce((a, t) => a + t.duration_ms, 0) / items.length
  const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center gap-2">
        <p className="text-xs font-mono text-gray-400">stage timing</p>
        <p className="ml-auto font-mono text-xs text-gray-400">
          {totalMs !== null ? `total ${fmtMs(totalMs)}` : ''}{totalMs !== null ? ' · ' : ''}avg {fmtMs(avg)}
        </p>
      </div>
      {items.map((t, i) => (
        <div key={t.id || i} className="flex items-center gap-2">
          <span className="w-12 shrink-0 font-mono text-[11px] text-gray-400">{t.stage_name || `S${t.stage_number}`}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-cyan"
              initial={{ width: 0 }}
              animate={{ width: `${(t.duration_ms / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.03 }}
            />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-[11px] text-gray-400">{fmtMs(t.duration_ms)}</span>
        </div>
      ))}
    </div>
  )
}