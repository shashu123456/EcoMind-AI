import { Link, useLocation } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Database, Upload, Eye, ScanSearch, ShieldCheck, Wand2, Cpu,
  BrainCircuit, Gauge, GitCompare, Lightbulb, AlertTriangle, Trophy,
  Target, Briefcase, FileText, History, Check, Zap, Radio, FileDown,
  ChevronDown, Lock,
} from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { WORKFLOW, useJourney, stagePath, MILESTONES, PASSTHROUGH_KEYS, milestoneProgress } from '../lib/journey'
import { B } from '../lib/kit'

export const STAGE_ICONS: Record<string, React.ComponentType<any>> = {
  library: Database, import: Upload, raw_preview: Eye, schema_discovery: ScanSearch,
  dq_engine: ShieldCheck, transformation: Wand2, feature_engineering: Cpu,
  prediction: BrainCircuit, confidence_gate: Gauge, raw_vs_processed: GitCompare,
  shap: Lightbulb, anomaly: AlertTriangle, benchmarking: Trophy,
  recommendation: Target, executive_center: Briefcase, report: FileText, history_registry: History,
}

export const STAGE_COLORS: Record<string, string> = {
  library: '#4A9FD8', import: '#4A9FD8', raw_preview: '#8D7BD8', schema_discovery: '#8D7BD8',
  dq_engine: '#4C5FD5', transformation: '#C2335A', feature_engineering: '#C2335A',
  prediction: '#ff4757', confidence_gate: '#ff4757', raw_vs_processed: '#4AC29A',
  shap: '#4AC29A', anomaly: '#f5b04e', benchmarking: '#D8A648', recommendation: '#D8A648',
  executive_center: '#ff4757', report: '#5B6FE0', history_registry: '#5B6FE0',
}

function statusFor(stageStatuses: Record<string, string>, key: string): string {
  return stageStatuses[key] || 'todo'
}

function routeKeyFor(pathname: string): string | null {
  const base = '/' + (pathname.split('/')[1] || '')
  return WORKFLOW.find(s => s.path.split('$')[0] === base || s.path === base)?.key || null
}

function milestoneState(statuses: Record<string, string>, stages: string[], routeKey: string | null): 'done' | 'active' | 'todo' {
  const done = stages.filter(k => statuses[k] === 'done').length
  if (done === stages.length) return 'done'
  if (stages.includes(routeKey || '')) return 'active'
  if (done > 0 || stages.some(k => statuses[k] === 'active')) return 'active'
  return 'todo'
}

function isActiveRoute(pathname: string, stageKey: string): boolean {
  const base = WORKFLOW.find(s => s.key === stageKey)?.path.split('/')[1]
  return base ? pathname.startsWith(`/${base}`) : false
}

