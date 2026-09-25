import { ReactNode, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronDown, Info, Sparkles, Maximize2, Minimize2, X } from 'lucide-react'
import clsx from 'clsx'
import { B, AnimatedNumber, LiveBar, normRows, colLabel, TableColumn, TypeText } from '../lib/kit'

/* ── accent helpers ─────────────────────────────────── */
type Accent = 'jade' | 'emerald' | 'gold' | 'rose' | 'violet' | 'mint'
const ACCENT: Record<Accent, { text: string; border: string; bg: string; dot: string; bar: string }> = {
  jade:    { text: 'text-primary-300',    border: 'border-primary-500/30',    bg: 'bg-primary-500/10',    dot: 'bg-primary-400',    bar: 'bg-gradient-to-r from-primary-500 to-accent-cyan' },
  emerald: { text: 'text-accent-emerald', border: 'border-accent-emerald/30', bg: 'bg-accent-emerald/10', dot: 'bg-accent-emerald', bar: 'bg-gradient-to-r from-accent-emerald to-accent-cyan' },
  gold:    { text: 'text-accent-gold',    border: 'border-accent-gold/30',    bg: 'bg-accent-gold/10',    dot: 'bg-accent-gold',    bar: 'bg-gradient-to-r from-accent-gold to-accent-emerald' },
  rose:    { text: 'text-accent-rose',    border: 'border-accent-rose/30',    bg: 'bg-accent-rose/10',    dot: 'bg-accent-rose',    bar: 'bg-gradient-to-r from-accent-rose to-accent-gold' },
  violet:  { text: 'text-accent-violet',  border: 'border-accent-violet/30',  bg: 'bg-accent-violet/10',  dot: 'bg-accent-violet',  bar: 'bg-gradient-to-r from-accent-violet to-accent-cyan' },
  mint:    { text: 'text-[#4A9FD8]',      border: 'border-[#4A9FD8]/30',      bg: 'bg-[#4A9FD8]/10',      dot: 'bg-[#4A9FD8]',      bar: 'bg-gradient-to-r from-[#4A9FD8] to-accent-emerald' },
}

/* ── Terminal shell ─────────────────────────────────── */
/** Underlines/glows the MAJOR points inside a terminal line: whole line when
    it starts with ✓ ✔ → (a result line), otherwise metric tokens (decimals,
    percentages, big integers) get the glowing underline treatment. */
function TermHighlight({ text }: { text: string }) {
  if (/^[✓✔→>]/.test(text.trim())) {
    return <span className="term-key">{text}</span>
  }
  const re = /(\d[\d,]*\.\d+\s?%?|\d[\d,]*\s?%|(?<![0-9-])\d[\d,]{2,}(?![\d.]))/g
  const nodes: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={nodes.length}>{text.slice(last, m.index)}</span>)
    nodes.push(<span key={nodes.length} className="term-num">{m[0]}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(<span key={nodes.length}>{text.slice(last)}</span>)
  return <>{nodes}</>
}

export interface TermProps {
  title: string
  tag: string
  accent?: Accent
  lines?: string[]
  statRows?: { label: string; value: number; decimals?: number; suffix?: string; hint?: string }[]
  statusChip?: string
  footer?: ReactNode
  scan?: boolean
  className?: string
  children?: ReactNode
}

export function Terminal({ title, tag, accent = 'jade', lines, statRows, statusChip, footer, scan = true, className, children }: TermProps) {
  const a = ACCENT[accent]
  return (
    <div className={clsx('relative flex h-full min-h-0 flex-col overflow-hidden rounded-glass border border-white/[0.07] bg-black/45', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent-rose/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent-gold/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent-emerald/70" />
          </span>
          <span className={clsx('font-mono text-xs uppercase tracking-[0.18em]', a.text)}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-gray-600">{tag}</span>
          {statusChip && (
            <span className={clsx('rounded-full border px-2 py-0.5 font-mono text-xs uppercase tracking-wider', a.border, a.text)}>{statusChip}</span>
          )}
        </div>
      </div>

      <div className="term-scroll relative min-h-0 flex-1 overflow-y-auto p-4 pr-3 font-mono text-[13px] leading-[1.75]">
        {scan && <span className={clsx('pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-transparent via-white/[0.03] to-transparent', 'terminal-scan')} />}
        {children}
        {lines && (
          <div className="space-y-1 text-slate-300 term-glow">
            {lines.map((l, i) => (
              <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }} className="truncate">
                <span className="text-slate-600">[{String(i + 1).padStart(2, '0')}]</span> <span className={a.text}>›</span>{' '}
                <TypeText text={l} delay={i * 160} speed={13} caretClass={a.text} render={t => <TermHighlight text={t} />} />
              </motion.p>
            ))}
            <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.1, repeat: Infinity }} className={a.text}>▌</motion.p>
          </div>
        )}
        {statRows && (
          <div className="flex min-h-full w-full flex-col justify-center gap-3">
            {statRows.map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15, ease: B }}
                className="rounded-card border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-mono uppercase tracking-[0.16em] text-gray-500">{r.label}</span>
                  <span className={clsx('font-display text-2xl font-semibold tracking-tight', a.text)}>
                    <AnimatedNumber value={r.value} decimals={r.decimals ?? 1} suffix={r.suffix ?? ''} />
                  </span>
                </div>
                <LiveBar value={r.value} className="mt-2" barClassName={a.bar} />
                {r.hint && <p className="mt-1.5 text-xs text-gray-600">{r.hint}</p>}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {footer && <div className="shrink-0 border-t border-white/[0.06] px-4 py-2 font-mono text-xs text-gray-500">{footer}</div>}
    </div>
  )
}

