import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Braces, CalendarClock, CheckCircle2,
  FileText, Hash, RefreshCw, ScanSearch, Table2, ToggleLeft, Type,
} from 'lucide-react'
import { datasets, schema, workflows } from '../lib/api'
import type {
  Dataset, PreviewPayload, RunDetail, SchemaColumn, SchemaResult,
} from '../lib/api'
import { useApi } from '../lib/hooks'
import { fmt, n, useRouteParams } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, Button, colLabel, normRows } from '../lib/kit'
import {
  Bar, EmptyState, LoadingState, MetricPill, Panel, SectionLabel, StageHeader, Stat,
  StatusChip, Advanced, ResultSummary, Hero,
} from '../lib/stagekit'
import { beatForStage } from '../lib/story'
import { cn as clsx } from '../lib/cn'

/* ─────────────────────────────────────────────────────────────────────────
   BEAT 02 · DATA UNDERSTANDING — the data atlas
   Every number on this screen is read from the schema / dataset / preview
   endpoints. Nothing is decorative: the inventory is the typed schema, the
   coverage survey is the real null census, the profile is the column's own
   statistics, and the source sample is the head of the file that entered.
   ───────────────────────────────────────────────────────────────────────── */

const STAGE_KEY = 'schema_discovery'
const BEAT = beatForStage(STAGE_KEY)
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const PREVIEW_ROWS = 6
const SAMPLE_PREVIEW_ROWS = 4
const SAMPLE_PREVIEW_COLS = 10
const INVENTORY_MAX_H = 'min(58vh, 620px)'

/* ── dtype family detection (real dtype strings: float64, object, datetime64[ns]…) ── */
type Kind = 'numeric' | 'text' | 'datetime' | 'boolean' | 'object' | 'other'

function kindOf(...types: Array<string | undefined | null>): Kind {
  const t = types.filter(Boolean).join(' ').toLowerCase()
  if (!t) return 'other'
  if (/datetime|timestamp|date|time/.test(t)) return 'datetime'
  if (/bool/.test(t)) return 'boolean'
  if (/int|float|double|dec|number|num/.test(t)) return 'numeric'
  if (/dict|list|array|struct|json|nested/.test(t)) return 'object'
  if (/str|text|categor|char/.test(t)) return 'text'
  return 'other'
}

const KIND_ICON: Record<Kind, ReactNode> = {
  numeric: <Hash className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
  datetime: <CalendarClock className="h-3.5 w-3.5" />,
  boolean: <ToggleLeft className="h-3.5 w-3.5" />,
  object: <Braces className="h-3.5 w-3.5" />,
  other: <FileText className="h-3.5 w-3.5" />,
}

const KIND_TEXT: Record<Kind, string> = {
  numeric: 'text-primary-500',
  text: 'text-t-mid',
  datetime: 'text-accent-cyan',
  boolean: 'text-accent-emerald',
  object: 'text-accent-amber',
  other: 'text-t-lo',
}

const KIND_LABEL: Record<Kind, string> = {
  numeric: 'numeric',
  text: 'categorical',
  datetime: 'temporal',
  boolean: 'boolean',
  object: 'nested',
  other: 'unresolved',
}

/* ── semantic role, derived from the backend `role` first, then semantic_type ── */
type RoleKind = 'target' | 'feature' | 'identity' | 'time'

function roleOf(c: SchemaColumn): { role: RoleKind; declared: boolean } {
  const declared = String(c.role || '').toLowerCase()
  const pick = (r: RoleKind) => ({ role: r, declared: declared.length > 0 })
  if (declared === 'target' || declared === 'label') return pick('target')
  if (declared === 'identifier' || declared === 'key') return pick('identity')
  if (declared === 'feature' || declared === 'attribute') return pick('feature')
  if (declared === 'time' || declared === 'timestamp') return pick('time')
  const s = String(c.semantic_type || '').toLowerCase()
  if (s.includes('energy_value') || s.includes('consumption')) return pick('target')
  if (s.includes('timestamp') || s.includes('time')) return pick('time')
  if (s.includes('device') || s.includes('asset') || s.includes('site')) return pick('identity')
  return pick('feature')
}

const ROLE_TEXT: Record<RoleKind, string> = {
  target: 'text-accent-amber',
  feature: 'text-primary-500',
  identity: 'text-accent-violet',
  time: 'text-accent-cyan',
}

const ROLE_BOX: Record<RoleKind, string> = {
  target: 'border-accent-amber/30 bg-accent-amber/[0.06]',
  feature: 'border-primary-500/30 bg-primary-500/[0.05]',
  identity: 'border-accent-violet/30 bg-accent-violet/[0.06]',
  time: 'border-accent-cyan/30 bg-accent-cyan/[0.05]',
}

/** MetricPill paints its value in text-t-hi, so accent roles need their own chip. */
function RoleChip({ role, declared }: { role: RoleKind; declared: boolean }) {
  return (
    <span
      title={declared ? 'role reported by the schema' : 'role derived from the semantic type'}
      className={clsx(
        'inline-flex items-baseline gap-1.5 rounded-button border px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.14em]',
        ROLE_BOX[role],
      )}
    >
      <span className="text-t-lo">role</span>
      <span className={clsx('font-semibold', ROLE_TEXT[role])}>{role}</span>
    </span>
  )
}

