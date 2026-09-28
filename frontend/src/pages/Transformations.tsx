import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle, ArrowRight, Check, GitCompareArrows, Play, RefreshCw, Wand2,
} from 'lucide-react'
import {
  datasets, transformations, workflows,
  type ApplyResult, type DiffSummary, type PreviewPayload, type RunDetail, type Transformation,
} from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, n as nz } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, Button, colLabel, normRows } from '../lib/kit'
import { beatForStage } from '../lib/story'
import {
  Bar, EmptyState, LoadingState, MetricPill, Panel, SectionLabel, StageHeader,
  Stat, StatusChip, StoryFlow,
} from '../lib/stagekit'
import { cn } from '../lib/cn'

/* ── Refinement cockpit · Beat 04 · Transformation ─────────────────────
   This stage is about CHANGE, so the screen is built as a changelog
   cockpit rather than a machine diagram:

     · an applied-rule ledger — the chain in the order it was replayed,
       every rule carrying its operation, params, affected columns,
       rows_affected and applied_at
     · a before | after cockpit — the two stored snapshots read cell by
       cell, with the fields that moved highlighted, plus a live row
       sample (raw dataset preview vs the processed preview the apply
       call returns)
     · a change summary — rows_changed / columns_changed /
       nulls_before → nulls_after / mean_delta / std_delta, as stats and
       accent-coded bars
     · a rule launcher — the seven operations the backend transform
       service accepts, with parameters, target columns and a primary
       Apply that appends the next step to the chain.

   Every number is real. The ledger is GET /transformations; the diff is
   the server diff_summary for the rule you just applied, otherwise
   derived from the persisted before/after snapshots; the row views are
   datasets.preview (raw) and the processed preview in the apply result. */

const STAGE_KEY = 'transformation'
const BEAT = beatForStage(STAGE_KEY)

const SAMPLE_ROWS = 10
const SAMPLE_COLS = 5
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/* ── Snapshot contract (backend data.snapshot / column_stats) ─────────
   snapshot() → { row_count, column_count, columns[], columns_fast{} }
   column_stats → { name, dtype, null_count, unique_count, mean, std… }  */
interface SnapCol {
  name?: string
  dtype?: string
  null_count?: number
  unique_count?: number
  mean?: number | null
  std?: number | null
}
interface SnapFast {
  dtype?: string
  nulls?: number
  nunique?: number
}
interface Snapshot {
  row_count?: number
  column_count?: number
  columns?: SnapCol[]
  columns_fast?: Record<string, SnapFast>
}

interface SheetEntry {
  name: string
  dtype: string
  nulls: number | null
  unique: number | null
  mean: number | null
  std: number | null
}

function asSnapshot(v: unknown): Snapshot | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Snapshot
  if (s.columns_fast && Object.keys(s.columns_fast).length > 0) return s
  if (Array.isArray(s.columns) && s.columns.length > 0) return s
  if (typeof s.row_count === 'number') return s
  return null
}

/** columns_fast is the complete list (50 cap); columns carries the stats. */
function entriesOf(s: Snapshot | null): SheetEntry[] {
  if (!s) return []
  const stats = new Map<string, SnapCol>()
  for (const c of s.columns || []) {
    const name = String(c?.name ?? '')
    if (name) stats.set(name, c)
  }
  const out: SheetEntry[] = []
  const fast = s.columns_fast
  if (fast && Object.keys(fast).length > 0) {
    for (const [name, v] of Object.entries(fast)) {
      const full = stats.get(name)
      out.push({
        name,
        dtype: String(full?.dtype ?? v?.dtype ?? '—'),
        nulls: full?.null_count ?? (v?.nulls == null ? null : Number(v.nulls)),
        unique: full?.unique_count ?? (v?.nunique == null ? null : Number(v.nunique)),
        mean: full?.mean == null ? null : Number(full.mean),
        std: full?.std == null ? null : Number(full.std),
      })
    }
    return out
  }
  for (const c of s.columns || []) {
    const name = String(c?.name ?? '')
    if (!name) continue
    out.push({
      name,
      dtype: String(c?.dtype ?? '—'),
      nulls: c?.null_count == null ? null : Number(c.null_count),
      unique: c?.unique_count == null ? null : Number(c.unique_count),
      mean: c?.mean == null ? null : Number(c.mean),
      std: c?.std == null ? null : Number(c.std),
    })
  }
  return out
}

function sumNulls(entries: SheetEntry[]): number | null {
  if (!entries.length) return null
  if (entries.some(e => e.nulls === null)) return null
  return entries.reduce((a, e) => a + (e.nulls ?? 0), 0)
}

/** Which fields of a column moved between the two snapshots. */
function diffFields(e: SheetEntry, other: SheetEntry | undefined): string[] {
  if (!other) return ['new']
  const out: string[] = []
  if (e.dtype !== other.dtype) out.push('type')
  if ((e.nulls ?? 0) !== (other.nulls ?? 0)) out.push('nulls')
  if (e.mean !== null && other.mean !== null && Math.abs(e.mean - other.mean) > 1e-9) out.push('mean')
  if (e.std !== null && other.std !== null && Math.abs(e.std - other.std) > 1e-9) out.push('std')
  return out
}

/* ── One normalised diff shape, whatever the source ──────────────────
   The server sends mean_delta / std_delta as {column: delta} objects
   (only the first three numeric columns); the derived pass produces the
   same shape for every numeric column. Both land here.               */
interface DeltaEntry { name: string; value: number }
interface DiffView {
  rowsChanged: number | null
  columnsChanged: number | null
  nullsBefore: number | null
  nullsAfter: number | null
  meanDelta: DeltaEntry[]
  stdDelta: DeltaEntry[]
  source: 'server' | 'snapshot' | 'none'
}

const EMPTY_DIFF: DiffView = {
  rowsChanged: null, columnsChanged: null, nullsBefore: null, nullsAfter: null,
  meanDelta: [], stdDelta: [], source: 'none',
}