/* ── Animated left→right processing bridge ──────────── */
const RAINBOW_CHIPS = [
  { border: 'border-accent-rose/40', bg: 'bg-accent-rose/15', text: 'text-accent-rose', glow: 'rgba(244,63,94,0.25)' },
  { border: 'border-accent-gold/40', bg: 'bg-accent-gold/15', text: 'text-accent-gold', glow: 'rgba(245,158,11,0.3)' },
  { border: 'border-accent-emerald/40', bg: 'bg-accent-emerald/15', text: 'text-accent-emerald', glow: 'rgba(16,185,129,0.3)' },
  { border: 'border-accent-cyan/40', bg: 'bg-accent-cyan/15', text: 'text-accent-cyan', glow: 'rgba(34,211,238,0.3)' },
  { border: 'border-accent-violet/40', bg: 'bg-accent-violet/15', text: 'text-accent-violet', glow: 'rgba(139,92,246,0.3)' },
]

export function FlowConsole({
  header, operation, tags = [], through = 'processing', total = 0, running = true, accent = 'jade', rainbow = false, children,
}: {
  header: string
  operation: string
  tags?: string[]
  through?: string
  total?: number
  running?: boolean
  accent?: Accent
  rainbow?: boolean
  children?: ReactNode
}) {
  const a = ACCENT[accent]
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setTick(t => t + 1), 1400)
    return () => window.clearInterval(id)
  }, [running])

  const chips = tags.length ? tags : ['normalizing', 'imputing', 'encoding', 'scoring', 'cleaning']
  const op = operation || chips[tick % chips.length]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-glass border border-white/[0.07] bg-dark-200/60">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className={clsx('font-mono text-xs uppercase tracking-[0.18em]', a.text)}>{header}</span>
        <AnimatePresence mode="wait">
          <motion.span key={op} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className={clsx('rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider', a.border, a.text)}>
            {op}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {/* fade anchors so chips look like they cross between terminals */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-dark to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-dark to-transparent" />

        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" viewBox="0 0 200 120" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bridgeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4C5FD5" />
              <stop offset="100%" stopColor="#5B6FE0" />
            </linearGradient>
          </defs>
          <line x1="4" y1="60" x2="196" y2="60" stroke="url(#bridgeGrad)" strokeWidth="3" strokeDasharray="10 8" strokeLinecap="round"
            className="animate-[dashmove_1.2s_linear_infinite]" />
        </svg>

        {/* flowing packets — one clean pipe (colorful in rainbow mode) */}
        {chips.slice(0, 3).map((c, i) => {
          const col: any = rainbow ? RAINBOW_CHIPS[i % RAINBOW_CHIPS.length] : a
          return (
            <motion.span
              key={`${c}-${i}`}
              initial={{ x: '-30%', opacity: 0 }}
              animate={{ x: ['-30%', '130%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, delay: i * 1.05, ease: 'easeInOut' }}
              className={clsx('absolute rounded-md border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap', col.border, col.bg, col.text)}
              style={rainbow ? { top: 'calc(50% - 0.9rem)', boxShadow: `0 0 12px ${col.glow}` } : { top: 'calc(50% - 0.9rem)' }}
            >
              {c}
            </motion.span>
          )
        })}

        {/* center readout */}
        <div className="relative z-10 flex flex-col items-center gap-1.5 rounded-card border border-white/[0.08] bg-surface/90 px-5 py-3 backdrop-blur-sm shadow-[0_0_30px_rgba(76,95,213,0.15)]">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-gray-400">{through}</span>
          <div className="flex items-end gap-1">
            <span className={clsx('font-display text-2xl font-bold tracking-tight', a.text)}>
              <AnimatedNumber value={total} suffix="" />
            </span>
            <span className="pb-0.5 text-xs font-mono text-gray-400">records</span>
          </div>
          <span className="flex items-center gap-2 font-mono text-xs text-gray-400">
            <span className={clsx('h-1.5 w-1.5 animate-pulse rounded-full', a.dot)} />
            live · this stage is executing
          </span>
        </div>
      </div>

      {children && <div className="shrink-0 border-t border-white/[0.06] p-2">{children}</div>}
    </div>
  )
}

/* ── Visual live calculation ────────────────────────── */
export interface CalcTerm { key: string; label: string; weight: number; value: number }
export function CalcFlow({
  formula, terms, result, unit = '%', accent = 'gold', note,
}: {
  formula: string
  terms: CalcTerm[]
  result: number
  unit?: string
  accent?: Accent
  note?: string
}) {
  const a = ACCENT[accent]
  const products = terms.map(t => t.weight * t.value)
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-glass border border-white/[0.07] bg-black/45 p-3">
      <div className="flex shrink-0 items-center justify-between">
        <span className={clsx('flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em]', a.text)}>
          <Sparkles className="h-3.5 w-3.5" /> {formula}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-gray-600">live calculation</span>
      </div>

      <div className="mt-3 space-y-2">
        {terms.map((t, i) => (
          <motion.div key={t.key} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.25, ease: B }}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 rounded-card border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
            <span className="truncate text-xs text-gray-300">{t.label}</span>
            <motion.span
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.25 + 0.35 }}
              className={clsx('rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs', a.text)}>
              {t.weight.toFixed(2)}
            </motion.span>
            <span className="font-mono text-xs text-gray-500">×</span>
            <motion.span
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.25 + 0.5 }}
              className="font-mono text-xs text-gray-300">{t.value.toFixed(1)}</motion.span>
            <motion.span
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.25 + 0.68 }}
              className="min-w-[3.5rem] text-right font-mono text-xs text-gray-400">
              = {products[i].toFixed(2)}
            </motion.span>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: terms.length * 0.25 + 0.5, ease: B }}
        className="mt-auto pt-3">
        <div className={clsx('rounded-card border p-3', a.border, a.bg)}>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500">Σ weighted result</span>
            <span className={clsx('font-display text-3xl font-bold tracking-tight', a.text)}>
              <AnimatedNumber value={result} decimals={1} suffix={unit} />
            </span>
          </div>
          <LiveBar value={result} className="mt-2" barClassName={a.bar} />
          {note && <p className="mt-2 text-xs leading-4 text-gray-500">{note}</p>}
        </div>
      </motion.div>
    </div>
  )
}

