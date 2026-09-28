import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Check, Clock, Download, FileCode2, FileStack, FileText,
  Play, RefreshCw, Table2,
} from 'lucide-react'
import { datasets, reports, type Report } from '../lib/api'
import { API_BASE } from '../lib/api'
import { useApi } from '../lib/hooks'
import { fmt, n } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { beatForStage } from '../lib/story'
import {
  Bar, EmptyState, LoadingState, MetricPill, Panel, SectionLabel, StageHeader,
  Stat, StatusChip, StoryFlow,
} from '../lib/stagekit'
import { AutoNext, Button, DoneChip } from '../lib/kit'
import { cn } from '../lib/cn'

/* ── Document production desk · Beat 13 · Report ──────────────────────────
   The last stage turns a whole run into files someone else can read. So the
   screen is a production desk, not a table:

     · deliverable gallery — one card per stored file: title, type + format
       pills, the section manifest that was actually written, status, size
       and the download action
     · production desk — the dataset in context, the effective title, the
       format and report-type selectors, the section manifest to compile, and
       the primary generate that POSTs /reports/generate
     · document inspector — opens one deliverable: every section, how many
       table rows it carries, the stored file path, and a re-read that pulls
       the record back from the server
     · delivery ledger — the six most recent files plus the section-coverage
       map, i.e. which evidence sections this account has ever produced.

   Everything on screen is the real /reports payload: GET /reports for the
   archive, POST /reports/generate for a new file, GET /reports/{id} to
   re-verify one, GET /reports/{id}/download for the bytes.             */

const STAGE_KEY = 'report'
const BEAT = beatForStage(STAGE_KEY)

/* The shared Report interface omits dataset_id / file_path and types the
   timestamps as non-null, while the service returns both and allows nulls.
   Widen it locally so nothing is read off a possibly-absent field. */
type ReportRow = Omit<
  Report,
  'sections' | 'status' | 'generated_at' | 'file_size_bytes'
> & {
  sections?: unknown
  status?: string | null
  generated_at?: string | null
  file_size_bytes?: number | null
  dataset_id?: string | null
  file_path?: string | null
}

interface SectionEntry {
  title: string
  content: string
  rows: number
}

/* ── What the report service can compile ───────────────────────────────
   _sections() in report_service.py emits these titles. Some are emitted
   unconditionally, some only when the run produced the evidence. A string
   list is matched case-insensitively against the generated manifest.      */
interface SectionDef { title: string; group: GroupKey }
type GroupKey = 'core' | 'quality' | 'models' | 'findings' | 'method'

const GROUP_LABEL: Record<GroupKey, string> = {
  core: 'context',
  quality: 'data integrity',
  models: 'model & trust',
  findings: 'findings & actions',
  method: 'method',
}

const SECTION_LIBRARY: SectionDef[] = [
  { title: 'Executive Summary', group: 'core' },
  { title: 'Dataset & Provenance', group: 'core' },
  { title: 'Data Quality Assessment', group: 'quality' },
  { title: 'Pipeline Execution', group: 'quality' },
  { title: 'Model Performance', group: 'models' },
  { title: 'AI Confidence Gate', group: 'models' },
  { title: 'Explainability', group: 'models' },
  { title: 'Benchmarks', group: 'models' },
  { title: 'Anomalies', group: 'findings' },
  { title: 'Recommendations', group: 'findings' },
  { title: 'Methodology & Footnotes', group: 'method' },
]

const GROUP_ORDER: GroupKey[] = ['core', 'quality', 'models', 'findings', 'method']
const ALL_TITLES = SECTION_LIBRARY.map(s => s.title)

interface TypeDef {
  key: string
  label: string
  hint: string
  sections: string[]
}

const TYPES: TypeDef[] = [
  {
    key: 'executive', label: 'Executive', hint: 'narrative brief for leadership',
    sections: ['Executive Summary', 'Dataset & Provenance', 'Recommendations', 'Methodology & Footnotes'],
  },
  {
    key: 'performance', label: 'Performance', hint: 'metrics, trust and explainability',
    sections: ['Executive Summary', 'Model Performance', 'AI Confidence Gate', 'Explainability', 'Benchmarks', 'Methodology & Footnotes'],
  },
  {
    key: 'compliance', label: 'Compliance', hint: 'provenance and execution audit trail',
    sections: ['Executive Summary', 'Dataset & Provenance', 'Data Quality Assessment', 'Pipeline Execution', 'Methodology & Footnotes'],
  },
  { key: 'full', label: 'Full', hint: 'every section this run can produce', sections: ALL_TITLES },
]

interface FormatDef { key: 'pdf' | 'html' | 'csv'; label: string; hint: string; icon: typeof FileText }

const FORMATS: FormatDef[] = [
  { key: 'pdf', label: 'PDF', hint: 'paginated, print-ready', icon: FileText },
  { key: 'html', label: 'HTML', hint: 'single file, browser-ready', icon: FileCode2 },
  { key: 'csv', label: 'CSV', hint: 'flat section dump', icon: Table2 },
]

