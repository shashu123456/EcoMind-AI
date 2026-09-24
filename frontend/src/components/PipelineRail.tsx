import { Link, useLocation } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, Upload, Eye, ScanSearch, ShieldCheck, Wand2, Cpu,
  BrainCircuit, Gauge, GitCompare, Lightbulb, AlertTriangle, Trophy,
  Target, Briefcase, FileText, History, Check, Leaf, Radio,
} from 'lucide-react'
import clsx from 'clsx'
import { WORKFLOW, useJourney, stagePath } from '../lib/journey'
import { B } from '../lib/kit'
import { useState } from 'react'
import { ExecutionModeToggle } from './ExecutionMode'

const ICONS: Record<string, React.ComponentType<any>> = {
  library: Database, import: Upload, raw_preview: Eye, schema_discovery: ScanSearch,
  dq_engine: ShieldCheck, transformation: Wand2, feature_engineering: Cpu,
  prediction: BrainCircuit, confidence_gate: Gauge, raw_vs_processed: GitCompare,
  shap: Lightbulb, anomaly: AlertTriangle, benchmarking: Trophy,
  recommendation: Target, executive_center: Briefcase, report: FileText, history_registry: History,
}

export function PipelineRail() {
  const location = useLocation()
  const { datasetId, runId, modelId, stageStatuses } = useJourney()
  const [open, setOpen] = useState(false)

  function statusFor(stageKey: string): string {
    return stageStatuses[stageKey] || 'todo'
  }

  function isActivePath(stage: any): boolean {
    const p = stage.path
    const base = p.split('$')[0]
    return base !== '/' && location.pathname.startsWith(base)
  }

  const doneCount = WORKFLOW.filter(s => statusFor(s.key) === 'done').length
  const pct = (doneCount / WORKFLOW.length) * 100

  return (
    <aside className="relative flex h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-surface-dark/90">
      {/* Logo */}
      <div className="relative overflow-hidden border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-2.5">
          <motion.div
            whileHover={{ rotate: 8, scale: 1.05 }}
            className="relative flex h-9 w-9 items-center justify-center rounded-glass bg-gradient-to-br from-primary-500 to-accent-cyan shadow-[0_0_20px_rgba(76,95,213,0.4)]"
          >
            <Leaf className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
          </motion.div>
          <div>
            <p className="font-display text-base font-bold leading-tight tracking-tight">EcoMind AI</p>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">adaptive · explainable · energy</p>
          </div>
        </div>

        {/* Journey progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-primary-400">
              <Radio className="w-3 h-3 animate-pulse-glow" /> journey
            </span>
            <span className="text-gray-500">{doneCount}/{WORKFLOW.length} stages</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 via-accent-cyan to-accent-emerald"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: B }}
            />
          </div>
        </div>
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 text-xs font-medium text-gray-400 lg:hidden"
      >
        <span>Workflow (17 stages)</span>
        <span className={clsx('transition-transform', open && 'rotate-180')}>▾</span>
      </button>

      {/* Stages */}
      <nav className={clsx('flex-1 overflow-y-auto p-2.5 space-y-1', open ? 'block' : 'hidden lg:block')}>
        {WORKFLOW.map((stage, i) => {
          const Icon = ICONS[stage.key]
          const status = statusFor(stage.key)
          const active = location.pathname === stage.path.split('$')[0] || isActivePath(stage)
          const path = stagePath(stage, { datasetId: datasetId || '', runId: runId || '', modelId: modelId || '' })
          const locked = (stage.requires === 'dataset' && !datasetId) ||
            (stage.requires === 'run' && !runId) ||
            (stage.requires === 'model' && !modelId)
          const clickable = !locked || status === 'done'

          return (
            <div key={stage.key}>
              <Link
                to={clickable ? (path as any) : undefined as any}
                onClick={(e) => { if (!clickable) e.preventDefault() }}
                className={clsx(
                  'group relative flex items-center gap-2.5 rounded-button px-2 py-[7px] text-[12.5px] transition-colors',
                  active && !locked && 'bg-primary-500/10 text-gray-100',
                  !active && status !== 'topic' && 'text-gray-400 hover:bg-white/[0.03] hover:text-gray-200',
                  (locked && status !== 'done') && 'cursor-not-allowed opacity-40',
                  status === 'done' && 'opacity-90',
                )}
              >
                {/* Connector line between nodes */}
                {i < WORKFLOW.length - 1 && (
                  <span className={clsx(
                    'absolute left-[17px] top-[26px] h-full w-px',
                    status === 'done' ? 'bg-gradient-to-b from-accent-emerald/60 to-white/[0.06]' : 'bg-white/[0.06]',
                  )} />
                )}

                {/* Node dot / check */}
                <span className="relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  {status === 'done' ? (
                    <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                      className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent-emerald shadow-[0_0_10px_rgba(91,111,224,0.5)]">
                      <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
                    </motion.span>
                  ) : status === 'active' ? (
                    <span className="relative flex h-[18px] w-[18px] items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500/50" />
                      <span className="relative flex h-[18px] w-[18px] items-center justify-center rounded-md bg-primary-500">
                        <Icon className="h-2.5 w-2.5 text-white" />
                      </span>
                    </span>
                  ) : (
                    <span className={clsx(
                      'flex h-[18px] w-[18px] items-center justify-center rounded-md border',
                      active ? 'border-primary-500/60 bg-primary-500/20' : 'border-white/[0.12] bg-white/[0.03]',
                    )}>
                      <Icon className="h-2.5 w-2.5 text-gray-400" />
                    </span>
                  )}
                </span>

                <span className="truncate">
                  <span className={clsx('font-mono text-[9px] mr-1', status === 'done' ? 'text-accent-emerald' : 'text-gray-600')}>{i + 1}</span>
                  {stage.short}
                </span>

                {active && status !== 'done' && (
                  <motion.span layoutId="rail-active-pill"
                    className="absolute inset-0 rounded-button border border-primary-500/30 bg-primary-500/[0.07]" />
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-3 space-y-2">
        <div className="glass-card p-3">
          <ExecutionModeToggle compact />
        </div>
        <AnimatePresence mode="wait">
          {statusFor('history_registry') === 'done' ? (
            <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card p-3 text-center">
              <p className="font-display text-sm font-semibold text-accent-emerald">Journey complete</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Every stage verified. Ready to re-run or export.</p>
            </motion.div>
          ) : (
            <motion.div key="live" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card p-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">current context</p>
              <div className="mt-1.5 space-y-1 text-[11px] text-gray-300">
                <p className="flex items-center justify-between">
                  <span className="text-gray-500">dataset</span>
                  <span className={clsx('font-mono', datasetId ? 'text-accent-cyan' : 'text-gray-600')}>
                    {datasetId ? datasetId.slice(0, 8) : 'none'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-500">run</span>
                  <span className={clsx('font-mono', runId ? 'text-primary-400' : 'text-gray-600')}>
                    {runId ? runId.slice(0, 8) : 'none'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-500">model</span>
                  <span className={clsx('font-mono', modelId ? 'text-accent-emerald' : 'text-gray-600')}>
                    {modelId ? modelId.slice(0, 8) : 'none'}
                  </span>
                </p>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div className="h-full bg-gradient-to-r from-primary-500 to-accent-cyan"
                  animate={{ width: [`${Math.max(pct - 15, 0)}%`, `${pct}%`] }}
                  transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}