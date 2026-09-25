import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Rocket, Database, AlertTriangle, Download, Activity,
  Check, Loader2, Play,
} from 'lucide-react'
import {
  datasets, schema, dq, transformations, features, models, ai, anomalies,
  benchmarks, recommendations, reports, workflows,
} from '../lib/api'
import { useJourney, CORE_WORKFLOW, runJourneyToCompletion } from '../lib/journey'
import { firePageRipple, RippleButton, B } from '../lib/kit'
import { STAGE_ICONS, STAGE_COLORS } from '../components/ProcessRail'
import { EcoMindLogo } from '../lib/logo'
import clsx from 'clsx'

/* ── helpers ─────────────────────────────────────────── */
const fmt = (n: any, d = 2) => {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return v.toLocaleString(undefined, { maximumFractionDigits: d })
}
const short = (id?: string) => (id ? id.slice(0, 8) : '')

/* Real, per-stage data rendered inside each terminal station. Every fetcher
   talks to the live backend so the automation board shows genuine evidence. */
type Fetcher = (dsId: string) => Promise<string[]>

const STATION_FETCHERS: Record<string, Fetcher> = {
  library: async () => {
    const r: any = await datasets.list()
    const d = r?.datasets || []
    return [`datasets in library: ${d.length}`, ...d.slice(0, 4).map((x: any) => `• ${x.name || short(x.id)} (${x.row_count ?? '?'} rows)`)]
  },
  import: async (dsId) => {
    const r: any = await datasets.get(dsId)
    const d = r?.dataset || r || {}
    return [`row_count: ${fmt(d.row_count, 0)}`, `column_count: ${fmt(d.column_count, 0)}`, `size: ${d.size ? `${Math.round(d.size / 1024)} KB` : '—'}`]
  },
  schema_discovery: async (dsId) => {
    const r: any = await schema.get(dsId)
    const cols = (r?.columns || r?.schema || []).slice(0, 5)
    return [`columns discovered: ${(r?.columns || []).length || '—'}`, ...cols.map((c: any) => `• ${c.name || c.column} :: ${(c.type || c.data_type)} (${Math.round((c.confidence ?? 1) * 100)}% conf)`)]
  },
  dq_engine: async (dsId) => {
    const r: any = await dq.get(dsId)
    const score = r?.overall_score ?? r?.score ?? 0
    return [`overall quality: ${Math.round(Number(score) * 100)}%`, `dimensions: ${(r?.dimensions || []).length || 8}`, `status: ${r?.status || 'scanned'}`]
  },
  transformation: async (dsId) => {
    const r: any = await transformations.list(dsId)
    const t = r?.transformations || []
    return [`transformations applied: ${t.length}`, ...t.slice(0, 4).map((x: any) => `• ${x.operation || x.type}${x.created_at ? ' — ok' : ''}`)]
  },
  feature_engineering: async (dsId) => {
    const r: any = await features.list(dsId)
    const f = r?.features || []
    return [`engineered features: ${f.length}`, ...f.slice(0, 5).map((x: any) => `• ${x.name} (imp ${fmt((Number(x.importance_score) || 0) * 100)}%)`)]
  },
  prediction: async (dsId) => {
    const r: any = await models.list()
    const mine = (r?.models || []).filter((m: any) => m.dataset_id === dsId || !m.dataset_id)
    return [`models trained: ${mine.length}`, ...mine.slice(0, 4).map((m: any) => `• ${m.algorithm || m.name}: r2 ${fmt(m.r2 ?? m.metrics?.r2, 4)}`)]
  },
  confidence_gate: async (dsId) => {
    const r: any = await ai.evaluate(dsId, {})
    const g = r?.gate || r?.data?.gate || {}
    return [`trust score: ${fmt((g.trust_score ?? 0) * 100)}%`, `verdict: ${g.verdict || '—'}`, `model_ref: ${g.model_id ? short(g.model_id) : 'n/a'}`]
  },
  shap: async (dsId) => {
    const r: any = await models.list()
    const mine = (r?.models || []).filter((m: any) => m.dataset_id === dsId || !m.dataset_id)
    const m = mine[0]
    return [`best model: ${m ? m.algorithm || m.name : '—'}`, `model_id: ${m ? short(m.id) : '—'}`, 'explanations: computed per prediction']
  },
  anomaly: async (dsId) => {
    const r: any = await anomalies.list(dsId)
    const a = (r?.anomalies || r?.items || [])
    return [`anomalies found: ${a.length}`, `severity: ${JSON.stringify(r?.by_severity || {})}`, r?.note ? r.note : `reviewing ${Math.min(a.length, 12)} most recent`]
  },
  benchmarking: async (dsId) => {
    const r: any = await benchmarks.list(dsId)
    const lb = r?.leaderboard || []
    return [`contenders ranked: ${lb.length}`, ...lb.slice(0, 5).map((x: any) => `• ${x.name || x.algorithm}: ${fmt(x.total_score, 1)}/100`)]
  },
  recommendation: async (dsId) => {
    const r: any = await recommendations.list(dsId)
    const recs = r?.recommendations || []
    return [`recommendations: ${recs.length}`, ...recs.slice(0, 5).map((x: any) => `• ${x.title || x.action?.summary || 'action'}`)]
  },
  executive_center: async (dsId) => {
    const r: any = await ai.executive(dsId)
    const s = r?.summary || r || {}
    return [`headline: ${s.headline || s.summary || '—'}`, `trust: ${fmt((s.trust?.trust_score ?? s.trust_score ?? 0) * 100)}%`, `best model: ${typeof s.best_model === 'string' ? s.best_model : s.best_model?.name || '—'}`]
  },
}

