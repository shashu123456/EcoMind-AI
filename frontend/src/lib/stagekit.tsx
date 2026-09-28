import type { ReactNode } from 'react'
import { cn as clsx } from './cn'
import { storyForStage, beatForStage } from './story'

/* ── Shared constructor kit for every stage screen ──────────────────────
   Phase 2 consistency backbone. Every stage page must be assembled from
   these primitives so typography, spacing, cards, borders and the
   Input → Processing → Output → Meaning → Next narrative stay identical
   across the whole platform.                                   */

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo', className)}>
      {children}
    </span>
  )
}

export function StageHeader({
  beat, chapter, title, tagline,
  right, icon,
}: {
  beat?: number
  chapter: string
  title: string
  tagline: string
  right?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-glass border border-border bg-panel text-t-mid">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <SectionLabel>{beat ? `Beat ${String(beat).padStart(2, '0')} / 13 · ${chapter}` : chapter}</SectionLabel>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-t-hi sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-t-lo">{tagline}</p>
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  )
}

export function Panel({
  title, right, children, className, flush,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <section className={clsx('flex min-h-0 flex-col rounded-card border border-border bg-panel', className)}>
      {(title || right) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="min-w-0 truncate">{typeof title === 'string' ? (
            <SectionLabel>{title}</SectionLabel>
          ) : title}</div>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </div>
      )}
      {flush ? children : <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>}
    </section>
  )
}

export function Stat({
  label, value, hint, accent, mono,
}: {
  label: string
  value: ReactNode
  hint?: string
  accent?: 'emerald' | 'amber' | 'rose' | 'primary' | 'cyan'
  mono?: boolean
}) {
  const accents = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    primary: 'text-primary-500',
    cyan: 'text-cyan-600',
  }
  return (
    <div className="rounded-button border border-border bg-panel px-3.5 py-2.5">
      <SectionLabel>{label}</SectionLabel>
      <div className={clsx('mt-1 text-xl font-semibold tracking-tight', mono ? 'font-mono text-base' : '', accent ? accents[accent] : 'text-t-hi')}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-t-lo">{hint}</div>}
    </div>
  )
}

export function StatusChip({ status, children }: { status: 'ok' | 'running' | 'warn' | 'idle'; children: ReactNode }) {
  const map = {
    ok: ['border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-600', 'bg-emerald-500'],
    running: ['border-primary-500/30 bg-primary-500/[0.06] text-primary-500', 'bg-primary-500'],
    warn: ['border-amber-500/30 bg-amber-500/[0.07] text-amber-600', 'bg-amber-500'],
    idle: ['border-border bg-panel2 text-t-lo', 'bg-t-lo'],
  } as const
  const [box, dot] = map[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', box)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', status === 'running' && 'animate-pulse', dot)} />
      {children}
    </span>
  )
}

export function MetricPill({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <span className={clsx('inline-flex items-baseline gap-1.5 rounded-button border border-border bg-panel2 px-2.5 py-1 font-mono text-[11px]', accent ?? 'text-t-mid')}>
      <span className="text-t-lo">{label}</span>
      <span className="font-semibold text-t-hi">{value}</span>
    </span>
  )
}

export function Bar({ value, max = 100, className, tone = 'primary' }: { value: number; max?: number; className?: string; tone?: 'primary' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet' }) {
  const tones = {
    primary: 'bg-primary-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    cyan: 'bg-cyan-500',
    violet: 'bg-accent-violet',
  }
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className={clsx('h-1.5 overflow-hidden rounded-full bg-panel3', className)}>
      <div className={clsx('h-full rounded-full transition-[width] duration-500', tones[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-button border border-border bg-panel px-4 py-2.5 text-sm text-t-lo">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
      {label}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-panel px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-panel2 text-t-lo">
        <span className="text-sm">◇</span>
      </div>
      <p className="text-sm font-medium text-t-hi">{title}</p>
      {hint && <p className="max-w-sm text-xs text-t-lo">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/* ── Stage narrative strip (answers the 5 questions on every screen) ── */
const STEP_TONES: Record<string, string> = {
  entered: 'text-t-hi border-accent-cyan/40 bg-accent-cyan/[0.05]',
  processed: 'text-t-hi border-primary-500/40 bg-primary-500/[0.05]',
  produced: 'text-t-hi border-emerald-500/40 bg-emerald-500/[0.05]',
  matters: 'text-t-hi border-amber-500/40 bg-amber-500/[0.06]',
  next: 'text-t-hi border-border bg-panel2',
}

export function StoryFlow({ stageKey, activeKey }: { stageKey: string; activeKey?: string }) {
  const s = storyForStage(stageKey)
  const beat = beatForStage(stageKey)
  if (!s) return null
  const steps = [
    { key: 'entered', q: 'Entered', a: s.entered },
    { key: 'processed', q: 'Processed', a: s.happened },
    { key: 'produced', q: 'Produced', a: s.produced },
    { key: 'matters', q: 'Why it matters', a: s.matters },
    { key: 'next', q: 'Next', a: s.next },
  ]
  const active = activeKey ?? steps[Math.min(2, steps.length - 1)].key
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-5">
      {steps.map((st, i) => (
        <div key={st.key} className={clsx('min-h-[72px] bg-panel p-3', st.key === active ? STEP_TONES[st.key] : '')}>
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>0{i + 1} · {st.q}</SectionLabel>
            {st.key === active && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />}
          </div>
          <p className={clsx('mt-1 line-clamp-3 text-[11px] leading-snug', st.key === active ? 'text-t-mid' : 'text-t-lo')}>{st.a}</p>
        </div>
      ))}
    </div>
  )
}