function KindMark({ kind, className }: { kind: Kind; className?: string }) {
  return (
    <span
      title={`${KIND_LABEL[kind]} column`}
      aria-hidden
      className={clsx('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-button border border-border bg-panel2', KIND_TEXT[kind], className)}
    >
      {KIND_ICON[kind]}
    </span>
  )
}

/* ── value formatting ───────────────────────────────────────────────── */
function isVoid(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

function fmtSample(v: unknown, max = 34): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toFixed(4))) : 'NaN'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  let s: string
  if (typeof v === 'object') {
    try { s = JSON.stringify(v) } catch { s = '[object]' }
  } else {
    s = String(v)
  }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function whenText(v: unknown): string {
  if (isVoid(v)) return '—'
  const raw = v as string | number
  const d = typeof raw === 'number' ? new Date(raw < 1e11 ? raw * 1000 : raw) : new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function num(v: unknown): number {
  const x = n(v)
  return x === null ? 0 : x
}

/* ── the atlas field: one schema column, normalised for display ────── */
interface Field {
  col: SchemaColumn
  name: string
  declared: string
  resolved: string
  recast: boolean
  kind: Kind
  role: RoleKind
  roleDeclared: boolean
  semantic: string
  nulls: number
  nullPct: number
  distinct: number
  samples: unknown[]
  voids: number
}

function buildFields(cols: SchemaColumn[], totalRows: number): Field[] {
  return (cols || [])
    .filter(c => c && c.name)
    .map(c => {
      const declared = String(c.data_type || 'unknown')
      const resolved = String(c.inferred_type || declared)
      const { role, declared: roleDeclared } = roleOf(c)
      const nulls = num(c.null_count)
      let nullPct = n(c.null_rate)
      if (nullPct === null) {
        nullPct = totalRows > 0 ? (nulls / totalRows) * 100 : 0
      } else if (nullPct > 0 && nullPct <= 1 && totalRows > 0 && nulls > 0) {
        nullPct = (nulls / totalRows) * 100
      } else if (nullPct > 0 && nullPct <= 1) {
        nullPct = nullPct * 100
      }
      const samples = Array.isArray(c.sample_values) ? c.sample_values : []
      return {
        col: c,
        name: String(c.name),
        declared,
        resolved,
        recast: Boolean(c.inferred_type) && resolved !== declared,
        kind: kindOf(c.inferred_type, c.data_type),
        role,
        roleDeclared,
        semantic: String(c.semantic_type || 'generic'),
        nulls,
        nullPct: Math.max(0, Math.min(100, nullPct)),
        distinct: num(c.unique_count),
        samples,
        voids: samples.filter(isVoid).length,
      }
    })
}

/* ── missing-data severity bands (the null census) ─────────────────── */
type Tone = 'emerald' | 'cyan' | 'amber' | 'rose'

interface Band {
  key: string
  label: string
  tone: Tone
  test: (pct: number) => boolean
  note: string
}

const BANDS: Band[] = [
  { key: 'complete', label: 'complete', tone: 'emerald', test: p => p <= 0, note: 'zero missing values' },
  { key: 'trace', label: 'trace', tone: 'cyan', test: p => p > 0 && p <= 5, note: '≤ 5 % missing' },
  { key: 'sparse', label: 'sparse', tone: 'amber', test: p => p > 5 && p <= 25, note: '5–25 % missing' },
  { key: 'gapped', label: 'gapped', tone: 'amber', test: p => p > 25 && p <= 60, note: '25–60 % missing' },
  { key: 'critical', label: 'critical', tone: 'rose', test: p => p > 60, note: '> 60 % missing' },
]

const TONE_TEXT: Record<Tone, string> = {
  emerald: 'text-accent-emerald',
  cyan: 'text-accent-cyan',
  amber: 'text-accent-amber',
  rose: 'text-accent-rose',
}

function bandOf(pct: number): Band {
  return BANDS.find(b => b.test(pct)) ?? BANDS[BANDS.length - 1]
}

/* ── inventory sorting ─────────────────────────────────────────────── */
type SortKey = 'name' | 'type' | 'role' | 'semantic' | 'missing' | 'distinct' | 'sample'

const HEADS: Array<{ key: SortKey; label: string; align?: 'right' }> = [
  { key: 'name', label: 'column' },
  { key: 'type', label: 'type' },
  { key: 'role', label: 'role' },
  { key: 'semantic', label: 'semantic' },
  { key: 'missing', label: 'missing' },
  { key: 'distinct', label: 'distinct', align: 'right' },
  { key: 'sample', label: 'sample values' },
]

/* ── statistics keys we know how to label, plus anything else the API sends ── */
const STAT_KEYS: Array<[string, string]> = [
  ['min', 'min'], ['q25', 'q25'], ['median', 'median'], ['mean', 'mean'], ['q75', 'q75'],
  ['max', 'max'], ['std', 'std dev'], ['variance', 'variance'], ['skewness', 'skew'],
  ['kurtosis', 'kurt'], ['mode', 'mode'], ['cardinality', 'cardinality'],
]
const KNOWN_STAT = new Set(STAT_KEYS.map(([k]) => k))

function statValue(v: unknown): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? fmt(v, 4) : null
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string' && v.length > 0) return v.length > 18 ? `${v.slice(0, 17)}…` : v
  return null
}

/* ═══════════════════════════════════════════════════════════════════════
   Column inventory — the atlas table
   ═══════════════════════════════════════════════════════════════════════ */
