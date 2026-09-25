import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import {
  Database, Upload, ScanSearch, ShieldCheck, Wand2, Cpu,
  BrainCircuit, Gauge, Lightbulb, AlertTriangle, Trophy,
  Target, Briefcase, FileText, History, Check, Lock,
  FileDown, PanelLeftClose, PanelLeft, ChevronDown, Volume2, VolumeX, Award,
} from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { WORKFLOW, useJourney, stagePath, MILESTONES, milestoneProgress } from '../lib/journey'
import type { WorkflowStage } from '../lib/journey'
import { soundEnabled, setSoundEnabled } from '../lib/sound'
import { B } from '../lib/kit'

export const STAGE_ICONS: Record<string, React.ComponentType<any>> = {
  library: Database, import: Upload, schema_discovery: ScanSearch,
  dq_engine: ShieldCheck, transformation: Wand2, feature_engineering: Cpu,
  prediction: BrainCircuit, confidence_gate: Gauge,
  shap: Lightbulb, anomaly: AlertTriangle, benchmarking: Trophy,
  recommendation: Target, executive_center: Briefcase, report: FileText, history_registry: History,
}

export const STAGE_COLORS: Record<string, string> = {
  library: '#4A9FD8', import: '#4A9FD8', schema_discovery: '#8D7BD8',
  dq_engine: '#4C5FD5', transformation: '#4C5FD5', feature_engineering: '#4C5FD5',
  prediction: '#5B6FE0', confidence_gate: '#5B6FE0',
  shap: '#4AC29A', anomaly: '#D8A648', benchmarking: '#D8A648', recommendation: '#D8A648',
  executive_center: '#4C5FD5', report: '#5B6FE0', history_registry: '#5B6FE0',
}

/* The "under the hood" detail shown on every node — the backend API /
   model powering each stage, so the rail reads as the full pipeline map. */
const STAGE_ENGINE: Record<string, { api: string; engine: string }> = {
  library: { api: 'GET /datasets', engine: 'storage' },
  import: { api: 'POST /import', engine: 'CSV · Excel' },
  schema_discovery: { api: 'GET /schema', engine: 'auto-type' },
  dq_engine: { api: 'POST /dq/run', engine: '8-dim repair' },
  transformation: { api: 'POST /transform', engine: 'raw → clean' },
  feature_engineering: { api: 'POST /features', engine: 'AI features' },
  prediction: { api: 'POST /train', engine: 'XGBoost · LightGBM' },
  confidence_gate: { api: 'POST /confidence', engine: 'trust gate' },
  shap: { api: 'GET /shap/{model}', engine: 'TreeExplainer' },
  anomaly: { api: 'POST /anomalies', engine: 'deviation scan' },
  benchmarking: { api: 'GET /benchmarks', engine: 'percentile rank' },
  recommendation: { api: 'POST /recommend', engine: 'evidence-weighted' },
  executive_center: { api: 'GET /executive', engine: 'CEO briefing' },
  report: { api: 'POST /report', engine: 'PDF · HTML · CSV' },
  history_registry: { api: 'GET /runs', engine: 'versions + verdicts' },
}

function statusFor(stageStatuses: Record<string, string>, key: string): string {
  return stageStatuses[key] || 'todo'
}

function routeKeyFor(pathname: string): string | null {
  const base = '/' + (pathname.split('/')[1] || '')
  return WORKFLOW.find(s => s.path.split('$')[0] === base || s.path === base)?.key || null
}

