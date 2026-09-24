import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, animate, AnimatePresence } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, Loader2, Footprints, RotateCcw, Flag } from 'lucide-react'
import clsx from 'clsx'
import { useJourney } from './journey'

export const B = [0.16, 1, 0.3, 1] as [number, number, number, number]

function fmtNum(v: number, digits: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function barPct(v: number | null, max: number): number {
  return v !== null && v > 0 ? (v / max) * 100 : 0
}

/* ── Human "writes it out" typewriter reveal ──────────── */
export function useTypewriter(text: string, speed = 16, delay = 0): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(0)
    let n = 0
    let timer = window.setTimeout(function tick() {
      n += 1
      setCount(n)
      if (n < text.length) timer = window.setTimeout(tick, speed)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [text, speed, delay])
  return count
}

export function TypeText({
  text, speed = 16, delay = 0, className, caretClass,
}: {
  text: string
  speed?: number
  delay?: number
  className?: string
  caretClass?: string
}) {
  const n = useTypewriter(text, speed, delay)
  const done = n >= text.length
  return (
    <span className={className}>
      {text.slice(0, n)}
      {!done && <span className={clsx('animate-pulse', caretClass)}>▌</span>}
    </span>
  )
}

/* ── Animated count-up number ─────────────────────────── */
export function AnimatedNumber({
  value, decimals = 0, suffix = '', prefix = '', className,
}: {
  value: number
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
}) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const from = prev.current
    const controls = animate(from, value || 0, {
      duration: 1.1, ease: B,
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value || 0
    return () => controls.stop()
  }, [value])
  return (
    <span className={className}>
      {prefix}{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  )
}

/* ── Animated horizontal bar ──────────────────────────── */
export function LiveBar({
  value, max = 100, delay = 0, ready = true, className, barClassName,
}: {
  value: number
  max?: number
  delay?: number
  ready?: boolean
  className?: string
  barClassName?: string
}) {
  const pct = Math.max(0, Math.min(100, ((value || 0) / max) * 100))
  return (
    <div className={clsx('relative h-2 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={ready ? { width: `${pct}%` } : { width: 0 }}
        transition={{ duration: 0.9, delay, ease: B }}
        className={clsx(
          'relative h-full rounded-full',
          barClassName || 'bg-gradient-to-r from-primary-500 to-accent-cyan',
          ready && 'after:absolute after:inset-0 after:animate-pulse-glow after:bg-white/20 after:content-[""]',
        )}
      />
    </div>
  )
}

/* ── Before / after diff strip for DQ repairs ────────── */
export function DiffStrip({ rows, accentBefore = 'bg-accent-gold', accentAfter = 'bg-accent-emerald' }: {
  rows: Array<{ label: string; before?: number; after?: number; suffix?: string }>
  accentBefore?: string
  accentAfter?: string
}) {
  if (!rows.length) return null
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => {
        const b = typeof r.before === 'number' && isFinite(r.before) ? r.before : null
        const a = typeof r.after === 'number' && isFinite(r.after) ? r.after : null
        const max = Math.max(100, b ?? 0, a ?? 0)
        const suffix = r.suffix ?? '%'
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">{r.label}</span>
              <span className="font-mono text-[10px] text-gray-400">
                {b !== null ? `${fmtNum(b, 1)}${suffix} → ` : '— → '}
                <span className="text-accent-emerald">{a !== null ? fmtNum(a, 1) + suffix : '—'}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <motion.div
                  className={clsx('h-full rounded-full', accentBefore)}
                  initial={{ width: 0 }} animate={{ width: `${barPct(b, max)}%` }}
                  transition={{ duration: 0.7, delay: i * 0.1 }}
                />
              </div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <motion.div
                  className={clsx('h-full rounded-full', accentAfter)}
                  initial={{ width: 0 }} animate={{ width: `${barPct(a, max)}%` }}
                  transition={{ duration: 0.7, delay: 0.15 + i * 0.1 }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Semicircle gauge ─────────────────────────────────── */
export function Gauge({
  value, size = 190, color = '#4C5FD5', label, sublabel, decimals = 0,
}: {
  value: number
  size?: number
  color?: string
  label?: string
  sublabel?: string
  decimals?: number
}) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(0, Math.max(0, Math.min(100, (value || 0) * 100)), {
      duration: 1.6, ease: B, onUpdate: (v) => setDisplay(v),
    })
    return () => controls.stop()
  }, [value])

  const stroke = 14
  const r = (size - stroke) / 2
  const c = Math.PI * r
  const frac = display / 100

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + 26} viewBox={`0 0 ${size} ${size / 2 + 26}`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="#5B6FE0" />
          </linearGradient>
        </defs>
        <path d={`M ${stroke / 2} ${size / 2 + 6} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2 + 6}`}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} strokeLinecap="round" />
        <motion.path
          d={`M ${stroke / 2} ${size / 2 + 6} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2 + 6}`}
          fill="none" stroke="url(#gaugeGrad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 1.6, ease: B }}
          style={{ filter: `drop-shadow(0 0 8px ${color}55)` }}
        />
        {/* needle */}
        <motion.g
          initial={{ rotate: -90 }}
          animate={{ rotate: -90 + frac * 180 }}
          transition={{ duration: 1.6, ease: B }}
          style={{ transformOrigin: `${size / 2}px ${size / 2 + 6}px` }}
        >
          <line x1={size / 2} y1={size / 2 + 6} x2={size / 2 + 4} y2={18} stroke={color} strokeWidth={3} strokeLinecap="round" />
        </motion.g>
        <circle cx={size / 2} cy={size / 2 + 6} r={5} fill={color} />
      </svg>
      <div className="-mt-1 text-center">
        <p className="font-display text-2xl font-bold text-gray-100">
          <AnimatedNumber value={display} decimals={decimals} />
          <span className="text-sm font-mono text-gray-400">%</span>
        </p>
        {label && <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mt-0.5">{label}</p>}
        {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  )
}

/* ── Floating particles background ────────────────────── */
export function Particles({ count = 26 }: { count?: number }) {
  const dots = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      left: (i * 37 + 13) % 100,
      top: (i * 53 + 29) % 100,
      size: 1 + ((i * 7) % 3),
      duration: 8 + ((i * 5) % 12),
      delay: (i * 1.7) % 8,
      hue: i % 3,
    })), [count])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {dots.map((d, i) => (
        <motion.div
          key={i}
          className={clsx(
            'absolute rounded-full',
            d.hue === 0 && 'bg-primary-400', d.hue === 1 && 'bg-accent-cyan', d.hue === 2 && 'bg-accent-violet',
          )}
          style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, opacity: 0.5 }}
          animate={{ y: [0, -24, 0], opacity: [0.35, 0.8, 0.35] }}
          transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/* ── Reveal wrapper ───────────────────────────────────── */
export function Reveal({ children, delay = 0, y = 18, className }: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: B }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export interface TableColumn {
  name?: string
  data_type?: string
  [key: string]: unknown
}

/* ── Normalize a preview/schema column to its display label ── */
export function colLabel(c: string | TableColumn): string {
  return typeof c === 'string' ? c : String(c?.name ?? '')
}

/* ── Normalize rows to column-aligned arrays (dict rows from preview) ── */
export function normRows(rows: any[], columns: (string | TableColumn)[]): any[][] {
  return (rows || []).map((rw) =>
    Array.isArray(rw) ? rw : columns.map((c) => (rw as any)?.[colLabel(c)] ?? null),
  )
}

/* ── Client-side CSV export for any column/row surface ── */
export function downloadCSV(
  columns: (string | TableColumn)[],
  rows: any[],
  filename = 'ecomind-export.csv',
) {
  const labels = columns.map(colLabel)
  const data = normRows(rows, columns)
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [labels.map(esc).join(','), ...data.map((r) => r.map(esc).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ── Stream rows into a table one by one ──────────────── */
export function StreamTable({ columns, rows, speed = 60, live = true, exportable = true, filename = 'ecomind-export.csv' }: {
  columns: (string | TableColumn)[]
  rows: any[]
  speed?: number
  live?: boolean
  exportable?: boolean
  filename?: string
}) {
  const [shown, setShown] = useState(0)
  const frame = useRef(0)
  const safeRows = useMemo(() => normRows(rows, columns), [rows, columns])
  useEffect(() => {
    if (!live) { setShown(safeRows.length); return }
    frame.current = 0
    const id = window.setInterval(() => {
      frame.current += 1
      setShown(frame.current)
      if (frame.current >= safeRows.length) window.clearInterval(id)
    }, speed)
    return () => window.clearInterval(id)
  }, [safeRows, speed, live])

  const visible = safeRows.slice(0, shown)
  return (
    <div className="overflow-hidden rounded-card border border-white/[0.06] bg-dark-200/60">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <div className="grid flex-1 gap-x-3 gap-y-1.5 text-[10px] font-mono uppercase tracking-wider text-gray-500"
          style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}>
          {columns.map((c, i) => <span key={i} className="truncate">{colLabel(c)}</span>)}
        </div>
        {exportable && safeRows.length > 0 && (
          <button
            onClick={() => downloadCSV(columns, safeRows, filename)}
            className="shrink-0 rounded-button border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-primary-300 transition-colors hover:border-primary-500/40 hover:bg-primary-500/10"
            title="Download all rows as CSV"
          >
            export csv
          </button>
        )}
      </div>
      <div className="font-mono text-[11px] text-gray-300">
        <AnimatePresence initial={false}>
          {visible.map((row, ri) => (
            <motion.div
              key={ri} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="grid gap-x-3 px-4 py-1.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]"
              style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}
            >
              {row.map((v: any, ci) => (
                <span key={ci} className={clsx('truncate', ci === 0 && 'text-gray-500')}>
                  {v === null || v === undefined || v === '' ? <span className="text-accent-rose/70 italic">NULL</span> : String(v)}
                </span>
              ))}
            </motion.div>
          ))}
        </AnimatePresence>
        {live && shown < safeRows.length && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-2 text-[10px] text-primary-400">
            streaming {Math.min(shown, safeRows.length)} / {safeRows.length} rows…
          </motion.div>
        )}
      </div>
    </div>
  )
}

/* ── Terminal-style live log ──────────────────────────── */
export function LiveLog({ lines, accent = 'text-primary-400' }: { lines: string[]; accent?: string }) {
  return (
    <div className="rounded-card border border-white/[0.06] bg-black/40 p-3 font-mono text-[11px] leading-5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-2.5 h-2.5 rounded-full bg-accent-rose/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-accent-amber/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-accent-emerald/70" />
        <span className="ml-2 text-[9px] uppercase tracking-widest text-gray-600">ecoSight console</span>
      </div>
      <div className="space-y-0.5 text-gray-400">
        {lines.map((l, i) => (
          <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }} className="truncate">
            <span className="text-gray-600">[{String(i + 1).padStart(2, '0')}]</span> <span className={accent}>›</span>{' '}
            <TypeText text={l} delay={i * 150} speed={12} caretClass={accent} />
          </motion.p>
        ))}
        <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }} className={accent}>▌</motion.p>
      </div>
    </div>
  )
}