function deltaEntries(v: unknown): DeltaEntry[] {
  if (v == null) return []
  if (typeof v === 'number') {
    return Number.isFinite(v) ? [{ name: 'all', value: v }] : []
  }
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
      .map(([name, value]) => ({ name, value }))
  }
  return []
}

function fromServer(d: DiffSummary | null): DiffView {
  if (!d) return EMPTY_DIFF
  return {
    rowsChanged: nz(d.rows_changed),
    columnsChanged: nz(d.columns_changed),
    nullsBefore: nz(d.nulls_before),
    nullsAfter: nz(d.nulls_after),
    meanDelta: deltaEntries((d as unknown as Record<string, unknown>).mean_delta),
    stdDelta: deltaEntries((d as unknown as Record<string, unknown>).std_delta),
    source: 'server',
  }
}

/** Derive the same diff from the two persisted snapshots. */
function fromSnapshots(before: Snapshot | null, after: Snapshot | null): DiffView {
  if (!before && !after) return EMPTY_DIFF
  const b = entriesOf(before)
  const a = entriesOf(after)
  const bMap = new Map(b.map(e => [e.name, e]))
  const aMap = new Map(a.map(e => [e.name, e]))
  const changed = a.filter(e => diffFields(e, bMap.get(e.name)).length > 0).length
    + b.filter(e => !aMap.has(e.name)).length
  const meanDelta: DeltaEntry[] = []
  const stdDelta: DeltaEntry[] = []
  for (const e of a) {
    const o = bMap.get(e.name)
    if (!o) continue
    if (e.mean !== null && o.mean !== null) meanDelta.push({ name: e.name, value: e.mean - o.mean })
    if (e.std !== null && o.std !== null) stdDelta.push({ name: e.name, value: e.std - o.std })
  }
  const rowsBefore = nz(before?.row_count)
  const rowsAfter = nz(after?.row_count)
  return {
    rowsChanged: rowsBefore === null || rowsAfter === null ? null : rowsBefore - rowsAfter,
    columnsChanged: changed,
    nullsBefore: sumNulls(b),
    nullsAfter: sumNulls(a),
    meanDelta,
    stdDelta,
    source: 'snapshot',
  }
}