export function ProcessRail() {
  const location = useLocation()
  const navigate = useNavigate()
  const { datasetId, runId, modelId, stageStatuses } = useJourney()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('ecomind_rail', collapsed ? 'off' : 'on') } catch { /* ignore */ }
  }, [collapsed])

  const routeKey = routeKeyFor(location.pathname)
  const doneCount = WORKFLOW.filter(s => statusFor(stageStatuses, s.key) === 'done').length
  const pct = WORKFLOW.length ? (doneCount / WORKFLOW.length) * 100 : 0

  const stageReady = (key: string): boolean => {
    const stage = WORKFLOW.find(s => s.key === key)
    if (!stage) return false
    const reqName = stage.requires === 'dataset' ? 'dataset' : stage.requires === 'run' ? 'run' : stage.requires === 'model' ? 'model' : null
    if (!reqName) return true
    const missing = reqName === 'dataset' ? !datasetId : reqName === 'run' ? !runId : !modelId
    return !(missing && statusFor(stageStatuses, key) !== 'done')
  }

  const pathFor = (stage: WorkflowStage): string =>
    stagePath(stage, { datasetId: datasetId || '', runId: runId || '', modelId: modelId || '' })

  const nozzle = (key: string) => {
    if (!stageReady(key)) return
    const stage = WORKFLOW.find(s => s.key === key)!
    navigate({ to: pathFor(stage) as any })
  }

  const node = (stage: WorkflowStage, idx: number, total: number) => {
    const key = stage.key
    const st = statusFor(stageStatuses, key)
    const ready = stageReady(key)
    const active = key === routeKey
    const Icon = STAGE_ICONS[key]
    const meta = STAGE_ENGINE[key]
    const isLast = idx === total - 1
    const reqName = stage.requires === 'dataset' ? 'dataset' : stage.requires === 'run' ? 'run' : stage.requires === 'model' ? 'model' : null

    const bubble = (
      <span
        className={clsx(
          'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-button border font-mono text-[10px] transition-all',
          st === 'done'
            ? 'border-accent-emerald/40 bg-accent-emerald/15 text-accent-emerald'
            : active
              ? 'border-primary-500/50 bg-primary-500/15 text-primary-400 shadow-[0_0_12px_rgba(76,95,213,0.35)]'
              : ready
                ? 'border-white/[0.10] bg-white/[0.04] text-gray-400'
                : 'border-white/[0.06] bg-white/[0.02] text-gray-600',
        )}
      >
        {st === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : active ? <Icon className="h-3.5 w-3.5" /> : <span>{stage.index}</span>}
        {active && <span className="absolute -inset-px rounded-button border border-primary-500/40" />}
      </span>
    )

    const body = (
      <span
        title={`${stage.description}\n${st === 'locked' ? `Locked — needs a ${reqName} first` : meta ? `${meta.api} · ${meta.engine}` : ''}`}
        className={clsx(
          'group flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-button border px-2.5 py-2 text-left transition-all',
          active
            ? 'border-primary-500/35 bg-primary-500/[0.09]'
            : st === 'done'
              ? 'border-transparent hover:border-accent-emerald/25 hover:bg-accent-emerald/[0.06]'
              : ready
                ? 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.04]'
                : 'border-transparent opacity-55',
        )}
        onClick={() => nozzle(key)}
      >
        {bubble}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={clsx(
              'truncate text-[12px] font-semibold leading-tight',
              active ? 'text-primary-400' : st === 'done' ? 'text-gray-100' : 'text-gray-300',
            )}>
              {stage.short}
            </span>
            {st === 'locked' && <Lock className="h-3 w-3 shrink-0 text-gray-500" />}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[9.5px] tracking-tight text-gray-500">
            {st === 'locked' ? `needs ${reqName}` : meta?.api}
            <span className="hidden xl:inline"> · {meta?.engine}</span>
          </span>
        </span>
        {st !== 'done' && !active && (
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STAGE_COLORS[key] }} />
        )}
      </span>
    )

    return (
      <div key={key} className="relative">
        <div className="flex gap-3">
          <div className="flex w-6 flex-col items-center">
            {/* connector line + arrow going down to next stage */}
            {!isLast && (
              <div className="relative mt-1 flex flex-1 flex-col items-center">
                <span
                  className={clsx('h-full w-px', st === 'done' && statusFor(stageStatuses, WORKFLOW[idx + 1].key) === 'done' ? 'bg-accent-emerald/40' : 'bg-white/[0.10]')}
                />
                <span
                  className="absolute bottom-0 h-0 w-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent"
                  style={{ borderTopColor: st === 'done' ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.22)' }}
                />
              </div>
            )}
          </div>
          {body}
        </div>
      </div>
    )
  }

  /* collapsed slim rail: a vertical stack of status dots */
  if (collapsed) {
    return (
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-white/[0.06] bg-surface/40 py-3 backdrop-blur-sm">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand pipeline"
          className="mb-1 rounded-button p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {WORKFLOW.map(s => {
          const st = statusFor(stageStatuses, s.key)
          const active = s.key === routeKey
          return (
            <button
              key={s.key}
              title={`${s.label}${st === 'locked' ? ' (locked)' : ''}`}
              onClick={() => nozzle(s.key)}
              className={clsx(
                'relative h-4 w-4 rounded-full border transition-all',
                st === 'done' && 'border-accent-emerald/40 bg-accent-emerald',
                active && !(st === 'done') && 'border-primary-400 bg-primary-400 shadow-[0_0_10px_rgba(76,95,213,0.7)]',
                !(st === 'done') && !active && clsx('border-white/[0.12] bg-transparent'),
              )}
            />
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="relative flex w-72 shrink-0 flex-col border-r border-white/[0.06] bg-surface/40 backdrop-blur-sm">
      {/* rail header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-gray-500">pipeline</p>
          <p className="font-display text-sm font-semibold text-gray-100">Mission flow</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary-400">
            {doneCount}/{WORKFLOW.length}
          </span>
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse pipeline"
            className="rounded-button p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* overall progress */}
      <div className="border-b border-white/[0.06] px-3 py-2.5">
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-gray-500">
          <span>journey progress</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 via-accent-cyan to-accent-emerald shadow-[0_0_10px_rgba(76,95,213,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: B }}
          />
        </div>
      </div>

      {/* scrollable milestone flow */}
      <div className="scroll-design flex-1 overflow-y-auto px-2.5 py-3">
        {MILESTONES.map((m, mi) => {
          const prog = milestoneProgress(stageStatuses, m)
          const mActive = m.stages.some(k => k === routeKey)
          return (
            <div key={m.key} className="mb-4 last:mb-0">
              <div className="mb-1.5 flex items-center gap-2 px-1.5">
                <span className={clsx(
                  'flex h-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[9px] font-bold',
                  prog.done === prog.total
                    ? 'bg-accent-emerald/15 text-accent-emerald'
                    : mActive
                      ? 'bg-primary-500/15 text-primary-400 shadow-[0_0_10px_rgba(76,95,213,0.25)]'
                      : 'bg-white/[0.05] text-gray-500',
                )}>
                  {String(mi + 1).padStart(2, '0')}
                </span>
                <span className={clsx('font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em]',
                  mActive ? 'text-primary-400' : 'text-gray-500')}>
                  {m.short}
                </span>
                <span className="ml-auto font-mono text-[9px] text-gray-600">{prog.done}/{prog.total}</span>
              </div>
              <div className="rounded-button border border-white/[0.05] bg-white/[0.02] p-2">
                {m.stages.map((key, i) => node(WORKFLOW.find(s => s.key === key)!, i, m.stages.length))}
              </div>
              {mi < MILESTONES.length - 1 && (
                <div className="flex h-5 items-center justify-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-gray-600">
                  <ChevronDown className="h-3 w-3" />
                  <span>pipeline phase</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* rail footer */}
      <div className="space-y-1 border-t border-white/[0.06] p-2.5">
        <Link
          to="/reports"
          className="flex items-center gap-2 rounded-button border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[11px] font-medium text-gray-300 transition-colors hover:border-accent-rose/40 hover:bg-accent-rose/10 hover:text-accent-rose"
        >
          <FileDown className="h-3.5 w-3.5" /> Export audit report
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/scorecard"
            title="Per-stage examiner ratings"
            className="flex flex-1 items-center gap-2 rounded-button border border-white/[0.06] px-2.5 py-1.5 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.04] hover:text-gray-200"
          >
            <Award className="h-3.5 w-3.5 text-accent-gold" /> Scorecard
          </Link>
          <button
            onClick={() => setSoundEnabled(!soundEnabled())}
            title={soundEnabled() ? 'Mute stage sounds' : 'Enable stage sounds'}
            className={clsx('rounded-button border px-2.5 py-1.5 transition-colors',
              soundEnabled()
                ? 'border-accent-emerald/25 bg-accent-emerald/10 text-accent-emerald hover:bg-accent-emerald/20'
                : 'border-white/[0.06] text-gray-500 hover:bg-white/[0.04]')}
          >
            {soundEnabled() ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </nav>
  )
}