/* ── Pulsing status dot ───────────────────────────────── */
export function PulseDot({ color = 'bg-primary-400', ping = 'bg-primary-400/60' }: { color?: string; ping?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', ping)} />
      <span className={clsx('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  )
}

/* ── Auto-advance countdown to next stage ─────────────── */
export function AutoNext({
  to, seconds = 5, label = 'All systems green — continuing the journey', onSkip,
}: {
  to: string
  seconds?: number
  label?: string
  onSkip?: () => void
}) {
  const navigate = useNavigate()
  const mode = useJourney(s => s.mode)
  const manual = mode === 'manual'
  const [left, setLeft] = useState(seconds)
  const [rings, setRings] = useState<{ id: number; x: number; y: number }[]>([])
  useEffect(() => {
    if (manual) return
    const id = window.setInterval(() => setLeft((l) => {
      if (l <= 1) { window.clearInterval(id); navigate({ to }); return 0 }
      return l - 1
    }), 1000)
    return () => window.clearInterval(id)
  }, [to, navigate, seconds, manual])

  const go = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ring = { id: Date.now() + Math.random(), x: e.clientX - rect.left, y: e.clientY - rect.top }
    setRings(p => [...p, ring])
    window.setTimeout(() => setRings(p => p.filter(r => r.id !== ring.id)), 850)
    window.setTimeout(() => navigate({ to }), 430)
  }

  const pct = manual ? 0 : ((seconds - left) / seconds) * 100
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass-panel flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-3 min-w-0">
        {manual ? (
          <>
            <span className="relative flex items-center">
              <PulseDot color="bg-accent-gold" ping="bg-accent-gold/60" />
              <Footprints className="ml-2 h-4 w-4 text-accent-gold" />
            </span>
            <span className="hidden items-center gap-1.5 rounded-button border border-accent-gold/30 bg-accent-gold/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-accent-gold sm:inline-flex">
              step-by-step
            </span>
          </>
        ) : (
          <>
            <PulseDot color="bg-accent-emerald" ping="bg-accent-emerald/60" />
            <Loader2 className="w-4 h-4 text-accent-emerald animate-spin" />
            <span className={clsx('h-1.5 w-24 rounded-full bg-white/[0.06]', 'hidden sm:block')}>
              <motion.div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-emerald"
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ease: 'linear', duration: 1 }} />
            </span>
          </>
        )}
        <p className="text-sm text-gray-300 truncate">{manual ? 'Review this stage, then continue when you’re ready.' : label}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-xs text-gray-500">{manual ? 'ready to continue' : `next stage in ${left}s`}</span>
        {onSkip && (
          <button onClick={onSkip} className="text-xs text-primary-400 hover:underline">{manual ? 'run again' : 'wait'}</button>
        )}
        <button onClick={go}
          className="relative inline-flex items-center gap-2 overflow-visible rounded-button bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-400">
          {rings.map(r => (
            <motion.span key={r.id}
              initial={{ left: r.x, top: r.y, width: 6, height: 6, opacity: 0.8, scale: 0.3 }}
              animate={{ opacity: 0, scale: 16 }}
              transition={{ duration: 0.75, ease: 'easeOut' }}
              className="pointer-events-none absolute -ml-1 -mt-1 rounded-full border-2 border-primary-200/80"
              style={{ boxShadow: '0 0 18px rgba(122,140,255,0.6)' }}
            />
          ))}
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  )
}