interface Station {
  key: string
  data: string[]
  lines: string[]
  state: 'waiting' | 'active' | 'done'
  ms: number
}

export function AutomatedPage() {
  const navigate = useNavigate()
  const { datasetId, setActive } = useJourney()
  const [runId, setRunId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nowIdx, setNowIdx] = useState(-1)
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportName, setReportName] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [stations, setStations] = useState<Station[]>(() => CORE_WORKFLOW.map(s => ({ key: s.key, data: [], lines: [], state: 'waiting' as const, ms: 0 })))

  const dsName = useMemo(() => datasetId, [datasetId])

  /* guard: automation needs a dataset */
  useEffect(() => {
    if (!datasetId) navigate({ to: '/library' } as any)
  }, [datasetId, navigate])

  const mark = (key: string, state: Station['state']) => {
    setStations(prev => prev.map(st => (st.key === key ? { ...st, state } : st)))
  }

  /* single live telemetry pull for the station that just went alive;
     the authoritative trace lines are written by onStageDone */
  useEffect(() => {
    if (!running || !datasetId || nowIdx < 0 || nowIdx >= CORE_WORKFLOW.length) return
    const cur = CORE_WORKFLOW[nowIdx]
    const f = STATION_FETCHERS[cur.key]
    if (!f) return
    let stopped = false
    void f(datasetId).then((lines) => {
      if (stopped) return
      setStations(prev => prev.map(st => (st.key === cur.key && st.state === 'active' && st.lines.length === 0 ? { ...st, data: lines, lines } : st)))
    }).catch(() => { /* keep placeholder lines */ })
    return () => { stopped = true }
  }, [running, datasetId, nowIdx])

  /* start automation */
  const launch = async () => {
    if (!datasetId || busy || running) return
    setBusy(true)
    setError(null)
    setReportId(null)
    setReportName(null)
    firePageRipple()
    try {
      const r: any = await workflows.start({ dataset_id: datasetId })
      const rid: string = r?.run?.id
      setRunId(rid)
      setActive(datasetId, rid)
      setStations(CORE_WORKFLOW.map(s => ({ key: s.key, data: [], lines: [], state: 'waiting', ms: 0 })))
      setRunning(true)
      setNowIdx(0)
      mark(CORE_WORKFLOW[0].key, 'active')
      void runJourneyToCompletion(rid, {
        onStep: (_stage, i) => {
          setNowIdx(i)
          setStations(prev => {
            const next = prev.map((st, si) => ({ ...st, state: si === i ? 'active' as const : si < i ? 'done' as const : 'waiting' as const }))
            return next
          })
        },
        onStageDone: async (stage) => {
          if (stage.key === 'report' || stage.key === 'history_registry') return
          try {
            const tr = await workflows.traces(rid) as any
            const traces = tr?.traces || []
            const last = [...traces].reverse().find((t: any) => t.stage_key === stage.key)
            const out = last?.output ?? (last ? { status: last.status } : {})
            const lines = typeof out === 'string' ? [out] : Object.entries(out || {}).slice(0, 6).map(([k, v]: any) => {
              if (v === null || v === undefined) return `${k}: —`
              if (typeof v === 'object') return `${k}: ${Array.isArray(v) ? `${v.length} entries` : Object.keys(v).length ? '{…}' : '{}'}`
              return `${k}: ${typeof v === 'number' ? fmt(v, 4) : String(v)}`
            })
            setStations(prev => prev.map(st => (st.key === stage.key ? { ...st, lines: lines.length ? lines : st.lines, data: lines.length ? lines : st.data } : st)))
          } catch { /* keep live lines */ }
          mark(stage.key, 'done')
        },
        onDone: async () => {
          setRunning(false)
          setNowIdx(CORE_WORKFLOW.length)
          setStations(prev => prev.map(st => ({ ...st, state: 'done' as const })))
          setTimeout(() => navigate({ to: '/journey-complete' } as any), 900)
        },
        onError: (e: any) => {
          setRunning(false)
          setError(e?.message || 'A stage failed — open History for details')
          mark((CORE_WORKFLOW[Math.max(0, nowIdx)]).key, 'done')
        },
      })
    } catch (e: any) {
      setError(e?.message || 'Could not start the run')
      setRunning(false)
    } finally {
      setBusy(false)
    }
  }

  /* generate the audit report once the journey completes */
  const generateAndDownload = async () => {
    if (!datasetId || generating) return
    setGenerating(true)
    setError(null)
    try {
      if (reportId) {
        await reports.download(reportId, reportName || 'ecomind-report.html')
        return
      }
      const r: any = await reports.generate({ dataset_id: datasetId, format: 'html' })
      const rep = r?.report || r?.reports?.[0]
      if (!rep) throw new Error('Report generation returned nothing')
      setReportId(rep.id)
      setReportName(rep.file_name || rep.name || 'ecomind-report.html')
      await reports.download(rep.id, rep.file_name || rep.name || 'ecomind-report.html')
    } catch (e: any) {
      setError(e?.message || 'Report generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const doneCount = stations.filter(s => s.state === 'done').length

  const FlowMontage = () => (
    <div className="mt-6 grid grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {CORE_WORKFLOW.map((st, i) => {
        const s = stations.find(x => x.key === st.key)!
        const Icon = STAGE_ICONS[st.key]
        const color = STAGE_COLORS[st.key]
        const show = s.state !== 'waiting'
        const lines = s.lines.length ? s.lines.slice(0, 5) : s.data.length ? s.data.slice(0, 5) : []
        return (
          <motion.div
            key={st.key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={clsx(
              'flex flex-col overflow-hidden rounded-card border transition-all duration-300',
              s.state === 'active' && 'border-primary-500/50 bg-primary-500/[0.06] shadow-[0_0_30px_rgba(76,95,213,0.25)]',
              s.state === 'done' && 'border-accent-emerald/30 bg-black/20',
              s.state === 'waiting' && 'border-white/[0.05] bg-black/10 opacity-60',
            )}
          >
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
              <span
                className="flex h-[22px] w-[22px] items-center justify-center rounded-md border font-mono text-[9px] font-bold"
                style={{ borderColor: `${color}66`, color, background: `${color}18` }}
              >
                {s.state === 'done' ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <Icon className="h-3.5 w-3.5" style={{ color }} />
              <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-gray-200">{st.short}</span>
              <span className="ml-auto">
                {s.state === 'active' && (
                  <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-accent-amber">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-amber" /> live
                  </span>
                )}
                {s.state === 'done' && <span className="font-mono text-[9px] uppercase tracking-widest text-accent-emerald">✓ done</span>}
              </span>
            </div>

            {/* terminal body */}
            <div className="h-[150px] overflow-hidden bg-black/30 px-3 py-2 font-mono text-[10px] leading-[1.7]">
              {s.state === 'waiting' && (
                <p className="text-gray-600">// queued — waiting for prior stages…</p>
              )}
              {s.state === 'active' && (
                <>
                  <p className="flex items-center gap-1.5 text-accent-amber">
                    <Loader2 className="h-3 w-3 animate-spin" /> processing stage…
                  </p>
                  {lines.length ? (
                    <div className="mt-1 space-y-0.5 overflow-hidden">
                      {lines.map((ln, li) => (
                        <motion.p key={li} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: li * 0.08 }}
                          className={clsx('truncate', li === 0 ? 'text-gray-200' : 'text-gray-400')}>
                          {ln}
                        </motion.p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-gray-500">fetching live telemetry…</p>
                  )}
                </>
              )}
              {s.state === 'done' && (
                <div className="space-y-0.5 overflow-hidden">
                  {lines.length ? lines.map((ln, li) => (
                    <p key={li} className={clsx('truncate', li === 0 ? 'text-accent-emerald' : 'text-gray-400')}>{ln}</p>
                  )) : (
                    <p className="text-gray-500">completed — no output recorded</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* ── command strip ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-2.5">
          <EcoMindLogo size={26} />
          <div>
            <p className="flex items-center gap-2 font-display text-sm font-bold text-gray-100">
              Automation Deck <Rocket className="h-3.5 w-3.5 text-primary-400" />
            </p>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-gray-500">
              13-stage explainable pipeline · one live board
            </p>
          </div>
        </div>

        <span className="h-6 w-px bg-white/[0.08]" />

        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 font-mono text-[11px] text-gray-300">
          <Database className="h-3 w-3 text-accent-cyan" /> dataset · {dsName ? short(dsName) : '—'}
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-gray-400">
          {running ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-amber" />
              advancing {Math.max(0, Math.min(nowIdx, CORE_WORKFLOW.length)) + 1}/{CORE_WORKFLOW.length}
            </>
          ) : doneCount === CORE_WORKFLOW.length ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald" /> pipeline complete × 13
            </>
          ) : (
            <>idle — press launch</>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link to="/library" className="flex items-center gap-1.5 rounded-button border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/[0.04]">
            <Database className="h-3.5 w-3.5" /> Change dataset
          </Link>
          {doneCount === CORE_WORKFLOW.length && (
            <RippleButton
              onClick={generateAndDownload}
              loading={generating}
              className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-accent-emerald to-primary-500 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all hover:shadow-[0_0_28px_rgba(52,211,153,0.45)] disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {generating ? 'Generating…' : reportId ? 'Download report' : 'Generate audit report'}
            </RippleButton>
          )}
          <RippleButton
            onClick={launch}
            loading={busy || running}
            disabled={!datasetId}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(76,95,213,0.35)] transition-all hover:shadow-[0_0_30px_rgba(76,95,213,0.55)] disabled:opacity-50"
          >
            {busy || running ? <Loader2 className="h-4 w-4 animate-spin" /> : running ? <Activity className="h-4 w-4 animate-pulse" /> : <Play className="h-4 w-4" />}
            {busy ? 'Creating run…' : running ? 'Automation running' : 'Launch automation'}
          </RippleButton>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-button border border-accent-rose/40 bg-accent-rose/10 px-4 py-2.5 text-xs text-accent-rose">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {!running && doneCount === 0 && (
        <div className="mt-8 flex flex-1 flex-col items-center justify-center rounded-card border border-white/[0.05] bg-black/10 px-6 py-14 text-center">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: B }}>
            <Rocket className="mx-auto h-12 w-12 text-primary-400/70" />
          </motion.div>
          <h2 className="mt-4 font-display text-lg font-bold text-gray-100">Automation Deck is idle</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">
            Hit <span className="font-semibold text-primary-300">Launch automation</span> to run the entire
            13-stage explainable pipeline in one place. Every terminal streams its real backend output live,
            and when the run finishes you can download an audit-ready report in one click.
          </p>
        </div>
      )}

      {(running || doneCount > 0) && <FlowMontage />}
    </div>
  )
}

export default AutomatedPage