export function JourneyMap() {
  const location = useLocation()
  const { datasetId, runId, modelId, stageStatuses } = useJourney()
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { setOpen(null) }, [location.pathname])

  const doneCount = WORKFLOW.filter(s => statusFor(stageStatuses, s.key) === 'done').length
  const pct = (doneCount / WORKFLOW.length) * 100
  const routeKey = routeKeyFor(location.pathname)

  return (
    <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-surface/40 px-4 backdrop-blur-sm">
      {/* Center: 6-milestone rail (full width) */}
      <div className="relative mx-auto flex min-w-0 flex-1 items-stretch">
        {MILESTONES.map((m, i) => {
          const state = milestoneState(stageStatuses, m.stages, routeKey)
          const prog = milestoneProgress(stageStatuses, m)
          const isOpen = open === m.key

          return (
            <div key={m.key} className="relative flex min-w-0 flex-1 items-center">
              {/* connector pipe between milestones (physical link) */}
              {i > 0 && (
                <div className="connector-pipe mx-0.5 hidden w-3 shrink-0 md:block" style={{ height: 8 }} />
              )}
              <button
                onClick={() => setOpen(isOpen ? null : m.key)}
                aria-expanded={isOpen}
                title={`${m.label} — ${prog.done}/${prog.total} complete`}
                className={clsx(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-button px-1 py-1.5 transition-all',
                  isOpen ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
                )}
              >
                <span className="flex w-full items-center justify-center gap-1.5">
                  <span className={clsx(
                    'relative flex h-[18px] w-[20px] items-end justify-center rounded-t-full rounded-b-[3px] transition-all',
                    state === 'active'
                      ? 'bg-gradient-to-b from-[#D3ECFF] via-accent-cyan to-primary-500 shadow-[0_0_14px_rgba(99,125,255,0.95)]'
                      : state === 'done'
                        ? 'bg-accent-emerald/85 shadow-[0_0_8px_rgba(74,194,154,0.75)]'
                        : 'bg-white/[0.10]',
                  )}>
                    <span className="mb-[3px] h-1 w-1 rounded-full bg-white/90" />
                    {state === 'active' && (
                      <>
                        <span className="absolute -bottom-2 left-1/2 h-3 w-9 -translate-x-1/2 rounded-full bg-primary-400/80 blur-[4px]" />
                        <span className="absolute -bottom-[10px] left-1/2 h-4 w-12 -translate-x-1/2 rounded-[50%] border border-primary-300/60" />
                      </>
                    )}
                  </span>
                  <span className={clsx(
                    'truncate font-mono text-[10px] font-bold uppercase tracking-[0.14em] lg:text-[11px]',
                    state === 'done' ? 'text-gray-100' : state === 'active' ? 'text-gray-100' : 'text-gray-400',
                  )}>
                    {m.short}
                  </span>
                  <span className="hidden text-[10px] font-mono text-gray-500 sm:block">{prog.done}/{prog.total}</span>
                  <ChevronDown className={clsx('h-3 w-3 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
                </span>
                {/* mini progress bar inside the milestone */}
                <span className="flex w-full items-center justify-center gap-1">
                  {m.stages.map(key => {
                    const st = statusFor(stageStatuses, key)
                    const c = STAGE_COLORS[key]
                    const active = key === routeKey
                    return (
                      <span
                        key={key}
                        className="h-1 w-1.5 rounded-full"
                        style={{
                          background: st === 'done' ? c : active ? '#ff4757' : st === 'active' ? '#ff4757' : 'rgba(255,255,255,0.14)',
                          boxShadow: active || st === 'active' ? `0 0 8px ${c}` : undefined,
                        }}
                      />
                    )
                  })}
                </span>
              </button>
            </div>
          )
        })}

        {/* overall animated progress track */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px]">
          <div className="h-full w-full rounded-full bg-white/[0.06]" />
          <motion.div
            className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-primary-500 via-accent-cyan to-accent-emerald shadow-[0_0_10px_rgba(76,95,213,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: B }}
          />
        </div>

        {/* full-width inline stage list for the open milestone */}
        <AnimatePresence>
          {open && (
            <motion.div
              key={open}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: B }}
              className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-64 flex-wrap items-center gap-1.5 overflow-y-auto rounded-button border border-white/[0.08] bg-surface-light/95 p-2 shadow-2xl backdrop-blur-md"
            >
              {MILESTONES.filter(m => m.key === open)[0]?.stages.map(key => {
                const stage = WORKFLOW.find(s => s.key === key)!
                const Icon = STAGE_ICONS[key]
                const st = statusFor(stageStatuses, key)
                const path = stagePath(stage, { datasetId: datasetId || '', runId: runId || '', modelId: modelId || '' })
                const reqName = stage.requires === 'dataset' ? 'dataset' : stage.requires === 'run' ? 'run' : stage.requires === 'model' ? 'model' : null
                const missingReq = reqName &&
                  (reqName === 'dataset' ? !datasetId : reqName === 'run' ? !runId : !modelId)
                const locked = !!missingReq && st !== 'done'
                const active = isActiveRoute(location.pathname, key)
                return (
                  <div key={key} className="flex min-w-0 items-center">
                    {locked ? (
                      <span
                        title={`Locked — needs a ${reqName} first`}
                        className="flex cursor-not-allowed items-center gap-1.5 rounded-button border border-white/[0.05] px-2.5 py-1.5 text-[11px] font-mono text-gray-500 opacity-60"
                      >
                        <Lock className="h-3 w-3 shrink-0 text-gray-500" />
                        <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                        <span className="truncate">{stage.short}</span>
                        <span className="hidden rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-gray-400 lg:inline">
                          needs {reqName}
                        </span>
                      </span>
                    ) : (
                      <Link
                        to={path as any}
                        onClick={() => setOpen(null)}
                        className={clsx(
                          'flex items-center gap-1.5 rounded-button px-2.5 py-1.5 text-[11px] font-mono transition-colors',
                          active && 'bg-primary-500/15 text-primary-500',
                          !active && 'hover:bg-white/[0.04]',
                        )}
                      >
                        <Icon className={clsx('h-3.5 w-3.5', active ? 'text-primary-500' : 'text-gray-400')} />
                        <span className={clsx(st === 'done' ? 'font-semibold text-gray-100' : active ? 'text-primary-500' : 'text-gray-400')}>
                          {stage.short}
                        </span>
                        {st === 'done' && <Check className="h-3 w-3 text-accent-emerald" strokeWidth={3} />}
                        {PASSTHROUGH_KEYS.has(key) && (
                          <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-gray-500">bg</span>
                        )}
                      </Link>
                    )}
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: progress + mode */}
      <div className="flex w-56 shrink-0 items-center justify-end gap-3 pr-1">
        <Link
          to="/reports"
          title="Generate & download a PDF audit report"
          className="group flex items-center gap-1.5 rounded-button border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-gray-400 transition-colors hover:border-accent-rose/40 hover:bg-accent-rose/10 hover:text-accent-rose"
        >
          <FileDown className="h-3 w-3 transition-transform group-hover:translate-y-0.5" /> PDF
        </Link>
        <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider">
          <Radio className="w-3 h-3 animate-pulse-glow text-primary-400" />
          <span className="text-primary-400">{doneCount}/{WORKFLOW.length}</span>
        </div>
      </div>
    </div>
  )
}