/* ── Journey control trio: Start / Next / End ────────── */
export function JourneyNav({
  next, nextLabel = 'Next stage', endLabel = 'End journey', start = '/library', seconds = 6, label = 'Ready for the next step',
}: {
  next: string
  nextLabel?: string
  endLabel?: string
  start?: string
  seconds?: number
  label?: string
}) {
  const navigate = useNavigate()
  const mode = useJourney(s => s.mode)
  const manual = mode === 'manual'
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (manual) return
    const id = window.setInterval(() => setLeft((l) => {
      if (l <= 1) { window.clearInterval(id); navigate({ to: next }); return 0 }
      return l - 1
    }), 1000)
    return () => window.clearInterval(id)
  }, [next, navigate, seconds, manual])

  const pct = manual ? 0 : ((seconds - left) / seconds) * 100
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass-panel flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {manual ? (
          <>
            <span className="relative flex items-center">
              <PulseDot color="bg-accent-gold" ping="bg-accent-gold/60" />
              <Footprints className="ml-2 h-4 w-4 text-accent-gold" />
            </span>
            <span className="hidden items-center gap-1.5 rounded-button border border-accent-gold/30 bg-accent-gold/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-accent-gold sm:inline-flex">
              guided mode
            </span>
          </>
        ) : (
          <>
            <PulseDot color="bg-accent-emerald" ping="bg-accent-emerald/60" />
            <Loader2 className="h-4 w-4 text-accent-emerald animate-spin" />
            <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06] sm:block">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-emerald"
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ease: 'linear', duration: 1 }} />
            </span>
          </>
        )}
        <p className="truncate text-sm text-gray-300">{manual ? label : `${label} — nudging in ${left}s`}</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => navigate({ to: start })}
          className="inline-flex items-center gap-2 rounded-button border border-white/[0.08] px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/[0.08]">
          <RotateCcw className="h-4 w-4" /> Start
        </button>
        <button onClick={() => navigate({ to: next })}
          className="relative inline-flex items-center gap-2 rounded-button bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-400">
          {nextLabel} <ArrowRight className="h-4 w-4" />
        </button>
        <button onClick={() => navigate({ to: '/dashboard' })}
          className="inline-flex items-center gap-2 rounded-button border border-accent-emerald/30 bg-accent-emerald/10 px-4 py-2 text-sm font-semibold text-accent-emerald transition-colors hover:bg-accent-emerald/20">
          <Flag className="h-4 w-4" /> {endLabel}
        </button>
      </div>
    </motion.div>
  )
}