/* ── Quality-annotated dataset preview ──────────────── */
export interface ColQuality { completePct: number; kind: 'num' | 'time' | 'cat' }
export function colQuality(c: string | TableColumn, rows: any[]): ColQuality {
  const label = colLabel(c)
  const col = normRows(rows, [c]).map(r => r[0])
  const present = col.filter(v => v !== null && v !== undefined && v !== '').length
  const completePct = col.length ? Math.round((present / col.length) * 100) : 0
  const num = col.filter(v => typeof v === 'number').length
  const numeric = present > 0 && num / present >= 0.8
  const time = !numeric && present > 0 &&
    col.some(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}|\d{2}[\/-]\d{2}[\/-]\d{4}/.test(v))
  return { completePct, kind: numeric ? 'num' : time ? 'time' : 'cat' }
}

export function DataPreview({
  columns, rows, maxCols = 6, maxRows = 6, title = 'Live dataset preview',
}: {
  columns: (string | TableColumn)[]
  rows: any[]
  maxCols?: number
  maxRows?: number
  title?: string
}) {
  const safe = useMemo(() => normRows(rows, columns), [rows, columns])
  const cols = columns.slice(0, maxCols)
  const shown = safe.slice(0, maxRows)
  const quals = useMemo(() => cols.map((c) => colQuality(c, safe)), [cols, safe])

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-glass border border-white/[0.07] bg-black/45">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary-300">{title}</span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-gray-600">
          {cols.length}/{columns.length} cols × {shown.length}/{safe.length} rows
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-white/[0.06]">
          <div className="grid shrink-0 gap-x-2 overflow-x-auto border-b border-white/[0.06] px-2 py-1.5"
            style={{ gridTemplateColumns: `repeat(${cols.length || 1}, minmax(0, 1fr))` }}>
            {cols.map((c, i) => {
              const q = quals[i]
              return (
                <div key={i} className="min-w-0">
                  <p className="truncate font-mono text-xs text-gray-200">{colLabel(c)}</p>
                  <span className={clsx(
                    'mt-0.5 inline-block rounded px-1 py-px font-mono text-[8px] uppercase tracking-wider',
                    q.completePct >= 95 ? 'bg-accent-emerald/15 text-accent-emerald' :
                      q.completePct >= 70 ? 'bg-accent-gold/15 text-accent-gold' : 'bg-accent-rose/15 text-accent-rose',
                  )}>
                    {q.kind} · {q.completePct}%
                  </span>
                </div>
              )
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-auto font-mono text-[10.5px] text-gray-300">
            {shown.length === 0 && <p className="px-3 py-4 text-gray-600">no sample rows</p>}
            {shown.map((row, ri) => (
              <motion.div key={ri} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: ri * 0.08, duration: 0.25 }}
                className="grid gap-x-2 border-b border-white/[0.03] px-2 py-1 last:border-0"
                style={{ gridTemplateColumns: `repeat(${cols.length || 1}, minmax(0, 1fr))` }}>
                {cols.map((_, ci) => {
                  const v = row[ci]
                  const q = quals[ci]
                  const missing = v === null || v === undefined || v === ''
                  return (
                    <span key={ci} className={clsx('truncate', missing ? 'text-accent-rose/80 italic' : q.kind === 'num' ? 'text-gray-200' : 'text-gray-400')}>
                      {missing ? '∅' : String(v)}
                    </span>
                  )
                })}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.06] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-gray-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-emerald" /> {">=95% complete"}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-gold" /> 70-94%</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-rose" /> {"<70%"}</span>
        <span className="ml-auto text-primary-300">∅ = missing value</span>
      </div>
    </div>
  )
}

/* ── Explain strip (confidence when asked) ──────────── */
export function ExplainStrip({ title, what, why, evidence, chips }: {
  title: string
  what: string
  why: string
  evidence?: string
  chips?: { label: string; value: string; accent?: Accent }[]
}) {
  const [open, setOpen] = useState(true)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, ease: B }}
      className={clsx('shrink-0 rounded-glass border bg-surface/60 transition-colors', open ? 'border-primary-500/25' : 'border-white/[0.06]')}>
      <button onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary-300">
          <Info className="h-3.5 w-3.5" /> <span className="term-key">{title}</span>
        </span>
        <span className="flex items-center gap-3">
          {chips && (
            <span className="hidden items-center gap-2 md:flex">
              {chips.map((c, i) => (
                <span key={i} className={clsx('rounded-full border px-2 py-0.5 font-mono text-xs', ACCENT[c.accent || 'emerald'].border, ACCENT[c.accent || 'emerald'].text)}>
                  {c.label} {c.value}
                </span>
              ))}
            </span>
          )}
          <ChevronDown className={clsx('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-white/[0.06] px-4 py-2.5 text-xs leading-4 md:grid-cols-2">
          <p className="text-gray-300"><span className="font-mono text-[11px] uppercase tracking-wider text-gray-400">what is happening · </span>{what}</p>
          <p className="text-gray-300"><span className="font-mono text-[11px] uppercase tracking-wider text-gray-400">why it matters · </span>{why}</p>
          {evidence && <p className="text-gray-400 md:col-span-2"><span className="font-mono text-[11px] uppercase tracking-wider text-gray-400">verify · </span>{evidence}</p>}
        </div>
      )}
    </motion.div>
  )
}