function whenText(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function clockText(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function shortId(id?: string | null): string {
  return String(id || '—').slice(0, 8)
}

function opLabel(op: string): string {
  return op.replace(/_/g, ' ')
}

function paramChips(p: unknown): Array<{ k: string; v: string }> {
  if (!p || typeof p !== 'object') return []
  return Object.entries(p as Record<string, unknown>)
    .filter(([k]) => k !== 'columns')
    .map(([k, v]) => ({
      k,
      v: v && typeof v === 'object'
        ? Object.entries(v as Record<string, unknown>).map(([a, b]) => `${a}→${b}`).join(' ')
        : Array.isArray(v) ? v.join(', ') : String(v),
    }))
}

/* ── Operations the backend transform service accepts ────────────────
   OPS = drop_columns, fill_missing, encode_categorical, normalize,
   outlier_clip, resample, rename_columns  (transform_service.OPS)      */
interface OpParam { key: string; label: string; options: string[] }
interface OpDef {
  key: string
  label: string
  hint: string
  scope: 'all' | 'numeric' | 'categorical'
  params: OpParam[]
  /** outlier_clip also takes a float `threshold` */
  threshold: boolean
  /** resample ignores `columns`; the others act on the selection */
  needsColumns: boolean
  /** rename_columns sends a {from: to} mapping instead of columns */
  mapping: boolean
}

const OPS: OpDef[] = [
  {
    key: 'fill_missing', label: 'Fill missing', scope: 'all',
    hint: 'impute empty cells from the column distribution',
    params: [{ key: 'strategy', label: 'strategy', options: ['mean', 'median', 'zero', 'ffill'] }],
    threshold: false, needsColumns: true, mapping: false,
  },
  {
    key: 'outlier_clip', label: 'Outlier clip', scope: 'numeric',
    hint: 'clamp extreme values inside the IQR or sigma fence',
    params: [{ key: 'method', label: 'method', options: ['iqr', 'zscore'] }],
    threshold: true, needsColumns: true, mapping: false,
  },
  {
    key: 'encode_categorical', label: 'Encode categorical', scope: 'categorical',
    hint: 'turn text categories into model-readable codes',
    params: [{ key: 'method', label: 'method', options: ['label', 'onehot'] }],
    threshold: false, needsColumns: true, mapping: false,
  },
  {
    key: 'normalize', label: 'Normalize', scope: 'numeric',
    hint: 'scale numeric columns onto one comparable range',
    params: [{ key: 'method', label: 'method', options: ['minmax', 'zscore'] }],
    threshold: false, needsColumns: true, mapping: false,
  },
  {
    key: 'resample', label: 'Resample', scope: 'all',
    hint: 're-bin the series on a time rule',
    params: [
      { key: 'rule', label: 'rule', options: ['1h', '6h', '1D', '1W'] },
      { key: 'agg', label: 'agg', options: ['mean', 'sum', 'max', 'min'] },
    ],
    threshold: false, needsColumns: false, mapping: false,
  },
  {
    key: 'drop_columns', label: 'Drop columns', scope: 'all',
    hint: 'remove fields the model must never see',
    params: [], threshold: false, needsColumns: true, mapping: false,
  },
  {
    key: 'rename_columns', label: 'Rename columns', scope: 'all',
    hint: 'relabel fields to model-friendly names',
    params: [], threshold: false, needsColumns: true, mapping: true,
  },
]

function isNumericType(dt: string | undefined): boolean {
  if (!dt) return false
  return /^(int|uint|float|double|decimal|bool|complex)/i.test(dt.trim())
    || /(int|float|double|dec|number)/i.test(dt)
}

const EMPTY_PREVIEW: PreviewPayload = { columns: [], rows: [], total_rows: 0, row_count: 0, column_count: 0 }

function asPreview(v: unknown): PreviewPayload | null {
  if (!v || typeof v !== 'object') return null
  const p = v as PreviewPayload
  return Array.isArray(p.columns) ? p : null
}

function cellText(v: unknown): { text: string; missing: boolean } {
  if (v === null || v === undefined || v === '') return { text: 'null', missing: true }
  if (typeof v === 'number') {
    return {
      text: Number.isInteger(v)
        ? v.toLocaleString()
        : v.toLocaleString(undefined, { maximumFractionDigits: 4 }),
      missing: false,
    }
  }
  return { text: String(v), missing: false }
}

export function TransformationsPage() {
  const { datasetId: routeDatasetId, runId: routeRunId } = useRouteParams()
  const navigate = useNavigate()
  const journey = useJourney()
  const { markCompleted, setActive } = journey

  /* The stage route carries a dataset id; when a run id is supplied
     instead, resolve the dataset through the run record. */
  const run = useApi<RunDetail | null>(
    () => (routeRunId ? workflows.get(routeRunId) : Promise.resolve(null)),
    [routeRunId],
  )
  const runDatasetId = run.data?.run?.dataset_id ?? ''
  const datasetId = routeDatasetId || runDatasetId || journey.datasetId || ''
  const resolving = !datasetId && (run.loading || Boolean(routeRunId))

  const list = useApi<{ transformations: Transformation[] }>(
    () => (datasetId ? transformations.list(datasetId) : Promise.resolve({ transformations: [] })),
    [datasetId],
  )
  const rawPreview = useApi<PreviewPayload>(
    () => (datasetId ? datasets.preview(datasetId, SAMPLE_ROWS * 2, 0) : Promise.resolve(EMPTY_PREVIEW)),
    [datasetId],
  )

  const [opKey, setOpKey] = useState(OPS[0].key)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [threshold, setThreshold] = useState('3')
  const [picked, setPicked] = useState<string[]>([])
  const [renames, setRenames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [appliedNow, setAppliedNow] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [serverDiff, setServerDiff] = useState<DiffSummary | null>(null)
  const [serverDiffId, setServerDiffId] = useState<string | null>(null)
  const [afterPreview, setAfterPreview] = useState<PreviewPayload | null>(null)
  const [sheetView, setSheetView] = useState<'columns' | 'rows'>('columns')

  const items = useMemo(() => list.data?.transformations ?? [], [list.data])
  const activeOp = useMemo(() => OPS.find(o => o.key === opKey) ?? OPS[0], [opKey])

  /* ── column inventory, straight off the dataset preview ─────────── */
  const colMeta = useMemo(
    () => (rawPreview.data?.columns ?? []).map(c =>
      typeof c === 'string'
        ? { name: c, data_type: undefined as string | undefined }
        : { name: colLabel(c), data_type: c?.data_type },
    ),
    [rawPreview.data],
  )
  const names = useMemo(() => colMeta.map(c => c.name).filter(Boolean), [colMeta])
  const hasTypes = useMemo(() => colMeta.some(c => Boolean(c.data_type)), [colMeta])
  const numericCols = useMemo(
    () => colMeta.filter(c => (hasTypes ? isNumericType(c.data_type) : true)).map(c => c.name),
    [colMeta, hasTypes],
  )
  const catCols = useMemo(
    () => colMeta.filter(c => (hasTypes ? !isNumericType(c.data_type) : true)).map(c => c.name),
    [colMeta, hasTypes],
  )

  const target = useMemo(() => {
    if (activeOp.scope === 'numeric') return numericCols
    if (activeOp.scope === 'categorical') return catCols
    return names
  }, [activeOp, numericCols, catCols, names])

  const targetKey = target.join('|')
  const activeKey = activeOp.key
  useEffect(() => { setPicked(target) }, [activeKey, targetKey])

  /* ── selection defaults to the newest rule in the chain ─────────── */
  useEffect(() => {
    if (!items.length) { setSelectedId(null); return }
    setSelectedId(cur => (cur && items.some(t => t.id === cur) ? cur : items[items.length - 1].id))
  }, [items])

  useEffect(() => {
    if (items.length && datasetId) {
      markCompleted(STAGE_KEY)
      setActive(datasetId)
    }
  }, [items.length, datasetId, markCompleted, setActive])

  const selected = useMemo(() => items.find(t => t.id === selectedId) ?? null, [items, selectedId])
  const beforeSnap = useMemo(() => asSnapshot(selected?.before_snapshot), [selected])
  const afterSnap = useMemo(() => asSnapshot(selected?.after_snapshot), [selected])
  const beforeEntries = useMemo(() => entriesOf(beforeSnap), [beforeSnap])
  const afterEntries = useMemo(() => entriesOf(afterSnap), [afterSnap])

  const diff = useMemo<DiffView>(() => {
    if (selected && serverDiff && serverDiffId === selected.id) return fromServer(serverDiff)
    return fromSnapshots(beforeSnap, afterSnap)
  }, [selected, serverDiff, serverDiffId, beforeSnap, afterSnap])

  /* ── chain-level aggregates ─────────────────────────────────────── */
  const applied = useMemo(() => items.filter(t => t.applied !== false), [items])
  const rowsAffected = useMemo(
    () => items.reduce((a, t) => a + (nz(t.rows_affected) ?? 0), 0),
    [items],
  )
  const touched = useMemo(() => {
    const s = new Set<string>()
    for (const t of items) for (const c of t.columns_affected || []) s.add(String(c))
    return s
  }, [items])
  const nullDelta = useMemo(() => {
    if (diff.nullsBefore === null || diff.nullsAfter === null) return null
    return diff.nullsAfter - diff.nullsBefore
  }, [diff])
  const changedCols = useMemo(() => {
    const b = new Map(beforeEntries.map(e => [e.name, e]))
    return afterEntries.filter(e => diffFields(e, b.get(e.name)).length > 0).length
  }, [afterEntries, beforeEntries])

  /* ── rule launcher state ────────────────────────────────────────── */
  const renameMap = useMemo(() => {
    const out: Record<string, string> = {}
    const used = new Set<string>()
    for (const col of picked) {
      const next = (renames[col] ?? '').trim()
      if (!next || next === col || used.has(next)) continue
      used.add(next)
      out[col] = next
    }
    return out
  }, [picked, renames])

  const renameCount = Object.keys(renameMap).length
  const ready = !activeOp.needsColumns
    ? true
    : activeOp.mapping ? renameCount > 0 : picked.length > 0

  function paramValue(p: OpParam): string {
    return choices[p.key] ?? p.options[0]
  }

  function toggleCol(name: string) {
    setPicked(prev => (prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]))
  }

  async function applyOp() {
    if (!datasetId || busy || !ready) return
    setBusy(true)
    setApplyError(null)
    setAppliedNow(false)
    const params: Record<string, unknown> = {}
    if (activeOp.needsColumns) {
      if (activeOp.mapping) params.mapping = renameMap
      else params.columns = picked
    }
    for (const p of activeOp.params) params[p.key] = paramValue(p)
    if (activeOp.threshold) params.threshold = Number(threshold) || 3
    try {
      const res: ApplyResult = await transformations.apply(datasetId, {
        operation: activeOp.key,
        params,
      })
      const t = res?.transformation ?? null
      if (t?.id) setSelectedId(t.id)
      setServerDiff(res?.diff_summary ?? null)
      setServerDiffId(t?.id ?? null)
      setAfterPreview(asPreview((res as unknown as Record<string, unknown>).preview))
      setAppliedNow(true)
      await list.refetch()
      markCompleted(STAGE_KEY)
      setActive(datasetId)
    } catch (e: any) {
      setApplyError(e?.message || 'the rule could not be applied')
    } finally {
      setBusy(false)
    }
  }

  /* ── header / lifecycle state ───────────────────────────────────── */
  const loading = list.loading && !list.data
  const failure = list.error
  const noDataset = !datasetId
  const nextStep = items.length + 1
  const activeStep = busy ? 'processed' : items.length ? 'produced' : 'entered'

  const headerChip = busy
    ? <StatusChip status="running">replaying chain</StatusChip>
    : failure
      ? <StatusChip status="warn">ledger unavailable</StatusChip>
      : items.length
        ? <StatusChip status="ok">{applied.length} of {items.length} applied</StatusChip>
        : <StatusChip status="idle">no rules yet</StatusChip>

  const nullTone = nullDelta === null ? undefined : nullDelta < 0 ? 'emerald' : nullDelta > 0 ? 'rose' : 'primary'

  if (noDataset && !resolving) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        <StageHeader
          beat={BEAT.beat}
          chapter={BEAT.chapter}
          title="Refinement cockpit"
          tagline="The chain of refinement rules this dataset has taken — with the before | after evidence for every step."
          icon={<GitCompareArrows className="h-5 w-5 text-accent-cyan" />}
        />
        <EmptyState
          title="No dataset selected"
          hint="Transformations replay a rule chain over a registered dataset. Open the library and pick one to continue."
          action={<Button onClick={() => navigate({ to: '/library' })} variant="primary" size="sm">Open dataset library</Button>}
        />
        <div className="shrink-0">
          <StoryFlow stageKey={STAGE_KEY} activeKey="entered" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={BEAT.beat}
        chapter={BEAT.chapter}
        title="Refinement cockpit"
        tagline="Every rule this dataset has taken, in the order it was applied — with the before | after evidence for each one."
        icon={<GitCompareArrows className="h-5 w-5 text-accent-cyan" />}
        right={
          <>
            {headerChip}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => list.refetch()}
              disabled={loading || busy}
              title="Re-read the transformation ledger"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </>
        }
      />

      {/* ── chain summary ─────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Rules applied"
          value={fmt(applied.length, 0)}
          hint={items.length ? `${fmt(items.length - applied.length, 0)} staged · chain of ${fmt(items.length, 0)}` : 'no rules in the chain yet'}
          accent="primary"
          mono
        />
        <Stat
          label="Rows affected"
          value={fmt(rowsAffected, 0)}
          hint="sum across the chain"
          mono
        />
        <Stat
          label="Columns touched"
          value={fmt(touched.size, 0)}
          hint={names.length ? `of ${fmt(names.length, 0)} in the dataset` : 'column list loading'}
          mono
        />
        <Stat
          label="Nulls moved"
          value={nullDelta === null ? '—' : `${nullDelta > 0 ? '+' : ''}${fmt(nullDelta, 0)}`}
          hint={nullDelta === null
            ? 'apply a rule to measure'
            : `${fmt(diff.nullsBefore ?? 0, 0)} → ${fmt(diff.nullsAfter ?? 0, 0)} · latest rule`}
          accent={nullTone}
          mono
        />
      </div>

      {/* ── chain timeline · when each rule fired ──────────────── */}
      {applied.length > 0 && (
        <Panel
          title="rule execution timeline"
          right={
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
              {applied.some(t => t.applied_at) ? 'from applied_at stamps' : 'replay order'}
            </span>
          }
        >
          {(() => {
            const stamped = applied.filter(t => t.applied_at).length
            const useClock = stamped >= 2
            const times = useClock
              ? applied.map(t => new Date(t.applied_at as string).getTime()).filter(Number.isFinite)
              : applied.map((_, i) => i)
            const t0 = times[0]
            const span = Math.max(...times, useClock ? 1 : applied.length - 1) - (useClock ? t0 : 0) || 1
            const OP_TONE: Record<string, string> = {
              normalize: 'bg-accent-cyan', fill_missing: 'bg-accent-amber', drop_duplicates: 'bg-accent-rose',
              resample: 'bg-primary-500', outlier: 'bg-accent-rose', rename: 'bg-accent-emerald',
            }
            return (
              <div className="relative mt-1 px-1 pb-1">
                <div className="h-px w-full bg-border" />
                <div className="relative h-14">
                  {applied.map((t, i) => {
                    const on = t.id === selectedId
                    const pos = useClock
                      ? ((new Date(t.applied_at as string).getTime() - t0) / span) * 100
                      : (i / Math.max(1, applied.length - 1)) * 100
                    const tone = OP_TONE[t.operation] || 'bg-t-lo'
                    return (
                      <button
                        key={t.id || i}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'group absolute top-0 flex h-14 w-16 -translate-x-1/2 flex-col items-center justify-start outline-none',
                        )}
                        style={{ left: `${Math.min(97, Math.max(3, pos))}%` }}
                        title={`${opLabel(t.operation)} · ${whenText(t.applied_at)} · ${fmt(t.rows_affected ?? 0, 0)} rows`}
                      >
                        <span className={cn('h-2.5 w-2.5 rounded-full border-2 bg-panel transition-transform group-hover:scale-125', tone, on ? 'scale-125 border-primary-400' : 'border-transparent')} />
                        <span className={cn('mt-0.5 max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.12em]', on ? 'text-t-hi' : 'text-t-lo')}>
                          {t.operation?.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[8px] text-t-lo/70">
                          {useClock ? clockText(t.applied_at) : `#${i + 1}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {useClock && (
                  <div className="flex justify-between font-mono text-[9px] text-t-lo/70">
                    <span>{clockText(applied.find(t => t.applied_at)?.applied_at)}</span>
                    <span>click a node to inspect its before | after evidence</span>
                    <span>{clockText([...applied].reverse().find(t => t.applied_at)?.applied_at)}</span>
                    <span />
                  </div>
  )}
              </div>
            )
          })()}
        </Panel>
      )}

      {resolving && <LoadingState label="Resolving the dataset for this run…" />}

      {loading && <LoadingState label="Reading the transformation ledger…" />}

      {!resolving && !loading && failure && (
        <EmptyState
          title="The transformation ledger is unavailable"
          hint={failure}
          action={<Button onClick={list.refetch} variant="primary" size="sm">Retry</Button>}
        />
      )}

      {!resolving && !loading && !failure && items.length === 0 && (
        <EmptyState
          title="The chain is empty"
          hint="No rule has been applied to this dataset yet. Launch the first one below — the before | after evidence is captured on every apply."
          action={
            <Button onClick={applyOp} disabled={busy || !ready || !datasetId} variant="primary" size="sm">
              <Play className="h-3.5 w-3.5" /> Apply rule 01
            </Button>
          }
        />
      )}

      {!resolving && !loading && !failure && items.length > 0 && (
        <div className="grid min-h-0 gap-3 xl:grid-cols-12">
          {/* ── applied-rule ledger ────────────────────────────── */}
          <Panel
            className="flex min-h-0 flex-col xl:col-span-7"
            title="applied transformation ledger"
            right={
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                replay order · {fmt(items.length, 0)} step{items.length === 1 ? '' : 's'}
              </span>
            }
            flush
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.map((t, i) => {
                const on = t.id === selectedId
                const cols = t.columns_affected || []
                const chips = paramChips(t.params)
                const isLast = i === items.length - 1
                return (
                  <button
                    key={t.id || i}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      'flex w-full items-stretch gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0',
                      on ? 'bg-primary-500/[0.05]' : 'hover:bg-panel2',
                    )}
                  >
                    <span className="relative flex w-6 shrink-0 justify-center self-stretch">
                      <span
                        className={cn(
                          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2',
                          isLast ? 'top-4' : 'top-0',
                          on ? 'bg-primary-500/45' : 'bg-border',
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          'relative z-10 mt-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-panel font-mono text-[9px]',
                          on ? 'border-primary-500 text-primary-500' : 'border-border text-t-lo',
                        )}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-mono text-[12px] font-semibold text-t-hi">
                          {opLabel(t.operation)}
                        </span>
                        {t.applied !== false
                          ? <StatusChip status="ok">applied</StatusChip>
                          : <StatusChip status="idle">staged</StatusChip>}
                        {isLast && <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">latest</span>}
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-t-lo" title={t.applied_at ?? undefined}>
                          {whenText(t.applied_at)}
                        </span>
                      </span>

                      <span className="flex flex-wrap gap-1">
                        {cols.length === 0 && <span className="font-mono text-[10px] text-t-lo">no column scope recorded</span>}
                        {cols.slice(0, 6).map(c => (
                          <span
                            key={c}
                            title={c}
                            className="max-w-[9rem] truncate rounded-button border border-border bg-panel2 px-1.5 py-px font-mono text-[9px] text-t-mid"
                          >
                            {c}
                          </span>
                        ))}
                        {cols.length > 6 && <span className="font-mono text-[9px] text-t-lo">+{cols.length - 6}</span>}
                        {chips.map(c => (
                          <span
                            key={c.k}
                            className="max-w-[11rem] truncate rounded-button border border-primary-500/25 bg-primary-500/[0.05] px-1.5 py-px font-mono text-[9px] text-primary-500"
                            title={`${c.k} = ${c.v}`}
                          >
                            {c.k}={c.v}
                          </span>
                        ))}
                      </span>
                    </span>

                    <span className="flex w-20 shrink-0 flex-col items-end gap-0.5 pt-0.5 text-right">
                      <span className="font-mono text-[13px] font-semibold text-t-hi">
                        {fmt(nz(t.rows_affected) ?? 0, 0)}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">rows</span>
                      <span className="font-mono text-[9px] text-t-lo" title={t.id ?? undefined}>{shortId(t.id)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="shrink-0 border-t border-border bg-panel2 px-4 py-2">
              <p className="font-mono text-[10px] leading-4 text-t-lo">
                every apply replays raw + all prior rules, then stores a fresh before | after snapshot ·
                params travel with the rule · rows_affected is the processed frame size at apply time
              </p>
            </div>
          </Panel>

          <div className="grid min-h-0 gap-3 xl:col-span-5 xl:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* ── before | after cockpit ────────────────────────── */}
            <Panel
              title="before | after cockpit"
              right={
                <div className="inline-flex overflow-hidden rounded-button border border-border bg-panel2 p-0.5">
                  {(['columns', 'rows'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSheetView(v)}
                      className={cn(
                        'rounded-button px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
                        sheetView === v ? 'bg-primary-500 text-white' : 'text-t-lo hover:text-t-hi',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              }
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${selected?.id ?? 'none'}-${sheetView}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetricPill label="rule" value={opLabel(selected?.operation ?? '—')} />
                    <MetricPill label="rows" value={fmt(nz(selected?.rows_affected) ?? 0, 0)} />
                    <MetricPill label="cols" value={fmt((selected?.columns_affected || []).length, 0)} />
                    <span className="font-mono text-[10px] text-t-lo" title={selected?.id ?? undefined}>
                      {shortId(selected?.id)} · {clockText(selected?.applied_at)}
                    </span>
                  </div>

                  {sheetView === 'columns' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <SnapshotSheet label="before" entries={beforeEntries} other={afterEntries} />
                        <SnapshotSheet label="after" entries={afterEntries} other={beforeEntries} />
                      </div>
                      <div className="flex items-center gap-2 rounded-button border border-border bg-panel2 px-2.5 py-1.5">
                        <span className="h-2 w-4 shrink-0 rounded-[2px] bg-accent-emerald/40" aria-hidden />
                        <span className="font-mono text-[10px] text-t-lo">type / nulls / mean / std moved</span>
                        <span className="ml-auto font-mono text-[11px] font-semibold text-t-hi">
                          {fmt(changedCols, 0)} of {fmt(afterEntries.length, 0)} columns differ
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <RowSheet
                        label="before · raw"
                        payload={rawPreview.data}
                        prefer={selected?.columns_affected}
                        loading={rawPreview.loading}
                      />
                      <RowSheet
                        label="after · processed"
                        payload={afterPreview}
                        prefer={selected?.columns_affected}
                        hint="The processed preview is returned by the apply call — apply a rule to capture a live after-view."
                      />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </Panel>

            {/* ── change summary ───────────────────────────────── */}
            <Panel
              title="change summary"
              right={
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                  {diff.source === 'server' ? 'apply diff_summary' : diff.source === 'snapshot' ? 'from snapshots' : 'nothing selected'}
                </span>
              }
            >
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                  <Stat
                    label="rows changed"
                    value={diff.rowsChanged === null ? '—' : fmt(diff.rowsChanged, 0)}
                    hint="raw → processed"
                    accent="cyan"
                    mono
                  />
                  <Stat
                    label="columns changed"
                    value={diff.columnsChanged === null ? '—' : fmt(diff.columnsChanged, 0)}
                    hint="type or profile moved"
                    accent="primary"
                    mono
                  />
                  <Stat
                    label="nulls before → after"
                    value={
                      diff.nullsBefore === null || diff.nullsAfter === null
                        ? '—'
                        : `${fmt(diff.nullsBefore, 0)} → ${fmt(diff.nullsAfter, 0)}`
                    }
                    hint={nullDelta === null ? 'no snapshot detail' : `${nullDelta > 0 ? '+' : ''}${fmt(nullDelta, 0)} cells`}
                    accent={nullTone}
                    mono
                  />
                </div>

                <div className="space-y-1.5 rounded-button border border-border bg-panel2 px-2.5 py-2">
                  <BarRow
                    label="null cells remaining"
                    value={diff.nullsAfter ?? 0}
                    max={Math.max(diff.nullsBefore ?? 0, diff.nullsAfter ?? 0, 1)}
                    tone={nullDelta !== null && nullDelta < 0 ? 'emerald' : nullDelta !== null && nullDelta > 0 ? 'rose' : 'amber'}
                    caption={diff.nullsBefore === null ? '—' : `${fmt(diff.nullsBefore, 0)} before`}
                  />
                  <BarRow
                    label="columns touched"
                    value={diff.columnsChanged ?? 0}
                    max={Math.max(afterEntries.length, beforeEntries.length, 1)}
                    tone="violet"
                    caption={`${fmt(afterEntries.length, 0)} after`}
                  />
                  <BarRow
                    label="row-count delta"
                    value={Math.abs(diff.rowsChanged ?? 0)}
                    max={Math.max(nz(beforeSnap?.row_count) ?? 0, nz(afterSnap?.row_count) ?? 0, 1)}
                    tone="cyan"
                    caption={`${fmt(nz(beforeSnap?.row_count) ?? 0, 0)} → ${fmt(nz(afterSnap?.row_count) ?? 0, 0)}`}
                  />
                </div>

                <DeltaList title="mean delta" entries={diff.meanDelta} tone="amber" />
                <DeltaList title="std delta" entries={diff.stdDelta} tone="cyan" />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ── rule launcher ─────────────────────────────────────────── */}
      {!resolving && !failure && (
        <Panel
          className="shrink-0"
          title="rule launcher"
          right={
            busy
              ? <StatusChip status="running">replaying chain</StatusChip>
              : applyError
                ? <StatusChip status="warn">apply failed</StatusChip>
                : appliedNow
                  ? <StatusChip status="ok">rule {String(nextStep - 1).padStart(2, '0')} applied</StatusChip>
                  : <StatusChip status="idle">launches as rule {String(nextStep).padStart(2, '0')}</StatusChip>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            {/* operation chooser */}
            <div className="space-y-1.5">
              <SectionLabel>operation · backend accepts {OPS.length}</SectionLabel>
              <div className="grid gap-1 sm:grid-cols-2">
                {OPS.map(op => (
                  <button
                    key={op.key}
                    type="button"
                    disabled={busy}
                    onClick={() => setOpKey(op.key)}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-button border px-2.5 py-1.5 text-left transition-colors disabled:opacity-50',
                      activeKey === op.key
                        ? 'border-primary-500/45 bg-primary-500/[0.06]'
                        : 'border-border bg-panel2 hover:bg-panel3',
                    )}
                  >
                    <span className={cn('truncate font-mono text-[11px] font-semibold', activeKey === op.key ? 'text-primary-500' : 'text-t-hi')}>
                      {op.label}
                    </span>
                    <span className="truncate text-[10px] leading-tight text-t-lo">{op.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* parameters + scope */}
            <div className="space-y-2.5">
              {activeOp.params.map(p => (
                <div key={p.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel>{p.label}</SectionLabel>
                    <span className="font-mono text-[10px] text-t-lo">{p.key}</span>
                  </div>
                  <div className="inline-flex flex-wrap gap-1">
                    {p.options.map(o => (
                      <button
                        key={o}
                        type="button"
                        disabled={busy}
                        onClick={() => setChoices(c => ({ ...c, [p.key]: o }))}
                        className={cn(
                          'rounded-button border px-2 py-1 font-mono text-[10px] transition-colors disabled:opacity-50',
                          paramValue(p) === o
                            ? 'border-primary-500/40 bg-primary-500/[0.07] text-primary-500'
                            : 'border-border bg-panel2 text-t-lo hover:text-t-hi',
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {activeOp.threshold && (
                <div className="space-y-1">
                  <SectionLabel>threshold · float</SectionLabel>
                  <input
                    value={threshold}
                    disabled={busy}
                    inputMode="decimal"
                    onChange={e => setThreshold(e.target.value)}
                    className="w-28 rounded-button border border-border bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-t-hi outline-none focus:border-primary-500/50 disabled:opacity-50"
                    aria-label="outlier clip threshold"
                  />
                </div>
              )}

              {activeOp.needsColumns && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SectionLabel>
                      {activeOp.mapping ? 'rename from · to' : 'target columns'} · {fmt(picked.length, 0)}/{fmt(target.length, 0)}
                    </SectionLabel>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPicked(target)}
                        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-500 transition-colors hover:text-t-hi disabled:opacity-50"
                      >
                        all
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPicked([])}
                        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo transition-colors hover:text-t-hi disabled:opacity-50"
                      >
                        none
                      </button>
                    </div>
                  </div>

                  {rawPreview.loading && <LoadingState label="Reading column inventory…" />}

                  {!rawPreview.loading && names.length === 0 && (
                    <p className="text-[11px] text-t-lo">
                      No columns in the dataset preview — the rule will be sent with its parameters only.
                    </p>
                  )}

                  <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                    {names.map(name => {
                      const on = picked.includes(name)
                      const eligible = target.includes(name)
                      return (
                        <span
                          key={name}
                          className={cn('inline-flex items-center overflow-hidden rounded-button border', eligible ? 'border-border' : 'border-dashed border-border opacity-50')}
                        >
                          <button
                            type="button"
                            disabled={busy || !eligible}
                            onClick={() => toggleCol(name)}
                            title={eligible ? name : `${name} · not eligible for ${activeOp.label}`}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] transition-colors disabled:cursor-not-allowed',
                              on ? 'bg-primary-500/[0.07] text-primary-500' : 'bg-panel2 text-t-lo hover:text-t-hi',
                            )}
                          >
                            {on && <Check className="h-2.5 w-2.5" />}
                            {name}
                          </button>
                          {activeOp.mapping && on && (
                            <input
                              value={renames[name] ?? ''}
                              disabled={busy}
                              placeholder={name}
                              onChange={e => setRenames(r => ({ ...r, [name]: e.target.value }))}
                              className="w-28 border-l border-border bg-panel px-1.5 py-1 font-mono text-[10px] text-t-hi outline-none focus:bg-panel2 disabled:opacity-50"
                              aria-label={`new name for ${name}`}
                            />
                          )}
                        </span>
                      )
                    })}
                  </div>

                  {activeOp.mapping && (
                    <p className="font-mono text-[10px] text-t-lo">
                      {fmt(renameCount, 0)} rename(s) queued · blank or duplicate names are skipped
                    </p>
                  )}
                </div>
              )}

              {activeOp.key === 'resample' && (
                <p className="font-mono text-[10px] leading-4 text-t-lo">
                  resample reads the <span className="text-t-mid">timestamp</span> column (or the first column)
                  and aggregates every numeric field — the service ignores a column scope.
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="min-w-0 max-w-xl font-mono text-[10px] leading-relaxed text-t-lo">
              launches as rule {String(nextStep).padStart(2, '0')} · replays raw + {fmt(items.length, 0)} prior
              rule{items.length === 1 ? '' : 's'} ·{' '}
              {rawPreview.data ? `${fmt(nz(rawPreview.data.row_count) ?? 0, 0)} rows in play` : 'reading row count…'}
              {rawPreview.data?.filename ? ` · ${rawPreview.data.filename}` : ''}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {applyError && (
                <span className="flex items-center gap-1.5 text-[11px] text-accent-rose">
                  <AlertTriangle className="h-3.5 w-3.5" /> {applyError}
                </span>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={applyOp}
                disabled={busy || !ready || !datasetId}
                loading={busy}
                title={
                  !datasetId ? 'no dataset in context'
                    : activeOp.mapping && renameCount === 0 ? 'set at least one new column name'
                      : activeOp.needsColumns && picked.length === 0 ? 'choose at least one target column'
                        : `Replay the chain and apply ${activeOp.label}`
                }
              >
                {!busy && <Play className="h-3.5 w-3.5" />}
                {busy ? 'Replaying chain…' : `Apply rule ${String(nextStep).padStart(2, '0')}`}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {/* ── 5 questions + next stage ─────────────────────────────── */}
      <div className="shrink-0">
        <StoryFlow stageKey={STAGE_KEY} activeKey={activeStep} />
      </div>

      {items.length > 0 && datasetId && (
        <div className="flex shrink-0 items-center gap-2">
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-t-lo" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
            next · feature engineering derives from this processed frame
          </span>
        </div>
      )}

      {items.length > 0 && datasetId && (
        <AutoNext
          to={`/features/${datasetId}`}
          label="Refinement chain sealed — engineering features from the processed frame"
        />
      )}
    </div>
  )
}

/* ── One side of the before | after column sheet ─────────────────── */
function SnapshotSheet({
  label, entries, other,
}: {
  label: string
  entries: SheetEntry[]
  other: SheetEntry[]
}) {
  const otherMap = useMemo(() => new Map(other.map(e => [e.name, e])), [other])
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-button border border-border bg-panel2">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <SectionLabel>{label}</SectionLabel>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">{fmt(entries.length, 0)} cols</span>
      </div>
      <div className="max-h-44 overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panel2">
            <tr>
              {['column', 'type', 'nulls', 'uniq', 'Δ'].map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    'border-b border-border px-1.5 py-1 font-mono text-[9px] font-normal uppercase tracking-wider text-t-lo',
                    (i === 2 || i === 3) && 'text-right',
                    i === 4 && 'w-8 text-right',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const fields = diffFields(e, otherMap.get(e.name))
              const moved = fields.length > 0
              return (
                <tr key={e.name} className={cn('border-b border-border/50 last:border-0', moved && 'bg-accent-emerald/[0.05]')}>
                  <td className="max-w-[7.5rem] truncate px-1.5 py-1 font-mono text-[10px] text-t-mid" title={e.name}>
                    {e.name}
                  </td>
                  <td className="px-1.5 py-1 font-mono text-[10px] text-t-lo" title={`mean ${e.mean === null ? '—' : fmt(e.mean, 3)} · std ${e.std === null ? '—' : fmt(e.std, 3)}`}>
                    {e.dtype}
                  </td>
                  <td className="px-1.5 py-1 text-right font-mono text-[10px] text-t-mid">
                    {e.nulls === null ? '—' : fmt(e.nulls, 0)}
                  </td>
                  <td className="px-1.5 py-1 text-right font-mono text-[10px] text-t-lo">
                    {e.unique === null ? '—' : fmt(e.unique, 0)}
                  </td>
                  <td className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-emerald" title={fields.join(' · ') || 'unchanged'}>
                    {moved ? fields[0] : '—'}
                  </td>
                </tr>
              )
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-5 text-center font-mono text-[10px] leading-relaxed text-t-lo">
                  this snapshot carries no column detail
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Row-level before / after view (real preview payloads) ───────── */
function RowSheet({
  label, payload, prefer, hint, loading,
}: {
  label: string
  payload: PreviewPayload | null
  prefer?: string[]
  hint?: string
  loading?: boolean
}) {
  const body = useMemo(() => {
    if (!payload || !payload.columns?.length) return null
    const matrix = normRows((payload.rows as any[]) || [], payload.columns)
    const all = payload.columns.map(colLabel).filter(Boolean)
    const focus = new Set((prefer || []).map(String))
    const cols = all.filter(c => focus.has(c)).concat(all.filter(c => !focus.has(c)))
    return { cols: cols.slice(0, SAMPLE_COLS), matrix: matrix.slice(0, SAMPLE_ROWS) }
  }, [payload, prefer])

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-button border border-border bg-panel2">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <SectionLabel>{label}</SectionLabel>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">
          {body ? `${fmt(body.matrix.length, 0)}×${fmt(body.cols.length, 0)}` : 'empty'}
        </span>
      </div>
      {loading ? (
        <p className="px-2.5 py-4 font-mono text-[10px] text-t-lo">reading rows…</p>
      ) : body ? (
        <div className="max-h-44 overflow-auto">
          <table className="w-full border-collapse text-left">
            <tbody>
              {body.matrix.map((row, ri) => (
                <tr key={ri} className="border-b border-border/50 last:border-0">
                  <td className="w-6 px-1.5 py-1 text-right font-mono text-[9px] text-t-lo">{ri + 1}</td>
                  {body.cols.map((c, ci) => {
                    const cell = cellText(row[ci])
                    return (
                      <td
                        key={c}
                        title={`${c} = ${cell.text}`}
                        className={cn(
                          'max-w-[6rem] truncate px-1.5 py-1 font-mono text-[10px]',
                          cell.missing ? 'italic text-accent-rose/80' : 'text-t-mid',
                        )}
                      >
                        {cell.text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-2.5 py-4 font-mono text-[10px] leading-relaxed text-t-lo">{hint || 'no rows in this preview'}</p>
      )}
    </div>
  )
}

/* ── One accent-coded bar row inside the change summary ──────────── */
function BarRow({
  label, value, max, tone, caption,
}: {
  label: string
  value: number
  max: number
  tone: 'primary' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet'
  caption: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">{label}</span>
        <span className="font-mono text-[10px] text-t-mid">{caption}</span>
      </div>
      <Bar value={value} max={max} tone={tone} />
    </div>
  )
}

/* ── Per-column numeric shift, normalised to the largest move ────── */
function DeltaList({
  title, entries, tone,
}: {
  title: string
  entries: DeltaEntry[]
  tone: 'amber' | 'cyan'
}) {
  if (entries.length === 0) {
    return (
      <div>
        <SectionLabel>{title}</SectionLabel>
        <p className="mt-0.5 font-mono text-[10px] text-t-lo">no numeric column stats to compare</p>
      </div>
    )
  }
  const ranked = [...entries].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 4)
  const peak = Math.max(...ranked.map(e => Math.abs(e.value)), 1e-9)
  const top = ranked[0]
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>{title}</SectionLabel>
        <span className="font-mono text-[10px] text-t-lo">
          {top ? `peak ${top.value > 0 ? '+' : ''}${fmt(top.value, 4)} · ${shortName(top.name)}` : ''}
        </span>
      </div>
      <div className="mt-1 space-y-1">
        {ranked.map(e => (
          <div key={e.name} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate font-mono text-[10px] text-t-mid" title={e.name}>
              {shortName(e.name, 12)}
            </span>
            <Bar value={Math.abs(e.value)} max={peak} tone={tone} className="flex-1" />
            <span
              className={cn(
                'w-16 shrink-0 text-right font-mono text-[10px] font-semibold',
                e.value < 0 ? 'text-accent-cyan' : 'text-accent-amber',
              )}
            >
              {e.value > 0 ? '+' : ''}{fmt(e.value, 4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function shortName(name: string, len = 9): string {
  return name.length > len ? `${name.slice(0, len - 1)}…` : name
}

export default TransformationsPage