/* ── Stage banner (page header) ───────────────────────── */
export function StageBanner({
  chapter, title, tagline, icon, children,
}: {
  chapter: string
  title: string
  tagline?: string
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: B }}
      className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-glass border border-white/[0.08] bg-surface-light/60 shadow-[0_0_24px_rgba(76,95,213,0.18)]">
          <span className="absolute inset-0 animate-pulse-glow rounded-glass bg-primary-500/10" />
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-primary-400">{chapter}</p>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-gray-100">{title}</h2>
          {tagline && <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">{tagline}</p>}
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </motion.div>
  )
}

/* ── Success / completion chip ────────────────────────── */
export function DoneChip({ text = 'Completed' }: { text?: string }) {
  return (
    <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-1.5 rounded-button border border-accent-emerald/40 bg-accent-emerald/10 px-3 py-1.5 text-xs font-semibold text-accent-emerald">
      <Check className="w-3.5 h-3.5" /> {text}
    </motion.span>
  )
}

/* ── Score tile with animated number + bar ────────────── */
export function ScoreTile({ label, value, hint, barClassName, valueClass }: {
  label: string
  value: number
  hint?: string
  barClassName?: string
  valueClass?: string
}) {
  return (
    <div className="rounded-card border border-white/[0.06] bg-surface-light/40 p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className={clsx('font-display text-xl font-semibold text-gray-100 mt-1', valueClass)}>
        <AnimatedNumber value={value} decimals={1} suffix="%" />
      </p>
      <LiveBar value={value} className="mt-2" barClassName={barClassName} />
      {hint && <p className="mt-1.5 text-[10px] text-gray-600">{hint}</p>}
    </div>
  )
}

