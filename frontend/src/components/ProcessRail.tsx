import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import {
  Database, Upload, ScanSearch, ShieldCheck, Wand2, Cpu,
  BrainCircuit, Gauge, Lightbulb, AlertTriangle, Trophy,
  Target, Briefcase, FileText, History, Check, Lock,
  FileDown, PanelLeftClose, PanelLeft, Volume2, VolumeX, Award,
} from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { WORKFLOW, useJourney, stagePath, MILESTONES, milestoneProgress, progressStats, PIPELINE_TOTAL } from '../lib/journey'
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

/* One calm accent for the whole rail — hierarchy comes from state
   (done / active / locked), not from a rainbow of stage hues. */
export const STAGE_COLORS: Record<string, string> = Object.fromEntries(
  Object.keys(STAGE_ICONS).map((k) => [k, '#4C5FD5']),
)

/* What each stage actually does — one plain-language tag, so the rail
   reads as a workflow map instead of an engineering index. */
const STAGE_ENGINE: Record<string, string> = {
  library: 'catalog',
  import: 'CSV · Excel',
  schema_discovery: 'column profiling',
  dq_engine: '12-rule repair',
  transformation: 'raw → clean',
  feature_engineering: 'ML-ready inputs',
  prediction: 'model training',
  confidence_gate: 'trust gate',
  shap: 'prediction explanation',
  anomaly: 'unusual behaviour',
  benchmarking: 'model ranking',
  recommendation: 'ranked actions',
  executive_center: 'briefing',
  report: 'PDF · HTML · CSV',
  history_registry: 'versions',
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
  const doneCount = progressStats(stageStatuses).done
  const pct = progressStats(stageStatuses).pct

  const stageReady = (key: string): boolean => {
    const stage = WORKFLOW.find(s => s.key === key)
    if (!stage) return false
    // SHAP resolves a model automatically given a dataset (modelId optional)
    const effective = key === 'shap' ? 'dataset' : stage.requires
    const reqName = effective === 'dataset' ? 'dataset' : effective === 'run' ? 'run' : effective === 'model' ? 'model' : null
    if (!reqName) return true
    const missing = reqName === 'dataset' ? !datasetId : reqName === 'run' ? !runId : !modelId
    return !(missing && statusFor(stageStatuses, key) !== 'done')
  }

  const pathFor = (stage: WorkflowStage): string =>
    stagePath(stage, {
      datasetId: datasetId || '',
      runId: runId || '',
      modelId: stage.key === 'shap' ? modelId || 'auto' : modelId || '',
    })

  const nozzle = (key: string) => {
    if (!stageReady(key)) return
    const stage = WORKFLOW.find(s => s.key === key)!
    navigate({ to: pathFor(stage) as any })
  }

  const node = (stage: WorkflowStage) => {
    const key = stage.key
    const st = statusFor(stageStatuses, key)
    const ready = stageReady(key)
    const active = key === routeKey
    const Icon = STAGE_ICONS[key]
    const engine = STAGE_ENGINE[key]
    const reqName = stage.requires === 'dataset' ? 'dataset' : stage.requires === 'run' ? 'run' : stage.requires === 'model' ? 'model' : null

    const done = st === 'done'
    const locked = st === 'locked'

    return (
      <button
        key={key}
        title={`${stage.label}${locked ? ` — needs a ${reqName} first` : ''}`}
        onClick={() => nozzle(key)}
        className={clsx(
          'group relative flex w-full items-center gap-2.5 rounded-button py-1.5 pl-2 pr-2 text-left transition-colors',
          active ? 'bg-primary-500/[0.07]' : ready ? 'hover:bg-panel2' : 'cursor-default opacity-55 hover:bg-panel2/50',
        )}
      >
        {active && (
          <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-primary-500" />
        )}
        <span
          className={clsx(
            'relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-semibold transition-colors',
            done
              ? 'border-accent-emerald/35 bg-accent-emerald/10 text-accent-emerald'
              : active
                ? 'border-primary-500/40 bg-primary-500/10 text-primary-500'
                : 'border-border bg-panel2 text-t-lo',
          )}
        >
          {done ? <Check className="h-3 w-3" strokeWidth={3} /> : locked ? <Lock className="h-3 w-3" /> : <Icon className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={clsx(
            'block truncate text-[12.5px] font-medium leading-tight',
            active ? 'text-t-hi' : done ? 'text-t-mid' : 'text-t-mid',
          )}>
            {stage.short}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] leading-none text-t-lo">
            {locked ? `needs ${reqName}` : engine}
          </span>
        </span>
      </button>
    )
  }

  /* collapsed slim rail: a labelled icon stack, not plain dots */
  if (collapsed) {
    return (
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-panel/70 py-3">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand pipeline"
          className="mb-1.5 rounded-button border border-border bg-panel p-2 text-t-mid transition-colors hover:text-t-hi"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {WORKFLOW.map(s => {
          const st = statusFor(stageStatuses, s.key)
          const active = s.key === routeKey
          const done = st === 'done'
          const locked = st === 'locked'
          const Icon = STAGE_ICONS[s.key]
          return (
            <button
              key={s.key}
              title={`${s.label}${locked ? ' (locked)' : ''}`}
              onClick={() => nozzle(s.key)}
              className={clsx(
                'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-button border transition-colors',
                active
                  ? 'border-primary-500/40 bg-primary-500/10 text-primary-500'
                  : done
                    ? 'border-accent-emerald/25 bg-accent-emerald/[0.08] text-accent-emerald'
                    : clsx('border-border bg-panel text-t-lo', locked && 'opacity-40'),
              )}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
            </button>
          )
        })}
        <div className="mt-auto flex w-full shrink-0 flex-col items-center gap-1.5 border-t border-border pt-2">
          <span className="rounded-full bg-panel3 px-2 py-0.5 font-mono text-[10px] font-semibold text-t-mid"
            title={`${doneCount} of ${PIPELINE_TOTAL} stages complete`}>
            {doneCount}/{PIPELINE_TOTAL}
          </span>
          <button
            onClick={() => setSoundEnabled(!soundEnabled())}
            title={soundEnabled() ? 'Mute stage sounds' : 'Enable stage sounds'}
            className="rounded-button p-1.5 text-t-lo transition-colors hover:bg-panel2 hover:text-t-hi"
          >
            {soundEnabled() ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </nav>
    )
  }

  return (
    <nav className="relative flex w-[264px] shrink-0 flex-col border-r border-border bg-panel/70">
      {/* rail header */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-t-lo">Pipeline</p>
          <p className="mt-0.5 text-[13px] font-semibold tracking-tight text-t-hi">
            {doneCount === PIPELINE_TOTAL ? 'All stages complete' : `${PIPELINE_TOTAL - doneCount} stage${PIPELINE_TOTAL - doneCount === 1 ? '' : 's'} remaining`}
          </p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse pipeline"
          className="rounded-button p-1.5 text-t-lo transition-colors hover:bg-panel2 hover:text-t-hi"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* overall progress */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-t-lo">
          <span>{doneCount}/{PIPELINE_TOTAL} done</span>
          <span className="font-semibold text-t-mid">{Math.round(pct)}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel3">
          <motion.div
            className="h-full rounded-full bg-primary-500"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: B }}
          />
        </div>
      </div>

      {/* milestone flow */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-3">
        {MILESTONES.map((m, mi) => {
          const prog = milestoneProgress(stageStatuses, m)
          const mActive = m.stages.some(k => k === routeKey)
          return (
            <div key={m.key} className="mb-1">
              <div className={clsx(
                'flex items-center gap-2 px-1.5 pb-1 pt-3',
                mi === 0 && 'pt-1',
              )}>
                <span className={clsx(
                  'text-[10px] font-semibold uppercase tracking-[0.14em]',
                  mActive ? 'text-primary-500' : 'text-t-lo',
                )}>
                  {m.short}
                </span>
                <span className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10px] tabular-nums text-t-lo">{prog.done}/{prog.total}</span>
              </div>
              <div className="flex flex-col">
                {m.stages.map(key => node(WORKFLOW.find(s => s.key === key)!))}
              </div>
            </div>
          )
        })}
      </div>

      {/* rail footer */}
      <div className="space-y-1 border-t border-border p-2.5">
        <Link
          to="/reports"
          className="flex items-center gap-2 rounded-button px-2.5 py-2 text-[12px] font-medium text-t-mid transition-colors hover:bg-panel2 hover:text-t-hi"
        >
          <FileDown className="h-3.5 w-3.5" /> Export report
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/scorecard"
            title="Per-stage examiner ratings"
            className="flex flex-1 items-center gap-2 rounded-button px-2.5 py-1.5 text-[12px] text-t-lo transition-colors hover:bg-panel2 hover:text-t-hi"
          >
            <Award className="h-3.5 w-3.5" /> Scorecard
          </Link>
          <button
            onClick={() => setSoundEnabled(!soundEnabled())}
            title={soundEnabled() ? 'Mute stage sounds' : 'Enable stage sounds'}
            className={clsx('rounded-button p-1.5 transition-colors',
              soundEnabled()
                ? 'text-accent-emerald hover:bg-panel2'
                : 'text-t-lo hover:bg-panel2 hover:text-t-hi')}
          >
            {soundEnabled() ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </nav>
  )
}