/* ── Ambient words fading in the background ────────── */
const DEFAULT_WORDS = ['schema', 'quality', 'feature', 'trust', 'predict', 'explain', 'anomaly', 'benchmark', 'report', 'history']
export function WordDrift({ words = DEFAULT_WORDS }: { words?: string[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="absolute select-none font-display text-5xl font-bold uppercase tracking-[0.2em] text-white/[0.05]"
          style={{ left: `${(i * 47 + 11) % 100}%`, top: `${(i * 31 + 17) % 100}%` }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: [0, 1, 1, 0], y: [14, -10, -46, -46] }}
          transition={{ duration: 15 + ((i * 3) % 10), delay: i * 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          {w}
        </motion.span>
      ))}
    </div>
  )
}

/* ── Full-screen expandable block ───────────────────── */
export function FullscreenBlock({
  label, children, accent = 'jade', className, initial,
}: {
  label: string
  children: ReactNode
  accent?: Accent
  className?: string
  initial?: boolean
}) {
  const a = ACCENT[accent]
  const [open, setOpen] = useState(!!initial)
  const [enter, setEnter] = useState(0)
  const [left, setLeft] = useState<'left' | 'right'>('left')

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => setEnter(1), 420)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.clearTimeout(id); window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <>
      <div className={clsx('relative flex min-h-0 flex-col overflow-hidden rounded-glass border border-white/[0.08] bg-black/30', className)}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent-rose/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-accent-gold/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-accent-emerald/70" />
            </span>
            <span className={clsx('truncate font-mono text-xs uppercase tracking-[0.18em]', a.text)}>{label}</span>
          </div>
          <span className="flex items-center gap-2">
            <button
              onClick={() => setLeft(s => s === 'left' ? 'right' : 'left')}
              disabled={!open}
              title="swap side"
              className="flex h-6 items-center gap-1 rounded-button border border-white/[0.08] px-2 font-mono text-[9px] uppercase tracking-widest text-gray-400 transition-colors hover:bg-white/[0.06] disabled:opacity-30"
            >
              <span className={clsx('inline-block h-1.5 w-1.5 rounded-full', a.dot)} /> → <span className={clsx('inline-block h-1.5 w-1.5 rounded-full border', a.border)} />
            </button>
            <button
              onClick={() => setOpen(o => !o)}
              title={open ? 'close fullscreen' : 'open fullscreen'}
              className={clsx('flex h-6 w-6 items-center justify-center rounded-button border transition-colors',
                open ? 'border-primary-500/40 bg-primary-500/15 text-primary-300' : 'border-white/[0.1] bg-white/[0.04] text-gray-400 hover:text-gray-200')}
            >
              {open ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[80] flex flex-col bg-black/70 p-4 backdrop-blur-sm sm:p-8"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.35, ease: B }}
              onClick={e => e.stopPropagation()}
              className="relative mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-glass border border-white/[0.12] bg-[#0B0E13] shadow-[0_0_80px_rgba(76,95,213,0.25)]"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-accent-rose/80" />
                    <span className="h-3 w-3 rounded-full bg-accent-gold/80" />
                    <span className="h-3 w-3 rounded-full bg-accent-emerald/80" />
                  </span>
                  <span className={clsx('truncate font-mono text-sm uppercase tracking-[0.18em]', a.text)}>{label} · full screen</span>
<span className="hidden rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gray-500 sm:inline">
                  {left === 'left' ? 'raw left → processed right' : 'processed left → raw right'}
                </span>
              </div>
                <button onClick={() => setOpen(false)}
                  className="flex h-8 items-center gap-2 rounded-button border border-white/[0.12] bg-white/[0.05] px-3 font-mono text-[11px] uppercase tracking-widest text-gray-200 transition-colors hover:bg-white/[0.1] hover:text-white">
                  <X className="h-3.5 w-3.5" />
                  cancel <span className="text-gray-500">esc</span>
                </button>
              </div>
              <div key={enter} className="min-h-0 flex-1 p-4 opacity-0"
                style={{ animation: 'fsIn .5s ease forwards' }}>
                <style>{`@keyframes fsIn { from { opacity:0; transform:scale(.98) translateY(8px) } to { opacity:1; transform:none } }`}</style>
                {children}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ── Room stage wrapper (one process = one screen) ──── */
export function RoomStage({
  chapter, title, tagline, icon, statusChip, aside, left, center, right, explain, complexity, footer, words,
}: {
  chapter: string
  title: string
  tagline?: string
  icon?: ReactNode
  statusChip?: ReactNode
  aside?: ReactNode
  left: ReactNode
  center: ReactNode
  right: ReactNode
  explain: { title: string; what: string; why: string; evidence?: string; chips?: { label: string; value: string; accent?: Accent }[] }
  complexity?: string
  footer?: ReactNode
  words?: string[]
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <WordDrift words={words} />
      <header className="relative flex shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-glass border border-white/[0.08] bg-surface-light/60 shadow-[0_0_24px_rgba(76,95,213,0.18)]">
            <span className="absolute inset-0 animate-pulse-glow rounded-glass bg-primary-500/10" />
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary-400">
              {chapter}{complexity ? <span className="ml-2 text-gray-400">· {complexity}</span> : null}
            </p>
            <h2 className="truncate font-display text-2xl font-semibold tracking-tight text-gray-100">{title}</h2>
            {tagline && <p className="truncate text-sm text-gray-400">{tagline}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {statusChip}
          {aside}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <section className="h-36 shrink-0 lg:h-40">{center}</section>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="min-h-0">{left}</section>
          <section className="min-h-0">{right}</section>
        </div>
      </div>

      <ExplainStrip title={explain.title} what={explain.what} why={explain.why} evidence={explain.evidence} chips={explain.chips} />
      {footer}
    </div>
  )
}

export { Check, ACCENT }