function Inventory({
  fields, headerCols, totalRows, selected, onSelect, sort, onSort, warnings,
}: {
  fields: Field[]
  headerCols: string[]
  totalRows: number
  selected: string
  onSelect: (name: string) => void
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (key: SortKey) => void
  warnings: string[]
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto" style={{ maxHeight: INVENTORY_MAX_H }}>
      {/* raw header strip — the literal first line of the file that entered */}
      <div className="flex items-center gap-2 border-b border-border bg-panel2 px-3 py-1.5">
        <SectionLabel className="shrink-0">source header</SectionLabel>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {headerCols.length === 0 && <span className="font-mono text-[10px] text-t-lo">header unavailable</span>}
          {headerCols.map(c => (
            <span key={c} className="shrink-0 rounded bg-panel3 px-1.5 py-px font-mono text-[9px] text-t-mid">
              {c}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">
          {headerCols.length || fields.length} fields
        </span>
      </div>

      <table className="w-full min-w-[60rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-panel2">
            {HEADS.map(h => {
              const active = sort.key === h.key
              const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th key={h.key} className="px-3 py-1.5 font-normal">
                  <button
                    type="button"
                    onClick={() => onSort(h.key)}
                    title={`Sort by ${h.label}`}
                    className={clsx(
                      'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
                      h.align === 'right' && 'flex-row-reverse',
                      active ? 'text-primary-500' : 'text-t-lo hover:text-t-hi',
                    )}
                  >
                    {h.label}
                    <Icon className="h-3 w-3" />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {fields.map(f => {
            const on = f.name === selected
            const band = bandOf(f.nullPct)
            return (
              <tr
                key={f.name}
                tabIndex={0}
                aria-selected={on}
                onClick={() => onSelect(f.name)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(f.name) }
                }}
                className={clsx(
                  'cursor-pointer border-b border-border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary-500',
                  on ? 'bg-primary-500/[0.05]' : 'hover:bg-panel2',
                )}
              >
                <td className={clsx('border-l-2 py-1.5 pl-3 pr-3', on ? 'border-l-primary-500' : 'border-l-transparent')}>
                  <span className="flex min-w-0 items-center gap-2">
                    <KindMark kind={f.kind} />
                    <span className="truncate font-mono text-[11px] font-semibold text-t-hi" title={f.name}>{f.name}</span>
                    {f.recast && (
                      <span title={`re-cast from ${f.declared}`} className="shrink-0 rounded-full border border-accent-cyan/30 bg-accent-cyan/[0.06] px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-cyan">
                        recast
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={clsx('font-mono text-[10px]', KIND_TEXT[f.kind])}>{f.resolved}</span>
                  {f.recast && <span className="ml-1.5 font-mono text-[10px] text-t-lo">← {f.declared}</span>}
                </td>
                <td className="px-3 py-1.5"><RoleChip role={f.role} declared={f.roleDeclared} /></td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex max-w-[150px] truncate rounded-button border border-border bg-panel2 px-1.5 py-[2px] font-mono text-[9px] text-t-mid" title={f.semantic}>
                    {f.semantic}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <Bar value={f.nullPct} tone={band.tone} className="w-14" />
                    <span className={clsx('w-11 shrink-0 text-right font-mono text-[10px]', f.nulls > 0 ? TONE_TEXT[band.tone] : 'text-t-lo')}>
                      {fmt(f.nullPct, 2)}%
                    </span>
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[10px] text-t-mid">{fmt(f.distinct, 0)}</td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2 overflow-hidden">
                    {f.samples.length === 0 && <span className="font-mono text-[10px] text-t-lo">no sample captured</span>}
                    {f.samples.slice(0, 2).map((v, i) => (
                      <span
                        key={i}
                        title={fmtSample(v, 90)}
                        className={clsx(
                          'max-w-[150px] shrink-0 truncate font-mono text-[10px]',
                          isVoid(v) ? 'italic text-accent-rose' : 'text-t-lo',
                        )}
                      >
                        {fmtSample(v)}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            )
          })}
          {fields.length === 0 && (
            <tr>
              <td colSpan={HEADS.length} className="px-3 py-10 text-center text-xs text-t-lo">
                no columns profiled
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-panel2">
            <td colSpan={HEADS.length} className="px-3 py-1.5">
              <p className="font-mono text-[10px] leading-4 text-t-lo">
                {fields.length} typed field{fields.length === 1 ? '' : 's'} · {fmt(totalRows, 0)} rows profiled ·
                missing % = null_count ÷ rows, taken from null_rate when the API supplies it
              </p>
            </td>
          </tr>
          {warnings.length > 0 && (
            <tr>
              <td colSpan={HEADS.length} className="px-3 py-2">
                <div className="rounded-button border border-accent-amber/30 bg-accent-amber/[0.06] px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-accent-amber" />
                    <SectionLabel className="text-accent-amber">discovery warnings · {warnings.length}</SectionLabel>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-[11px] leading-snug text-t-mid">{w}</li>
                    ))}
                  </ul>
                </div>
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Column profile — the selected field's own numbers
   ═══════════════════════════════════════════════════════════════════════ */
function ColumnProfile({ field, totalRows }: { field: Field; totalRows: number }) {
  const stats = useMemo(() => (field.col.statistics || {}) as Record<string, unknown>, [field.col])
  const statPairs = useMemo(() => {
    const known = STAT_KEYS
      .filter(([k]) => statValue(stats[k]) !== null)
      .map(([k, label]): [string, string] => [k, label])
    const extra = Object.keys(stats)
      .filter(k => !KNOWN_STAT.has(k) && statValue(stats[k]) !== null)
      .slice(0, 8)
      .map((k): [string, string] => [k, k.replace(/_/g, ' ').toLowerCase()])
    return [...known, ...extra]
  }, [stats])

  const numericSamples = field.samples
    .map(v => (typeof v === 'number' ? v : Number(v)))
    .filter(v => Number.isFinite(v))
    .slice(0, 16)

  const distinct = useMemo(() => {
    const counts = new Map<string, number>()
    field.samples.forEach(v => {
      const k = isVoid(v) ? '∅' : fmtSample(v, 24)
      counts.set(k, (counts.get(k) || 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [field.samples])

  const band = bandOf(field.nullPct)
  const completeness = Math.max(0, 100 - field.nullPct)

  return (
    <motion.div
      key={field.name}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="space-y-3.5"
    >
      {/* identity */}
      <div className="flex min-w-0 items-start gap-2.5">
        <KindMark kind={field.kind} className="h-7 w-7" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-semibold text-t-hi" title={field.name}>{field.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-t-lo">
            {field.declared === field.resolved ? field.resolved : `${field.resolved} · re-cast from ${field.declared}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <RoleChip role={field.role} declared={field.roleDeclared} />
        <MetricPill label="semantic" value={field.semantic} />
        <MetricPill label="nullable" value={field.col.nullable ? 'yes' : 'no'} />
        <MetricPill label="kind" value={KIND_LABEL[field.kind]} />
      </div>

      {/* the missing bar */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>completeness</SectionLabel>
          <span className={clsx('font-mono text-[11px] font-semibold', TONE_TEXT[band.tone])}>
            {fmt(completeness, 2)}% present
          </span>
        </div>
        <Bar value={completeness} tone={band.tone} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-t-lo">
          <span>{fmt(field.nulls, 0)} missing of {fmt(totalRows, 0)} rows</span>
          <span>{fmt(field.nullPct, 2)}% null rate</span>
          {field.voids > 0 && <span className="text-accent-rose">{field.voids} void in sample</span>}
        </div>
      </div>

      {/* three headline counters */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-button border border-border bg-panel2 px-2.5 py-1.5">
          <SectionLabel>distinct</SectionLabel>
          <p className="mt-0.5 font-mono text-sm font-semibold text-t-hi">{fmt(field.distinct, 0)}</p>
        </div>
        <div className="rounded-button border border-border bg-panel2 px-2.5 py-1.5">
          <SectionLabel>missing</SectionLabel>
          <p className={clsx('mt-0.5 font-mono text-sm font-semibold', field.nulls > 0 ? TONE_TEXT[band.tone] : 'text-accent-emerald')}>
            {fmt(field.nulls, 0)}
          </p>
        </div>
        <div className="rounded-button border border-border bg-panel2 px-2.5 py-1.5">
          <SectionLabel>samples</SectionLabel>
          <p className="mt-0.5 font-mono text-sm font-semibold text-t-hi">{fmt(field.samples.length, 0)}</p>
        </div>
      </div>

      {/* statistics straight off the API */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>statistics</SectionLabel>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">{statPairs.length} reported</span>
        </div>
        {statPairs.length === 0 ? (
          <p className="text-[11px] text-t-lo">the API returned no statistics block for this column.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {statPairs.map(([k, label]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 rounded-button border border-border bg-panel2 px-2.5 py-1">
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">{label}</span>
                <span className="shrink-0 font-mono text-[11px] font-semibold text-t-hi">{statValue(stats[k])}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* sample profile — numeric spread, or the observed value census */}
      <div className="space-y-1.5">
        <SectionLabel>{numericSamples.length > 1 ? 'sampled spread' : 'observed values'}</SectionLabel>
        {numericSamples.length > 1 ? (
          (() => {
            /* binned distribution — a real histogram, not a value sparkline */
            const lo = Math.min(...numericSamples)
            const hi = Math.max(...numericSamples)
            const span = hi - lo
            const BINS = 12
            const bins = Array.from({ length: BINS }, () => 0)
            for (const v of numericSamples) {
              const b = span > 0 ? Math.min(BINS - 1, Math.floor(((v - lo) / span) * BINS)) : 0
              bins[b] += 1
            }
            const peak = Math.max(...bins, 1)
            const mean = num(stats.mean)
            const median = num(stats['50%'] ?? stats.median)
            const mark = (v: number, color: string, label: string) =>
              Number.isFinite(v) && span > 0 ? (
                <span
                  className="pointer-events-none absolute bottom-1 top-1 w-px"
                  style={{ left: `${((v - lo) / span) * 100}%`, background: color }}
                  title={`${label} ${fmt(v, 4)}`}
                />
              ) : null
            return (
              <>
                <div className="rounded-button border border-border bg-panel2 px-2 py-1.5">
                  <div className="relative flex h-14 items-end gap-[2px]">
                    {bins.map((c, i) => (
                      <motion.span
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(4, (c / peak) * 100)}%` }}
                        transition={{ duration: 0.4, delay: i * 0.03, ease: EASE }}
                        title={`bin ${i + 1}: ${c} sample${c === 1 ? '' : 's'} · ${fmt(lo + (span * i) / BINS, 3)} → ${fmt(lo + (span * (i + 1)) / BINS, 3)}`}
                        className={clsx('min-w-[4px] flex-1 rounded-t-[2px]', c > 0 ? 'bg-primary-500' : 'bg-white/[0.05]')}
                      />
                    ))}
                    {mark(mean, 'var(--color-accent-amber)', 'mean')}
                    {mark(median, 'var(--color-accent-emerald)', 'median')}
                  </div>
                </div>
                <div className="flex items-center justify-between font-mono text-[9px] text-t-lo">
                  <span>min {fmt(lo, 4)}</span>
                  <span className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-px bg-accent-amber" /> mean {Number.isFinite(mean) ? fmt(mean, 3) : '—'}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-px bg-accent-emerald" /> median {Number.isFinite(median) ? fmt(median, 3) : '—'}</span>
                  </span>
                  <span>max {fmt(hi, 4)}</span>
                </div>
              </>
            )
          })()
        ) : distinct.length === 0 ? (
          <p className="text-[11px] text-t-lo">no sample values were captured for this column.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {distinct.map(([value, count]) => (
              <span
                key={value}
                title={`${count} of ${field.samples.length} sampled`}
                className={clsx(
                  'inline-flex max-w-[190px] items-baseline gap-1.5 rounded-button border px-2 py-1 font-mono text-[10px]',
                  value === '∅'
                    ? 'border-accent-rose/30 bg-accent-rose/[0.05] text-accent-rose'
                    : 'border-border bg-panel2 text-t-mid',
                )}
              >
                <span className="truncate">{value}</span>
                <span className="shrink-0 text-t-lo">×{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Coverage survey — the null census, bucketed by severity
   ═══════════════════════════════════════════════════════════════════════ */
function CoverageSurvey({
  fields, totalRows, missingCells, coveragePct, missingByColumn,
}: {
  fields: Field[]
  totalRows: number
  missingCells: number
  coveragePct: number
  missingByColumn: Record<string, number>
}) {
  const counts = useMemo(
    () => BANDS.map(b => ({ ...b, fields: fields.filter(f => bandOf(f.nullPct).key === b.key) })),
    [fields],
  )
  const verdict: 'ok' | 'warn' = coveragePct >= 99.5 ? 'ok' : 'warn'
  const verdictLabel = coveragePct >= 99.5 ? 'dense' : coveragePct >= 90 ? 'minor gaps' : 'porous'
  const previewKeys = Object.keys(missingByColumn || {})

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <SectionLabel>cell coverage</SectionLabel>
          <p className={clsx(
            'mt-0.5 font-mono text-xl font-semibold',
            coveragePct >= 99.5 ? 'text-accent-emerald' : coveragePct >= 90 ? 'text-accent-amber' : 'text-accent-rose',
          )}>
            {fmt(coveragePct, 2)}%
          </p>
        </div>
        <StatusChip status={verdict}>{verdictLabel}</StatusChip>
      </div>
      <Bar value={coveragePct} tone={coveragePct >= 99.5 ? 'emerald' : coveragePct >= 90 ? 'amber' : 'rose'} />
      <p className="font-mono text-[10px] text-t-lo">
        {fmt(missingCells, 0)} missing of {fmt(totalRows * fields.length, 0)} cells across {fmt(fields.length, 0)} fields
      </p>

      <div className="space-y-2">
        {counts.map(b => (
          <div key={b.key}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className={clsx('h-1.5 w-1.5 rounded-full', b.tone === 'emerald' ? 'bg-accent-emerald' : b.tone === 'cyan' ? 'bg-accent-cyan' : b.tone === 'amber' ? 'bg-accent-amber' : 'bg-accent-rose')} aria-hidden />
                <span className={clsx('text-[11px] font-semibold uppercase tracking-[0.14em]', TONE_TEXT[b.tone])}>{b.label}</span>
                <span className="font-mono text-[9px] text-t-lo">{b.note}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] font-semibold text-t-hi">
                {fmt(b.fields.length, 0)}
              </span>
            </div>
            <Bar value={b.fields.length} max={Math.max(1, fields.length)} tone={b.tone} className="mt-1" />
            {b.fields.length > 0 && (
              <p className="mt-1 truncate font-mono text-[9px] text-t-lo" title={b.fields.map(f => f.name).join(', ')}>
                {b.fields.slice(0, 6).map(f => f.name).join(' · ')}
                {b.fields.length > 6 ? ` +${b.fields.length - 6}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>

      {previewKeys.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>preview missing_summary</SectionLabel>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">sample window</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {previewKeys.slice(0, 8).map(k => (
              <div key={k} className="flex items-baseline justify-between gap-2 rounded-button border border-border bg-panel2 px-2.5 py-1">
                <span className="truncate font-mono text-[10px] text-t-mid" title={k}>{k}</span>
                <span className="shrink-0 font-mono text-[10px] font-semibold text-accent-rose">
                  {fmt(missingByColumn[k], 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Semantic role map — what the surveyor thinks each field is for
   ═══════════════════════════════════════════════════════════════════════ */
const ROLE_ORDER: RoleKind[] = ['target', 'time', 'identity', 'feature']

function RoleMap({ fields }: { fields: Field[] }) {
  const groups = useMemo(
    () => ROLE_ORDER.map(role => ({ role, fields: fields.filter(f => f.role === role) })).filter(g => g.fields.length > 0),
    [fields],
  )
  const semanticKinds = useMemo(
    () => [...new Set(fields.map(f => f.semantic))].sort().slice(0, 14),
    [fields],
  )

  if (groups.length === 0) {
    return <p className="text-xs text-t-lo">No roles detected yet — run schema discovery to classify fields.</p>
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {groups.map(g => (
          <div key={g.role} className={clsx('rounded-button border px-2.5 py-2', ROLE_BOX[g.role])}>
            <div className="flex items-center justify-between gap-2">
              <span className={clsx('text-[11px] font-semibold uppercase tracking-[0.14em]', ROLE_TEXT[g.role])}>{g.role}</span>
              <span className="font-mono text-[11px] font-semibold text-t-hi">{fmt(g.fields.length, 0)}</span>
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-t-mid" title={g.fields.map(f => f.name).join(', ')}>
              {g.fields.slice(0, 5).map(f => f.name).join(' · ')}
              {g.fields.length > 5 ? ` +${g.fields.length - 5}` : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-border pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>detected semantic types</SectionLabel>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">{semanticKinds.length} distinct</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {semanticKinds.map(s => {
            const count = fields.filter(f => f.semantic === s).length
            return (
              <span
                key={s}
                title={`${count} column${count === 1 ? '' : 's'}`}
                className="inline-flex items-baseline gap-1.5 rounded-button border border-accent-cyan/30 bg-accent-cyan/[0.05] px-2 py-1 font-mono text-[10px]"
              >
                <span className="text-accent-cyan">{s}</span>
                <span className="text-t-lo">×{count}</span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Source sample — the literal head of the dataset that entered
   ═══════════════════════════════════════════════════════════════════════ */
function SourceSample({
  dataset, headerCols, rows, loading, totalRows,
}: {
  dataset: Dataset | null
  headerCols: string[]
  rows: any[][]
  loading: boolean
  totalRows: number
}) {
  const shown = rows.slice(0, SAMPLE_PREVIEW_ROWS)
  const cols = headerCols.slice(0, SAMPLE_PREVIEW_COLS)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <MetricPill label="dataset" value={dataset?.name ? dataset.name : '—'} />
        <MetricPill label="source" value={dataset?.source_type || '—'} />
        <MetricPill label="rows" value={fmt(totalRows, 0)} />
        <MetricPill label="cols" value={fmt(dataset?.column_count ?? headerCols.length, 0)} />
      </div>

      {loading ? (
        <p className="text-[11px] text-t-lo">Reading the first rows of the file…</p>
      ) : shown.length === 0 || cols.length === 0 ? (
        <p className="text-[11px] text-t-lo">
          The preview endpoint returned no rows for this dataset — the header above is the only thing on record.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-button border border-border bg-panel2">
          <div className="min-w-max">
            <div
              className="grid gap-x-3 border-b border-border px-3 py-1.5"
              style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(72px, 1fr))` }}
            >
              {cols.map(c => (
                <span key={c} className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo" title={c}>{c}</span>
              ))}
            </div>
            {shown.map((row, ri) => (
              <div
                key={ri}
                className="grid gap-x-3 border-b border-border px-3 py-1.5 last:border-0"
                style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(72px, 1fr))` }}
              >
                {cols.map((_, ci) => {
                  const v = row[ci]
                  return (
                    <span
                      key={ci}
                      title={fmtSample(v, 90)}
                      className={clsx(
                        'truncate font-mono text-[10px]',
                        isVoid(v) ? 'italic text-accent-rose' : ci === 0 ? 'text-t-mid' : 'text-t-lo',
                      )}
                    >
                      {isVoid(v) ? '∅' : fmtSample(v, 22)}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] leading-4 text-t-lo">
        {fmt(shown.length, 0)} of {fmt(totalRows, 0)} rows shown · {headerCols.length > SAMPLE_PREVIEW_COLS
          ? `first ${SAMPLE_PREVIEW_COLS} of ${headerCols.length} columns`
          : `${headerCols.length} columns`} · ∅ marks a null cell
      </p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Discovery log — provenance + warnings
   ═══════════════════════════════════════════════════════════════════════ */
function DiscoveryLog({
  datasetId, runId, source, discoveredAt, elapsedMs, warnings, datasetName,
}: {
  datasetId: string
  runId: string | null
  source: string
  discoveredAt: string
  elapsedMs: number | null
  warnings: string[]
  datasetName: string | null
}) {
  return (
    <div className="space-y-3">
      <dl className="space-y-1.5">
        {[
          ['dataset', datasetName || '—'],
          ['dataset id', datasetId],
          ['run id', runId || '—'],
          ['schema source', source],
          ['discovered', discoveredAt],
          ['elapsed', elapsedMs === null ? '—' : `${fmt(elapsedMs, 0)} ms`],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5 last:border-0">
            <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">{k}</dt>
            <dd className="min-w-0 truncate text-right font-mono text-[11px] text-t-hi" title={v}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1.5">
        <SectionLabel>warnings</SectionLabel>
        {warnings.length === 0 ? (
          <p className="flex items-center gap-1.5 text-[11px] text-accent-emerald">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            the profiler reported no anomalies
          </p>
        ) : (
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 rounded-button border border-accent-amber/30 bg-accent-amber/[0.06] px-2 py-1.5"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-accent-amber" />
                <span className="text-[11px] leading-snug text-t-mid">{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════ */
export function SchemaDiscoveryPage() {
  const params = useRouteParams()
  const navigate = useNavigate()
  const { markCompleted, setActive, mode } = useJourney()
  const beat = beatForStage(STAGE_KEY)

  /* Route params. The stage is dataset-scoped, but a run id is honoured so the
     page can be deep-linked from a workflow and still resolve its dataset. */
  const routeDatasetId = params.datasetId
  const routeRunId = params.runId

  const runRes = useApi<RunDetail | null>(
    () => (routeRunId ? workflows.get(routeRunId) : Promise.resolve(null)),
    [routeRunId],
  )
  const runId = routeRunId || runRes.data?.run?.id || null
  const datasetId = routeDatasetId || runRes.data?.run?.dataset_id || null

  const metaRes = useApi<Dataset | null>(
    () => (datasetId ? datasets.get(datasetId) : Promise.resolve(null)),
    [datasetId],
  )
  const schemaRes = useApi<SchemaResult | null>(
    () => (datasetId ? schema.get(datasetId) : Promise.resolve(null)),
    [datasetId],
  )
  const previewRes = useApi<PreviewPayload | null>(
    () => (datasetId ? datasets.preview(datasetId, PREVIEW_ROWS, 0) : Promise.resolve(null)),
    [datasetId],
  )

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [selected, setSelected] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  /* ── data ─────────────────────────────────────────────────────── */
  const cols = useMemo(() => schemaRes.data?.columns ?? [], [schemaRes.data])

  const totalRows = useMemo(() => {
    const a = n(metaRes.data?.row_count)
    if (a !== null && a > 0) return a
    const b = n(previewRes.data?.total_rows)
    if (b !== null && b > 0) return b
    return 0
  }, [metaRes.data, previewRes.data])

  const fields = useMemo(() => buildFields(cols, totalRows), [cols, totalRows])

  const headerCols = useMemo(
    () => (previewRes.data?.columns ?? []).map(c => colLabel(c)).filter(Boolean),
    [previewRes.data],
  )
  const previewRows = useMemo(
    () => normRows((previewRes.data?.rows ?? []) as any[], previewRes.data?.columns ?? []),
    [previewRes.data],
  )
  const missingByColumn = useMemo(
    () => (previewRes.data?.missing_summary ?? {}) as Record<string, number>,
    [previewRes.data],
  )

  /* ── census ───────────────────────────────────────────────────── */
  const missingCells = useMemo(() => fields.reduce((a, f) => a + f.nulls, 0), [fields])
  const coveragePct = useMemo(() => {
    if (fields.length === 0) return 0
    const cells = totalRows * fields.length
    if (cells > 0) return Math.max(0, (1 - missingCells / cells) * 100)
    const avg = fields.reduce((a, f) => a + f.nullPct, 0) / fields.length
    return Math.max(0, 100 - avg)
  }, [fields, totalRows, missingCells])

  const typeCount = useMemo(() => new Set(fields.map(f => f.resolved)).size, [fields])
  const recastCount = useMemo(() => fields.filter(f => f.recast).length, [fields])
  const warnings = useMemo(
    () => (Array.isArray(schemaRes.data?.warnings) ? schemaRes.data!.warnings! : []).filter(w => !!w && String(w).trim()),
    [schemaRes.data],
  )
  const elapsedMs = n(schemaRes.data?.elapsed_ms)
  const discoveredAt = whenText(schemaRes.data?.discovered_at)
  const source = String(schemaRes.data?.source || 'raw')

  /* ── ordering + selection ─────────────────────────────────────── */
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const key = (f: Field): string | number => {
      switch (sort.key) {
        case 'name': return f.name.toLowerCase()
        case 'type': return f.resolved.toLowerCase()
        case 'role': return f.role
        case 'semantic': return f.semantic.toLowerCase()
        case 'missing': return f.nullPct
        case 'distinct': return f.distinct
        default: return f.samples.length
      }
    }
    return [...fields].sort((a, b) => {
      const av = key(a)
      const bv = key(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [fields, sort])

  useEffect(() => {
    if (fields.length === 0) { setSelected(null); return }
    setSelected(cur => (cur && fields.some(f => f.name === cur) ? cur : fields[0].name))
  }, [fields])

  const active = useMemo(
    () => sorted.find(f => f.name === selected) ?? sorted[0] ?? null,
    [sorted, selected],
  )

  function onSort(key: SortKey) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  /* ── actions ──────────────────────────────────────────────────── */
  async function discover() {
    if (!datasetId || busy) return
    setBusy(true)
    setActionError(null)
    try {
      await schema.discover(datasetId, { use_processed: false })
      await schemaRes.refetch()
    } catch (e: any) {
      setActionError(e?.message || 'schema discovery failed')
    } finally {
      setBusy(false)
    }
  }

  /* Auto mode is a passthrough stage: profile once if nothing is stored yet. */
  const autoTried = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (mode !== 'auto' || !datasetId || busy || schemaRes.loading) return
    if (cols.length > 0) return
    if (autoTried.current.has(datasetId)) return
    autoTried.current.add(datasetId)
    void discover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, datasetId, busy, schemaRes.loading, cols.length])

  /* The stage is complete the moment a real typed schema is on screen. */
  useEffect(() => {
    if (!datasetId) return
    setActive(datasetId)
  }, [datasetId, setActive])

  useEffect(() => {
    if (cols.length > 0) {
      markCompleted(STAGE_KEY)
      setCompleted(true)
    }
  }, [cols.length, markCompleted])

  /* ── lifecycle ────────────────────────────────────────────────── */
  const failure = actionError ?? (cols.length > 0 ? null : schemaRes.error)
  const busyGate = schemaRes.loading || metaRes.loading

  const headerRight = (
    <>
      {busy ? <StatusChip status="running">profiling</StatusChip>
        : failure ? <StatusChip status="warn">unavailable</StatusChip>
          : fields.length > 0 ? <StatusChip status="ok">{fmt(fields.length, 0)} typed</StatusChip>
            : <StatusChip status="idle">awaiting survey</StatusChip>}
      <Button
        size="sm"
        onClick={discover}
        disabled={!datasetId || busy}
        aria-busy={busy}
        className="whitespace-nowrap"
      >
        {busy ? null : fields.length > 0 ? <RefreshCw className="h-3.5 w-3.5" /> : <ScanSearch className="h-3.5 w-3.5" />}
        {busy ? 'Profiling…' : fields.length > 0 ? 'Re-discover' : 'Discover schema'}
      </Button>
    </>
  )

  if (!datasetId) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        <StageHeader
          beat={beat.beat}
          chapter={beat.chapter}
          title="Column Discovery"
          tagline="Every field of the dataset is typed, classified and sampled — the survey that everything downstream trusts."
          icon={<ScanSearch className="h-5 w-5" />}
          right={headerRight}
        />
        <EmptyState
          title="No dataset selected"
          hint="Column discovery profiles a registered dataset. Pick one from the library and the survey starts immediately."
          action={<Button size="sm" onClick={() => navigate({ to: '/library' })}>Open dataset library</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={beat.beat}
        chapter={beat.chapter}
        title="Schema Discovery"
        tagline="Every field of the dataset is typed, classified and sampled — the survey that everything downstream trusts."
        icon={<ScanSearch className="h-5 w-5" />}
        right={headerRight}
      />

      {busyGate && fields.length === 0 && <LoadingState label="Reading column types and profiling samples…" />}

      {!busyGate && fields.length === 0 && (
        <EmptyState
          title={failure ? 'No schema profiled for this dataset' : 'The survey has not run yet'}
          hint={failure
            ? `${failure} — run discovery to type every column, classify its role and capture real sample values.`
            : 'Run schema discovery to type every column, classify its role, count missing values and capture real sample values.'}
          action={<Button size="sm" onClick={discover} loading={busy}><ScanSearch className="h-3.5 w-3.5" /> Discover schema</Button>}
        />
      )}

      {fields.length > 0 && (
        <>
          {/* ── atlas ──────────────────────────────────────────── */}
          <Hero>
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <SectionLabel>Column inventory</SectionLabel>
              <span className="hidden font-mono text-[10px] text-t-lo sm:inline">
                {fmt(sorted.length, 0)} fields · {fmt(totalRows, 0)} rows
              </span>
            </div>
              <Inventory
                fields={sorted}
                headerCols={headerCols}
                totalRows={totalRows}
                selected={active?.name ?? ''}
                onSelect={setSelected}
                sort={sort}
                onSort={onSort}
                warnings={warnings}
              />
</Hero>

          <div className="shrink-0 space-y-2">
              <Advanced label="Column profile" hint={active ? KIND_LABEL[active.kind] : undefined} defaultOpen>
                {active ? (
                  <ColumnProfile field={active} totalRows={totalRows} />
                ) : (
                  <p className="text-xs text-t-lo">Select a column from the inventory to profile it.</p>
                )}
              </Advanced>

              <Advanced label="Coverage survey" hint={`${fmt(missingCells, 0)} missing cells · ${fmt(coveragePct, 2)}% coverage`}>
                <CoverageSurvey
                  fields={fields}
                  totalRows={totalRows}
                  missingCells={missingCells}
                  coveragePct={coveragePct}
                  missingByColumn={missingByColumn}
                />
              </Advanced>
          </div>

          {/* ── Level 3: role map, sample, log ────────────────── */}
          <div className="grid shrink-0 gap-3 xl:grid-cols-12">
            <Advanced label="Semantic role map" hint={`${fmt(fields.length, 0)} fields classified`}>
              <div className="-m-4">
              <RoleMap fields={fields} />
            </div></Advanced>

            <Advanced label="Source sample" hint={`${fmt(Math.min(previewRows.length, SAMPLE_PREVIEW_ROWS), 0)} row preview`}>
              <div className="-m-4">
              <SourceSample
                dataset={metaRes.data}
                headerCols={headerCols}
                rows={previewRows}
                loading={previewRes.loading}
                totalRows={totalRows}
              />
            </div></Advanced>

            <Advanced label="Discovery log" hint={warnings.length > 0 ? `${fmt(warnings.length, 0)} warnings` : 'clean'}>
              <div className="-m-4">
              <DiscoveryLog
                datasetId={datasetId}
                runId={runId}
                source={source}
                discoveredAt={discoveredAt}
                elapsedMs={elapsedMs}
                warnings={warnings}
                datasetName={metaRes.data?.name ?? null}
              />
            </div></Advanced>
          </div>
        </>
      )}

      <ResultSummary
        verdict={
          fields.length === 0
            ? 'Run discovery: every column gets typed, classified and sampled — the survey everything downstream trusts.'
            : `${fmt(fields.length, 0)} fields typed across ${fmt(totalRows, 0)} rows — ${fmt(typeCount, 0)} distinct types, ${fmt(coveragePct, 1)}% cell coverage.`
        }
        facts={[
          { label: 'Columns', value: fmt(fields.length, 0) },
          { label: 'Types', value: fmt(typeCount, 0) },
          { label: 'Coverage', value: `${fmt(coveragePct, 1)}%` },
        ]}
      />

      {completed && datasetId && (
        <AutoNext
          to={`/transformations/${datasetId}`}
          label="Schema mapped — opening the Transformations stage"
        />
      )}
    </div>
  )
}

export default SchemaDiscoveryPage