const FORMAT_TONE: Record<string, string> = {
  pdf: 'text-accent-rose',
  html: 'text-primary-500',
  csv: 'text-accent-cyan',
}

const LEDGER_ROWS = 6

/* ── Payload normalisers — the archive is untrusted shape ───────────── */
function sectionsOf(raw: unknown): SectionEntry[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const out: SectionEntry[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const t = entry.trim()
      if (t) out.push({ title: t, content: '', rows: 0 })
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    const s = entry as Record<string, unknown>
    const title = String(s.title ?? '').trim()
    if (!title) continue
    out.push({
      title,
      content: typeof s.content === 'string' ? s.content : '',
      rows: Array.isArray(s.rows) ? s.rows.length : 0,
    })
  }
  return out
}

function bytes(v: number | null): string {
  if (v === null) return '—'
  if (v < 1024) return `${fmt(v, 0)} B`
  if (v < 1024 * 1024) return `${fmt(v / 1024, 1)} KB`
  return `${fmt(v / (1024 * 1024), 2)} MB`
}

function when(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function stamp(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function shortId(id?: string | null): string {
  return String(id || '—').slice(0, 8)
}

function titleOf(r: ReportRow | null): string {
  const t = r?.title?.trim()
  return t && t.length ? t : 'Untitled deliverable'
}

function typeOf(r: ReportRow | null): string {
  const t = r?.report_type?.trim()
  return t && t.length ? t : 'unspecified'
}

function formatOf(r: ReportRow | null): string {
  const f = r?.format?.trim().toLowerCase()
  return f && f.length ? f : 'unknown'
}

function downloadName(r: ReportRow): string {
  const stem = titleOf(r).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'ecomind-report'
  return `${stem}.${formatOf(r)}`
}

type Chip = 'ok' | 'running' | 'warn' | 'idle'

function statusTone(s: string | null | undefined): Chip {
  const k = String(s ?? '').trim().toLowerCase()
  if (['completed', 'complete', 'success', 'succeeded', 'sealed', 'ready', 'ok'].includes(k)) return 'ok'
  if (['running', 'generating', 'pending', 'queued', 'processing', 'in_progress'].includes(k)) return 'running'
  if (['failed', 'error', 'partial', 'degraded'].includes(k)) return 'warn'
  return 'idle'
}

function statusText(s: string | null | undefined): string {
  const k = String(s ?? '').trim().toLowerCase().replace(/_/g, ' ')
  return k.length ? k : 'unknown'
}

/* ── A 1px indeterminate sweep — only ever rendered while a call is live */
function Sweep({ label, elapsedMs }: { label: string; elapsedMs: number }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-panel2 px-3 py-2">
      <StatusChip status="running">{label}</StatusChip>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel3">
        <motion.span
          className="absolute inset-y-0 w-1/3 rounded-full bg-primary-500"
          initial={{ x: '-130%' }}
          animate={{ x: ['-130%', '330%'] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <span className="shrink-0 font-mono text-[11px] text-t-mid">
        {fmt(elapsedMs / 1000, 1)}s
      </span>
    </div>
  )
}

/* ── CSV preview: fetch the blob text and show the head rows in the mono grid ── */
function PreparedCsvPreview({ url }: { url: string }) {
  const [rows, setRows] = useState<string[][] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch(url)
      .then(r => r.text())
      .then(t => {
        if (!alive) return
        const lines = t.split(/\r?\n/).filter(l => l.length > 0).slice(0, 24)
        setRows(lines.map(l => l.split(',')))
      })
      .catch(() => alive && setErr('the csv could not be parsed for preview'))
    return () => { alive = false }
  }, [url])
  if (err) return <p className="px-3 py-3 font-mono text-[10px] text-accent-rose">{err}</p>
  if (!rows) return <p className="px-3 py-3 font-mono text-[10px] text-t-lo">parsing csv…</p>
  const width = Math.max(...rows.map(r => r.length), 1)
  return (
    <div className="max-h-[420px] overflow-auto">
      <div
        className="grid gap-x-3 bg-panel px-3 py-2 font-mono text-[10px] text-t-mid"
        style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
      >
        {rows.map((r, ri) =>
          r.map((cell, ci) => (
            <span key={`${ri}-${ci}`} className={cn('truncate', ri === 0 && 'font-semibold text-t-hi')}>
              {cell}
            </span>
          )),
        )}
      </div>
    </div>
  )
}

/* ── One node of the production flow. State comes from the real request. */
type FlowState = 'done' | 'active' | 'idle' | 'fail'

const FLOW_DOT: Record<FlowState, string> = {
  done: 'bg-accent-emerald',
  active: 'bg-primary-500',
  idle: 'bg-panel3',
  fail: 'bg-accent-rose',
}

function FlowNode({ state, label, detail }: { state: FlowState; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', FLOW_DOT[state])} aria-hidden />
      <div className="min-w-0">
        <p className={cn('font-mono text-[10px] uppercase tracking-widest', state === 'idle' ? 'text-t-lo' : 'text-t-mid')}>
          {label}
        </p>
        <p className="truncate text-[11px] text-t-lo" title={detail}>{detail}</p>
      </div>
    </li>
  )
}

export function ReportGenerationPage() {
  const { datasetId: ctxDatasetId, setActive, markCompleted } = useJourney()

  const dsList = useApi(() => datasets.list(), [])
  const allDatasets = useMemo(() => dsList.data?.datasets ?? [], [dsList.data])

  /* No route param on /reports — the dataset comes from the journey store,
     then the first registered dataset as the last-resort default. */
  const [pickedDataset, setPickedDataset] = useState<string>('')
  const datasetId = pickedDataset || ctxDatasetId || allDatasets[0]?.id || ''
  const dataset = useMemo(
    () => allDatasets.find(d => d.id === datasetId) ?? null,
    [allDatasets, datasetId],
  )
  const datasetName = dataset?.name?.trim() || (datasetId ? shortId(datasetId) : 'no dataset in context')

  const archive = useApi(() => reports.list(), [])
  const items = useMemo<ReportRow[]>(
    () => (archive.data?.reports ?? []).map(r => ({ ...r })),
    [archive.data],
  )

  /* ── production desk state ───────────────────────────────────────── */
  const [type, setType] = useState(TYPES[0].key)
  const [format, setFormat] = useState<FormatDef['key']>('pdf')
  const [title, setTitle] = useState('')
  const [pickedSections, setPickedSections] = useState<string[]>(TYPES[0].sections)
  const [busy, setBusy] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [runError, setRunError] = useState<string | null>(null)
  const [sealed, setSealed] = useState<{ id?: string; size: number | null; sections: number; ms: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspected, setInspected] = useState<ReportRow | null>(null)
  const [reloading, setReloading] = useState(false)
  const [dlId, setDlId] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  /* live elapsed clock — real wall time of the in-flight request */
  useEffect(() => {
    if (!busy) return
    const id = window.setInterval(
      () => setElapsed(Date.now() - (startedAt ?? Date.now())),
      120,
    )
    return () => window.clearInterval(id)
  }, [busy, startedAt])

  /* stage completion is a passthrough: any stored file means the stage ran */
  useEffect(() => {
    if (!items.length || !datasetId) return
    markCompleted(STAGE_KEY)
    setActive(datasetId)
  }, [items.length, datasetId, markCompleted, setActive])

  const activeType = useMemo(() => TYPES.find(t => t.key === type) ?? TYPES[0], [type])
  const effectiveTitle = title.trim() || (datasetId ? `EcoMind AI Report — ${datasetName}` : 'EcoMind AI Report')
  const ready = Boolean(datasetId) && !busy && pickedSections.length > 0

  const latest = items.length ? items[0] : null
  const totalBytes = useMemo(() => {
    let sum = 0
    let seen = false
    for (const r of items) {
      const b = n(r.file_size_bytes)
      if (b !== null) { sum += b; seen = true }
    }
    return seen ? sum : null
  }, [items])
  const formatKinds = useMemo(() => {
    const set = new Set<string>()
    items.forEach(r => { const f = formatOf(r); if (f !== 'unknown') set.add(f) })
    return set
  }, [items])
  const coverage = useMemo(() => {
    const seen = new Set<string>()
    for (const r of items) for (const s of sectionsOf(r.sections)) seen.add(s.title.toLowerCase())
    return seen
  }, [items])
  const coveredCount = useMemo(
    () => SECTION_LIBRARY.filter(s => coverage.has(s.title.toLowerCase())).length,
    [coverage],
  )
  const archivedSections = useMemo(
    () => items.reduce((acc, r) => acc + sectionsOf(r.sections).length, 0),
    [items],
  )

  const selected = useMemo(
    () => items.find(r => r.id === selectedId) ?? latest,
    [items, selectedId, latest],
  )
  /* a re-read from the server outranks the cached list entry */
  const openReport = useMemo(
    () => (inspected && inspected.id === selected?.id ? inspected : selected) ?? null,
    [inspected, selected],
  )
  const openSections = useMemo(() => sectionsOf(openReport?.sections), [openReport])

  function chooseType(key: string) {
    const def = TYPES.find(t => t.key === key)
    if (!def) return
    setType(def.key)
    setPickedSections(def.sections)
  }

  function toggleSection(titleText: string) {
    setPickedSections(prev =>
      prev.includes(titleText) ? prev.filter(t => t !== titleText) : [...prev, titleText],
    )
  }

  function chooseDataset(next: string) {
    setPickedDataset(next)
    if (next) setActive(next)
  }

  function openDoc(r: ReportRow) {
    setSelectedId(r.id)
    setInspected(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewError(null)
  }

  /* ── live file preview — the real stored bytes, auth-fetched into an iframe ──
     PDF renders natively; HTML renders as the document; CSV renders as text. */
  async function openPreview(r: ReportRow) {
    if (previewLoading) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const token = localStorage.getItem('ecomind_token')
      const res = await fetch(`${API_BASE}/reports/${r.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`the file could not be read (${res.status})`)
      const blob = await res.blob()
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (e: any) {
      setPreviewError(e?.message || 'preview unavailable')
    } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewError(null)
  }

  async function reread() {
    if (!selected?.id || reloading) return
    setReloading(true)
    setDlError(null)
    try {
      const fresh = (await reports.get(selected.id)) as ReportRow
      setInspected(fresh)
    } catch (e: any) {
      setDlError(e?.message || 'the record could not be re-read')
    } finally {
      setReloading(false)
    }
  }

  async function download(r: ReportRow) {
    if (!r.id || dlId) return
    setDlId(r.id)
    setDlError(null)
    try {
      await reports.download(r.id, downloadName(r))
    } catch (e: any) {
      setDlError(e?.message || 'download failed')
    } finally {
      setDlId(null)
    }
  }

  async function generate() {
    if (!ready || !datasetId) return
    const t0 = Date.now()
    setBusy(true)
    setStartedAt(t0)
    setElapsed(0)
    setRunError(null)
    setSealed(null)
    try {
      const res = await reports.generate({
        dataset_id: datasetId,
        title: title.trim() || undefined,
        report_type: activeType.key,
        format,
        sections: pickedSections,
      })
      const made = (res?.report ?? null) as ReportRow | null
      setSealed({
        id: made?.id ?? undefined,
        size: n(made?.file_size_bytes),
        sections: sectionsOf(made?.sections).length,
        ms: Date.now() - t0,
      })
      if (made?.id) {
        setSelectedId(made.id)
        setInspected(null)
      }
      markCompleted(STAGE_KEY)
      setActive(datasetId)
      await archive.refetch()
    } catch (e: any) {
      setRunError(e?.message || 'generation failed')
    } finally {
      setBusy(false)
      setStartedAt(null)
    }
  }

  /* ── lifecycle ───────────────────────────────────────────────────── */
  const loading = archive.loading && !archive.data
  const failure = archive.error
  const ledger = items.slice(0, LEDGER_ROWS)
  const activeStep = busy ? 'processed' : items.length ? 'produced' : 'entered'

  const headerChip = busy
    ? <StatusChip status="running">writing file</StatusChip>
    : runError
      ? <StatusChip status="warn">generate failed</StatusChip>
      : sealed
        ? <StatusChip status="ok">sealed in {fmt(sealed.ms / 1000, 1)}s</StatusChip>
        : items.length
          ? <StatusChip status="ok">{fmt(items.length, 0)} in archive</StatusChip>
          : <StatusChip status="idle">archive empty</StatusChip>

  if (loading) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        <StageHeader
          beat={BEAT.beat}
          chapter="Report"
          title="Document production desk"
          tagline="Compile the run into files someone else can read — and keep every one of them re-downloadable."
          icon={<FileStack className="h-5 w-5 text-primary-500" />}
          right={headerChip}
        />
        <LoadingState label="Reading the deliverable archive…" />
        <div className="shrink-0"><StoryFlow stageKey={STAGE_KEY} activeKey="entered" /></div>
      </div>
    )
  }

  if (failure) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        <StageHeader
          beat={BEAT.beat}
          chapter="Report"
          title="Document production desk"
          tagline="Compile the run into files someone else can read — and keep every one of them re-downloadable."
          icon={<FileStack className="h-5 w-5 text-primary-500" />}
          right={<StatusChip status="warn">archive unavailable</StatusChip>}
        />
        <EmptyState
          title="The deliverable archive is unavailable"
          hint={failure}
          action={<Button size="sm" onClick={archive.refetch}>Retry</Button>}
        />
        <div className="shrink-0"><StoryFlow stageKey={STAGE_KEY} activeKey="entered" /></div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={BEAT.beat}
        chapter="Report"
        title="Document production desk"
        tagline="Compile the run into files someone else can read — and keep every one of them re-downloadable."
        icon={<FileStack className="h-5 w-5 text-primary-500" />}
        right={
          <>
            {headerChip}
            {sealed && <DoneChip text="Report generated" />}
            <Button
              size="sm"
              variant="secondary"
              onClick={archive.refetch}
              disabled={archive.loading || busy}
              title="Re-read the deliverable archive"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </>
        }
      />

      {/* ── archive summary ─────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Deliverables"
          value={fmt(items.length, 0)}
          hint={`${bytes(totalBytes)} of stored output`}
          accent="primary"
          mono
        />
        <Stat
          label="Section coverage"
          value={`${fmt(coveredCount, 0)}/${fmt(SECTION_LIBRARY.length, 0)}`}
          hint={`${fmt(archivedSections, 0)} sections written across the archive`}
          accent="cyan"
          mono
        />
        <Stat
          label="Formats on file"
          value={fmt(formatKinds.size, 0)}
          hint={formatKinds.size ? Array.from(formatKinds).join(' · ').toUpperCase() : 'nothing produced yet'}
          mono
        />
        <Stat
          label="Latest deliverable"
          value={latest ? when(latest.generated_at) : '—'}
          hint={latest ? `${formatOf(latest).toUpperCase()} · ${bytes(n(latest.file_size_bytes))} · ${shortId(latest.id)}` : 'generate the first file'}
          mono
        />
      </div>

      {busy && <Sweep label="assembling document" elapsedMs={elapsed} />}

      {runError && (
        <div className="flex items-center gap-2.5 rounded-card border border-accent-rose/30 bg-accent-rose/10 px-3.5 py-2.5 text-xs text-accent-rose">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{runError}</span>
        </div>
      )}

      {dlError && (
        <div className="flex items-center gap-2.5 rounded-card border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-2.5 text-xs text-accent-amber">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{dlError}</span>
        </div>
      )}

      <div className="grid min-h-0 gap-3 xl:grid-cols-12">
        {/* ── deliverable gallery ──────────────────────────────────── */}
        <Panel
          className="xl:col-span-7"
          title="deliverable gallery"
          flush
          right={
            <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
              {fmt(items.length, 0)} file{items.length === 1 ? '' : 's'} · newest first
            </span>
          }
        >
          {items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No deliverable has been compiled yet"
                hint="Pick a format on the production desk and compile the first audit-ready file for this dataset."
                action={
                  <Button size="sm" onClick={generate} disabled={!ready}>
                    <Play className="h-3.5 w-3.5" /> Generate report
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="max-h-[25rem] overflow-y-auto p-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {items.map(r => {
                  const secs = sectionsOf(r.sections)
                  const on = openReport?.id === r.id
                  return (
                    <article
                      key={r.id || stamp(r.generated_at)}
                      className={cn(
                        'flex min-w-0 flex-col gap-2 rounded-card border bg-panel p-3 transition-colors',
                        on
                          ? 'border-primary-500/40 shadow-[0_1px_2px_rgba(20,28,48,.05),0_8px_24px_rgba(20,28,48,.07)]'
                          : 'border-border hover:border-primary-500/25',
                      )}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => openDoc(r)}
                          title="Open in the document inspector"
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[13px] font-semibold leading-snug text-t-hi">
                            {titleOf(r)}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-t-lo">
                            {shortId(r.id)} · {stamp(r.generated_at)}
                          </span>
                        </button>
                        <StatusChip status={statusTone(r.status)}>{statusText(r.status)}</StatusChip>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <MetricPill label="type" value={typeOf(r)} />
                        <MetricPill
                          label="format"
                          value={formatOf(r).toUpperCase()}
                          accent={FORMAT_TONE[formatOf(r)]}
                        />
                        <MetricPill label="size" value={bytes(n(r.file_size_bytes))} />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <SectionLabel>section manifest</SectionLabel>
                          <span className="font-mono text-[10px] text-t-mid">
                            {fmt(secs.length, 0)}/{fmt(SECTION_LIBRARY.length, 0)}
                          </span>
                        </div>
                        <Bar value={secs.length} max={SECTION_LIBRARY.length} tone="primary" />
                      </div>

                      {secs.length > 0 && (
                        <ul className="flex min-w-0 flex-wrap gap-1">
                          {secs.slice(0, 4).map(s => (
                            <li
                              key={s.title}
                              title={s.title}
                              className="max-w-[10.5rem] truncate rounded-button border border-border bg-panel2 px-1.5 py-px font-mono text-[9px] text-t-mid"
                            >
                              {s.title}
                            </li>
                          ))}
                          {secs.length > 4 && (
                            <li className="rounded-button border border-border bg-panel2 px-1.5 py-px font-mono text-[9px] text-t-lo">
                              +{fmt(secs.length - 4, 0)}
                            </li>
                          )}
                        </ul>
                      )}

                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
                        <span className="truncate font-mono text-[10px] text-t-lo" title={r.file_path ?? undefined}>
                          {r.file_path ? r.file_path.split(/[\\/]/).pop() : 'file path not recorded'}
                        </span>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => download(r)}
                          disabled={dlId !== null}
                          title={`Download ${downloadName(r)}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          {dlId === r.id ? 'Saving…' : 'Download'}
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}
        </Panel>

        {/* ── production desk ──────────────────────────────────────── */}
        <Panel
          className="xl:col-span-5"
          title="production desk"
          right={headerChip}
        >
          <div className="space-y-3">
            {/* dataset in context */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>dataset in context</SectionLabel>
                <span className="font-mono text-[10px] text-t-lo">
                  {datasetId ? shortId(datasetId) : '—'}
                </span>
              </div>
              {allDatasets.length > 1 ? (
                <select
                  value={datasetId}
                  onChange={e => chooseDataset(e.target.value)}
                  disabled={busy}
                  aria-label="Dataset to compile the report for"
                  className="w-full rounded-button border border-border bg-panel2 px-2.5 py-1.5 text-[12px] text-t-hi outline-none focus:border-primary-500/50 disabled:opacity-50"
                >
                  {allDatasets.map(d => (
                    <option key={d.id} value={d.id}>{d.name || shortId(d.id)}</option>
                  ))}
                </select>
              ) : (
                <p className="rounded-button border border-border bg-panel2 px-2.5 py-1.5 text-[12px] text-t-hi">
                  {datasetName}
                </p>
              )}
            </div>

            {/* effective title */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>title · blank uses the service default</SectionLabel>
                <span className="font-mono text-[10px] text-t-lo">{title.length}/{fmt(120, 0)}</span>
              </div>
              <input
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, 120))}
                disabled={busy}
                placeholder={datasetId ? `EcoMind AI Report — ${datasetName}` : 'Select a dataset first'}
                aria-label="Report title"
                className="w-full rounded-button border border-border bg-panel2 px-2.5 py-1.5 text-[12px] text-t-hi outline-none placeholder:text-t-lo focus:border-primary-500/50 disabled:opacity-50"
              />
            </div>

            {/* format */}
            <div className="space-y-1">
              <SectionLabel>format · service accepts pdf · html · csv</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {FORMATS.map(f => {
                  const on = format === f.key
                  return (
                    <button
                      key={f.key}
                      type="button"
                      disabled={busy}
                      onClick={() => setFormat(f.key)}
                      title={f.hint}
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-button border px-2 py-1.5 text-left transition-colors disabled:opacity-50',
                        on
                          ? 'border-primary-500/45 bg-primary-500/[0.06]'
                          : 'border-border bg-panel2 hover:bg-panel3',
                      )}
                    >
                      <span className={cn('flex items-center gap-1 font-mono text-[11px] font-semibold', on ? 'text-primary-500' : 'text-t-hi')}>
                        <f.icon className="h-3.5 w-3.5" /> {f.label}
                      </span>
                      <span className="truncate text-[10px] leading-tight text-t-lo">{f.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* report type */}
            <div className="space-y-1">
              <SectionLabel>report type · presets the section manifest</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {TYPES.map(t => {
                  const on = type === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      disabled={busy}
                      onClick={() => chooseType(t.key)}
                      title={t.hint}
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-button border px-2 py-1.5 text-left transition-colors disabled:opacity-50',
                        on
                          ? 'border-primary-500/45 bg-primary-500/[0.06]'
                          : 'border-border bg-panel2 hover:bg-panel3',
                      )}
                    >
                      <span className={cn('font-mono text-[11px] font-semibold capitalize', on ? 'text-primary-500' : 'text-t-hi')}>
                        {t.label}
                      </span>
                      <span className="truncate text-[10px] leading-tight text-t-lo">{t.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* section manifest */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>
                  section manifest · {fmt(pickedSections.length, 0)}/{fmt(SECTION_LIBRARY.length, 0)}
                </SectionLabel>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPickedSections(ALL_TITLES)}
                    className="font-mono text-[10px] uppercase tracking-widest text-primary-500 transition-colors hover:text-t-hi disabled:opacity-50"
                  >
                    all
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPickedSections([])}
                    className="font-mono text-[10px] uppercase tracking-widest text-t-lo transition-colors hover:text-t-hi disabled:opacity-50"
                  >
                    none
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {GROUP_ORDER.map(g => (
                  <div key={g} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-[6.5rem] shrink-0 font-mono text-[9px] uppercase tracking-widest text-t-lo">
                      {GROUP_LABEL[g]}
                    </span>
                    {SECTION_LIBRARY.filter(s => s.group === g).map(s => {
                      const on = pickedSections.includes(s.title)
                      return (
                        <button
                          key={s.title}
                          type="button"
                          disabled={busy}
                          onClick={() => toggleSection(s.title)}
                          title={s.title}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-button border px-2 py-1 font-mono text-[10px] transition-colors disabled:opacity-50',
                            on
                              ? 'border-primary-500/40 bg-primary-500/[0.06] text-primary-500'
                              : 'border-border bg-panel2 text-t-lo hover:text-t-hi',
                          )}
                        >
                          {on && <Check className="h-2.5 w-2.5" />}
                          {s.title}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>

              <p className="font-mono text-[10px] leading-4 text-t-lo">
                titles are matched case-insensitively against the manifest the service builds for this
                run · sections the run cannot evidence are dropped · a selection that matches nothing
                falls back to the full manifest
              </p>
            </div>

            {/* production flow */}
            <ol className="space-y-2 rounded-card border border-border bg-panel2 p-3">
              <FlowNode
                state={busy || sealed ? 'done' : 'active'}
                label="queued"
                detail={`${activeType.key} · ${format.toUpperCase()} · ${fmt(pickedSections.length, 0)} section${pickedSections.length === 1 ? '' : 's'} requested`}
              />
              <FlowNode
                state={sealed ? 'done' : runError ? 'idle' : busy ? 'active' : 'idle'}
                label="writing file"
                detail={busy
                  ? `server rendering ${format.toUpperCase()} · ${fmt(elapsed / 1000, 1)}s elapsed`
                  : runError
                    ? 'no file written — read the error above'
                    : 'starts when the generate call is posted'}
              />
              <FlowNode
                state={runError ? 'fail' : sealed ? 'done' : 'idle'}
                label="sealed"
                detail={sealed
                  ? `${shortId(sealed.id)} · ${bytes(sealed.size)} · ${fmt(sealed.sections, 0)} sections written · ${fmt(sealed.ms / 1000, 1)}s`
                  : 'the file only lands here after the service commits it'}
              />
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-t-lo" title={effectiveTitle}>
                title · {effectiveTitle}
              </p>
              <Button
                size="sm"
                onClick={generate}
                disabled={!ready}
                loading={busy}
                title={
                  !datasetId ? 'no dataset in context'
                    : pickedSections.length === 0 ? 'select at least one section'
                      : `POST /reports/generate · ${format.toUpperCase()}`
                }
              >
                {!busy && <Play className="h-3.5 w-3.5" />}
                {busy ? 'Compiling…' : 'Generate report'}
              </Button>
            </div>
          </div>
        </Panel>

        {/* ── document inspector ───────────────────────────────────── */}
        <Panel
          className="xl:col-span-5"
          title="document inspector"
          right={
            openReport ? (
              <button
                type="button"
                onClick={reread}
                disabled={reloading || dlId !== null}
                title="GET /reports/{id} — re-read this record from the server"
                className="inline-flex items-center gap-1.5 rounded-button border border-border bg-panel2 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-t-lo transition-colors hover:text-t-hi disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3 w-3', reloading && 'animate-spin')} />
                {reloading ? 'reading' : 're-read'}
              </button>
            ) : undefined
          }
        >
          {!openReport ? (
            <p className="text-xs text-t-lo">
              No deliverable open. Pick a card in the gallery to read its section manifest.
            </p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-t-hi" title={titleOf(openReport)}>
                    {titleOf(openReport)}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-t-lo">
                    {shortId(openReport.id)} · generated {stamp(openReport.generated_at)}
                  </p>
                </div>
                <StatusChip status={statusTone(openReport.status)}>{statusText(openReport.status)}</StatusChip>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <MetricPill label="type" value={typeOf(openReport)} />
                <MetricPill
                  label="format"
                  value={formatOf(openReport).toUpperCase()}
                  accent={FORMAT_TONE[formatOf(openReport)]}
                />
                <MetricPill label="size" value={bytes(n(openReport.file_size_bytes))} />
                <MetricPill label="sections" value={fmt(openSections.length, 0)} />
                <MetricPill label="tables" value={fmt(openSections.reduce((a, s) => a + s.rows, 0), 0)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <SectionLabel>compiled manifest</SectionLabel>
                  <span className="font-mono text-[10px] text-t-lo">
                    {inspected && inspected.id === openReport.id ? 'server record' : 'archive record'}
                  </span>
                </div>
                {openSections.length === 0 ? (
                  <p className="text-[11px] text-t-lo">
                    This record carries no section manifest — open the file to read it directly.
                  </p>
                ) : (
                  <ol className="divide-y divide-border rounded-button border border-border">
                    {openSections.map((s, i) => (
                      <li key={`${s.title}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 font-mono text-[10px] text-t-lo">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="truncate text-[12px] text-t-mid" title={s.title}>{s.title}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-t-lo">
                          {s.rows > 0 ? `${fmt(s.rows, 0)} rows` : 'prose'}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="space-y-1 rounded-button border border-border bg-panel2 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">stored file</span>
                  <span className="truncate font-mono text-[10px] text-t-mid" title={openReport.file_path ?? undefined}>
                    {openReport.file_path || 'path not recorded'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">dataset</span>
                  <span className="truncate font-mono text-[10px] text-t-mid">
                    {shortId(openReport.dataset_id)}
                    {openReport.dataset_id === datasetId ? ' · in context' : ''}
                  </span>
                </div>
              </div>

              {/* live file preview — real bytes, rendered in-app */}
              <div className="space-y-2">
                {previewUrl && openReport.id === selected?.id ? (
                  <div className="overflow-hidden rounded-button border border-border">
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-panel2 px-2.5 py-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                        preview · {formatOf(openReport).toUpperCase()}
                      </span>
                      <button
                        type="button"
                        onClick={closePreview}
                        className="font-mono text-[10px] uppercase tracking-widest text-t-lo transition-colors hover:text-t-hi"
                      >
                        close
                      </button>
                    </div>
                    {formatOf(openReport) === 'csv' ? (
                      <PreparedCsvPreview url={previewUrl} />
                    ) : (
                      <iframe
                        src={previewUrl}
                        title={`Preview of ${titleOf(openReport)}`}
                        className="h-[420px] w-full bg-white"
                      />
                    )}
                  </div>
                ) : (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => openPreview(openReport)}
                    disabled={previewLoading || dlId !== null}
                    title="Fetch the stored file and render it here — no download needed"
                  >
                    {previewLoading ? 'reading file…' : 'Preview file'}
                  </Button>
                )}
                {previewError && (
                  <p className="rounded-button border border-accent-rose/30 bg-accent-rose/10 px-2.5 py-1.5 font-mono text-[10px] text-accent-rose">
                    {previewError}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => download(openReport)}
                  disabled={dlId !== null}
                >
                  <Download className="h-3.5 w-3.5" />
                  {dlId === openReport.id ? 'Saving…' : `Download ${downloadName(openReport)}`}
                </Button>
                <span className="font-mono text-[10px] text-t-lo">
                  {openReport.dataset_id ? 'file bytes served with the run token' : 'dataset not recorded on this report'}
                </span>
              </div>
            </div>
          )}
        </Panel>

        {/* ── delivery ledger ──────────────────────────────────────── */}
        <Panel
          className="xl:col-span-7"
          title="delivery ledger"
          flush
          right={
            <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
              last {fmt(ledger.length, 0)} · {fmt(items.length, 0)} total
            </span>
          }
        >
          <div className="divide-y divide-border">
            {ledger.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-t-lo">
                Nothing filed yet — the ledger fills as reports are compiled.
              </p>
            ) : (
              ledger.map(r => (
                <div
                  key={r.id || stamp(r.generated_at)}
                  className={cn(
                    'flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 transition-colors',
                    openReport?.id === r.id ? 'bg-primary-500/[0.05]' : 'hover:bg-panel2',
                  )}
                >
                  <span className="flex w-[7.5rem] shrink-0 items-center gap-1.5 font-mono text-[11px] text-t-mid">
                    <Clock className="h-3 w-3 shrink-0 text-t-lo" />
                    {when(r.generated_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => openDoc(r)}
                    title="Open in the document inspector"
                    className="min-w-0 flex-1 truncate text-left text-[12px] text-t-hi transition-colors hover:text-primary-500"
                  >
                    {titleOf(r)}
                  </button>
                  <span className="shrink-0 font-mono text-[11px] text-t-lo">{shortId(r.id)}</span>
                  <span className={cn('w-14 shrink-0 font-mono text-[11px]', FORMAT_TONE[formatOf(r)] ?? 'text-t-lo')}>
                    {formatOf(r).toUpperCase()}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-[11px] text-t-mid">
                    {bytes(n(r.file_size_bytes))}
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-t-lo">
                    {fmt(sectionsOf(r.sections).length, 0)}§
                  </span>
                  <button
                    type="button"
                    onClick={() => download(r)}
                    disabled={dlId !== null}
                    title={`Download ${downloadName(r)}`}
                    aria-label={`Download ${titleOf(r)}`}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-button border border-border bg-panel2 text-t-lo transition-colors hover:border-primary-500/40 hover:text-primary-500 disabled:opacity-50"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border bg-panel2 px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>section coverage · {fmt(coveredCount, 0)}/{fmt(SECTION_LIBRARY.length, 0)} ever compiled</SectionLabel>
              <span className="font-mono text-[10px] text-t-lo">
                {fmt(archivedSections, 0)} sections written across {fmt(items.length, 0)} file{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {SECTION_LIBRARY.map(s => {
                const on = coverage.has(s.title.toLowerCase())
                return (
                  <span
                    key={s.title}
                    title={`${s.title} · ${on ? 'compiled at least once' : 'never compiled'}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-button border px-1.5 py-px font-mono text-[9px]',
                      on
                        ? 'border-accent-emerald/30 bg-accent-emerald/10 text-accent-emerald'
                        : 'border-dashed border-border bg-panel text-t-lo',
                    )}
                  >
                    {on ? <Check className="h-2.5 w-2.5" /> : <span className="h-2.5 w-2.5" aria-hidden />}
                    {s.title}
                  </span>
                )
              })}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── 5 questions + next stage ──────────────────────────────── */}
      <div className="shrink-0">
        <StoryFlow stageKey={STAGE_KEY} activeKey={activeStep} />
      </div>

      {items.length > 0 ? (
        <AutoNext
          to="/history"
          label="Deliverables sealed — indexing every run and model in the registry"
        />
      ) : (
        <p className="flex shrink-0 items-center gap-2 text-[11px] text-t-lo">
          <AlertTriangle className="h-3.5 w-3.5 text-accent-amber" />
          Nothing to hand over yet — compile at least one report before continuing to History &amp;
          Model Registry.
        </p>
      )}
    </div>
  )
}

export default ReportGenerationPage