/* ── Stat card with count-up ──────────────────────────── */
export function FlowStat({ label, value, decimals = 0, suffix = '', prefix = '', hint, accent }: {
  label: string
  value: number
  decimals?: number
  suffix?: string
  prefix?: string
  hint?: string
  accent?: boolean
}) {
  return (
    <motion.div whileHover={{ y: -2 }} className={clsx('glass-card p-5', accent && 'border-primary-500/40')}>
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="font-display text-2xl font-semibold mt-2 text-gray-100">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} prefix={prefix} />
      </p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </motion.div>
  )
}

/* ── Unified Button system ─────────────────────────────── */
type ButtonVariant =
  | 'primary'      // gradient underline-theme CTA
  | 'secondary'    // quiet bordered
  | 'outline'      // bordered top-level
  | 'danger'       // rose bordered
  | 'ghost'        // text-only icon
  | 'success'      // solid emerald

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  gradient?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  loading?: boolean
}

const BUTTON_GRADIENTS: Record<string, string> = {
  primary: 'from-primary-500 to-accent-cyan',
  violet: 'from-accent-violet to-primary-500',
  emerald: 'from-primary-500 to-accent-emerald',
  amber: 'from-accent-amber to-primary-500',
  rose: 'from-accent-rose to-accent-amber',
  golden: 'from-accent-amber to-accent-rose',
  cyan: 'from-accent-emerald to-accent-cyan',
}

const BUTTON_SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'px-3 py-1.5 text-xs',
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-sm',
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r font-semibold text-white shadow-[0_0_18px_rgba(76,95,213,0.3)] transition-all hover:shadow-[0_0_28px_rgba(76,95,213,0.5)] disabled:opacity-60',
  secondary: 'border border-white/[0.08] bg-white/[0.05] font-medium text-gray-300 transition-colors hover:bg-white/[0.1] disabled:opacity-50',
  outline: 'border border-white/[0.08] font-medium text-gray-300 transition-colors hover:bg-white/[0.04] disabled:opacity-50',
  danger: 'border border-rose-500/30 font-semibold text-rose-400 transition-colors hover:bg-rose-500/10 disabled:opacity-40',
  ghost: 'font-medium text-gray-400 transition-colors hover:text-gray-200 hover:bg-white/[0.04] rounded-lg disabled:opacity-40',
  success: 'bg-accent-emerald font-semibold text-dark-900 transition-colors hover:bg-emerald-400 disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  gradient = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-button transition-all disabled:cursor-not-allowed',
        BUTTON_SIZES[size],
        variant === 'primary' ? BUTTON_GRADIENTS[gradient] : '',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  )
}