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
      className={clsx('rounded-card border border-border bg-panel p-5', accent && 'border-primary-500/40')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-t-hi">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-t-lo">{hint}</p>}
    </motion.div>
  )
}

export function ErrorBox({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-panel p-6 text-center">
      <AlertCircle className="h-7 w-7 text-accent-rose" />
      <p className="text-sm text-t-mid">{message || 'Something went wrong'}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-medium text-primary-500 hover:underline">Retry</button>
      )}
    </div>
  )
}

export function EmptyBox({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-panel p-6 text-center">
      <Inbox className="h-7 w-7 text-t-lo" />
      <p className="text-sm font-medium text-t-hi">{title}</p>
      {hint && <p className="text-xs text-t-lo">{hint}</p>}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-t-hi">{children}</h3>
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
        'flex items-center justify-between rounded-card border border-border bg-panel p-4 text-sm',
        t?.status === 'completed' ? 'border-emerald-500/30' : 'border-red-500/30',
      )}
    >
      <div className="flex items-center gap-2.5">
        {t?.status === 'completed'
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          : <AlertCircle className="w-4 h-4 text-red-400" />}
        <span className="text-t-mid">
          {stageName} · <span className="text-t-lo">{t?.status}</span>
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        {t?.duration_ms != null && <span>{Math.round(t.duration_ms)} ms</span>}
        {t?.confidence != null && <span className="text-primary-400">{fmt(t.confidence * 100, 0)}% conf</span>}
      </div>
    </motion.div>
  )
}