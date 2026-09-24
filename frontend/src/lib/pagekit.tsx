import { ReactNode, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Loader2, AlertCircle, Inbox, Play, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { workflows } from './api'

export function useRouteParams(): Record<string, string> {
  return useParams({ strict: false }) as unknown as Record<string, string>
}

export async function ensureRun(datasetId: string): Promise<string> {
  const list = await workflows.list(datasetId) as any
  if (list?.runs?.length) return list.runs[0].id
  const started = await workflows.start({ dataset_id: datasetId }) as any
  return started.run.id
}

export function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits })
}

/** Coerce a possibly-absent/NaN/Infinity payload value to a finite number, or null. */
export function n(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null
  const v = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(v) ? v : null
}

export function PageHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl font-semibold text-gray-100 flex items-center gap-2.5">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
      </div>
    </div>
  )
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('glass-card p-5', accent && 'border-primary-500/40')}
    >
      <p className="text-xs uppercase tracking-widest text-gray-500">{label}</p>
      <p className="font-display text-2xl font-semibold mt-2 text-gray-100">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </motion.div>
  )
}

export function ErrorBox({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  return (
    <div className="glass-card p-6 flex flex-col items-center gap-3 text-center">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-sm text-gray-300">{message || 'Something went wrong'}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm text-primary-400 hover:underline">Retry</button>
      )}
    </div>
  )
}

export function EmptyBox({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="glass-card p-6 flex flex-col items-center gap-3 text-center">
      <Inbox className="w-8 h-8 text-gray-500" />
      <p className="text-sm text-gray-300">{title}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-display text-sm font-semibold text-gray-200 mb-3">{children}</h3>
}

export function RunStage({
  runId, stageKey, params, onResult, label, busyLabel, className,
}: {
  runId: string
  stageKey: string
  params?: any
  onResult?: (res: any) => void
  label?: string
  busyLabel?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true); setError(null)
    try {
      const res = await workflows.exec(runId, stageKey, params || {})
      onResult?.(res)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className={clsx(
          'inline-flex items-center gap-2 px-4 py-2 rounded-button text-sm font-semibold transition-all',
          'bg-primary-500 hover:bg-primary-400 text-white disabled:opacity-60 disabled:cursor-wait',
          className,
        )}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {busy ? (busyLabel || 'Running…') : (label || `Run ${stageKey}`)}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

export function TraceSummary({ res, stageName }: { res: any; stageName: string }) {
  if (!res) return null
  const t = res.trace
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'glass-card p-4 text-sm flex items-center justify-between',
        t?.status === 'completed' ? 'border-emerald-500/30' : 'border-red-500/30',
      )}
    >
      <div className="flex items-center gap-2.5">
        {t?.status === 'completed'
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          : <AlertCircle className="w-4 h-4 text-red-400" />}
        <span className="text-gray-300">
          {stageName} · <span className="text-gray-500">{t?.status}</span>
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        {t?.duration_ms != null && <span>{Math.round(t.duration_ms)} ms</span>}
        {t?.confidence != null && <span className="text-primary-400">{fmt(t.confidence * 100, 0)}% conf</span>}
      </div>
    </motion.div>
  )
}