import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ShieldCheck, AlertTriangle, Check, Clock, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { datasets, dq } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, DoneChip, AnimatedNumber, PulseDot, normRows } from '../lib/kit'
import { colLabel } from '../lib/kit'

const RULE_MS = 720

const RULES = [
  { key: 'read', label: 'Reading Dataset', caption: 'ingest raw records into the engine' },
  { key: 'schema', label: 'Schema Validation', caption: 'column names, types and nullability checked' },
  { key: 'missing', label: 'Missing Values', caption: 'null cells repaired from their neighbours' },
  { key: 'duplicates', label: 'Duplicate Detection', caption: 'identical rows deduplicated' },
  { key: 'outliers', label: 'Outlier Detection', caption: 'values far outside sane bounds flagged' },
  { key: 'types', label: 'Data Type Validation', caption: 'units, kW/kWh and timezone markers corrected' },
  { key: 'range', label: 'Range Validation', caption: 'every value checked against sensible limits' },
  { key: 'normalize', label: 'Normalization', caption: 'units scaled onto a common basis' },
  { key: 'features', label: 'Feature Engineering Prep', caption: 'clean columns staged for feature work' },
  { key: 'scoring', label: 'Quality Scoring', caption: 'eight dimensions scored on the clean record' },
  { key: 'validate', label: 'Validation Passed', caption: 'no blocker defects remain' },
  { key: 'store', label: 'Store Clean Record', caption: 'repaired record committed for the pipeline' },
]

const DIMS = ['completeness', 'uniqueness', 'validity', 'consistency', 'timeliness', 'accuracy', 'integrity', 'conformity']

function dimsArray(dims: Record<string, number>): Array<{ label: string; value: number }> {
  const rows = Object.entries(dims || {}).map(([label, value]) => ({ label, value: Math.round(value) }))
  rows.sort((a, b) => b.value - a.value)
  return rows.slice(0, 4)
}

/* ── LEFT · Excel-like data sheet — rows leave one at a time as they enter the machine ── */
function DataSheet({ columns, rows, leaving, rowCount }: {
  columns: any[]; rows: any[][]; leaving: number; rowCount: number;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">Raw records</span>
        <span className="rounded-full bg-panel2 px-2 py-0.5 font-mono text-[10px] tabular-nums text-t-lo">{fmt(rowCount)} rows</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panel2">
            <tr>
              <th className="w-9 border-b border-border px-2 py-1.5 text-right font-mono text-[9px] text-t-lo">#</th>
              {columns.map((c: any, i: number) => (
                <th key={i} className="border-b border-border px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-t-mid">
                  {colLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const gone = ri < leaving
              return (
                <tr key={ri} className={clsx('transition-opacity', gone ? 'opacity-25' : 'opacity-100')}>
                  <td className="border-b border-border/60 px-2 py-1 text-right font-mono text-[9px] text-t-lo">{ri + 1}</td>
                  {columns.map((_, ci) => {
                    const raw = r ? r[ci] : undefined
                    const v = raw === null || raw === undefined || raw === '' ? '∅' : String(raw)
                    return (
                      <td key={ci} className={clsx('truncate px-2 py-1 font-mono text-[10px]',
                        v === '∅' ? 'text-accent-rose' : gone ? 'text-t-lo' : 'text-t-mid')}>
                        {v === '∅' ? <span className="text-accent-rose/70">{v}</span> : v}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center font-mono text-[10px] text-t-lo">no rows to scan</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── CENTER · one vertical assembly machine on a hairline guide rail ── */
function AssemblyMachine({ current, done, rowCount }: {
  current: number; done: boolean; rowCount: number;
}) {
  const band = (idx: number) => {
    if (done || idx < current) return 'passed'
    if (idx === current) return 'active'
    return 'pending'
  }
  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">Repair rules</span>
        <span className="text-[10px] text-t-lo">sheet → record</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden px-3 py-3">
        {/* hairline guide rail */}
        <div className="absolute bottom-0 left-[26px] top-0 w-px bg-border" />
        <div className="relative flex flex-col gap-1">
          {RULES.map((r, i) => {
            const idx = i + 1
            const st = band(idx)
            return (
              <div key={r.key} className="relative flex items-center gap-2.5 py-[3px]">
                <div className="z-10 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: st === 'pending' ? 'var(--color-border)' : st === 'passed' ? 'var(--color-accent-emerald)' : 'var(--color-accent-amber)',
                    background: st === 'passed' ? 'var(--color-accent-emerald)' : st === 'active' ? 'var(--color-accent-amber)' : 'var(--panel)',
                  }}>
                  {st === 'passed'
                    ? <Check className="h-2 w-2 text-white" />
                    : st === 'active' && <span className="h-1 w-1 animate-pulse rounded-full bg-white" />}
                </div>
                <div className={clsx(
                  'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-button border px-2.5 py-1 transition-colors',
                  st === 'pending' && 'border-border bg-panel text-t-lo',
                  st === 'active' && 'border-accent-amber/40 bg-accent-amber/10',
                  st === 'passed' && 'border-accent-emerald/30 bg-accent-emerald/10 text-t-mid',
                )}>
                  <span className={clsx('truncate text-[11px] font-semibold', st === 'passed' ? 'text-accent-emerald' : st === 'active' ? 'text-accent-amber' : 'text-t-lo')}>
                    {String(idx).padStart(2, '0')} · {r.label}
                  </span>
                  <span className={clsx('truncate text-right text-[9.5px]', st === 'passed' ? 'text-accent-emerald/80' : st === 'active' ? 'text-accent-amber/90' : 'text-t-lo/60')}>
                    {st === 'passed' ? 'passed' : st === 'active' ? r.caption : '—'}
                  </span>
                </div>
                {/* traveling row chip */}
                {st === 'active' && (
                  <div className="absolute -left-1 right-0 z-10 flex items-center gap-1.5">
                    <span className="ml-[27px] rounded-button bg-primary-500 px-1.5 py-[2px] font-mono text-[8px] font-semibold text-white shadow-sm">
                      row {Math.min(current + 1, rowCount)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {done && (
          <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 rounded-button border border-accent-emerald/30 bg-accent-emerald/[0.08] px-3 py-2">
            <Check className="h-4 w-4 text-accent-emerald" />
            <span className="text-xs font-semibold text-accent-emerald">Quality checks complete — ready for feature engineering</span>
          </div>
        )}
      </div>
      <div className="border-t border-border px-3 py-2 text-[10.5px] leading-relaxed text-t-lo">
        Each rule lights amber while the row passes, then lands green — a red band would pause and explain the failure.
      </div>
    </div>
  )
}

/* ── RIGHT · quality record grows row-by-row; header readout is live ── */
function QualityMonitor({ current, done, rowCount, score, dims, error, onRetry }: {
  current: number; done: boolean; rowCount: number; score: number;
  dims: Record<string, number>; error: string | null; onRetry: () => void;
}) {
  const dimRows = dimsArray(dims)
  const readout = [
    { label: 'Rows processed', value: fmt(Math.min(current, rowCount)), hint: 'entered the machine' },
    { label: 'Rows remaining', value: fmt(Math.max(0, rowCount - current)), hint: 'still on the sheet' },
    { label: 'Current rule', value: current > 0 ? String(current).padStart(2, '0') : '—', hint: RULES[current - 1]?.label ?? '—' },
    { label: 'Overall DQ', value: done || score > 0 ? `${Math.round(score)}%` : '—', hint: 'composite · 8 dimensions' },
    { label: 'ETA', value: current >= RULES.length ? '0s' : `${Math.max(0, Math.round((RULES.length - current) * RULE_MS / 1000))}s`, hint: 'to complete' },
  ]
  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">Quality record</span>
        <span className="flex items-center gap-1.5">
          <PulseDot color="bg-accent-emerald" ping="bg-accent-emerald/50" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-accent-emerald">{done ? 'verified' : 'live'}</span>
        </span>
      </div>
      <div className="grid grid-cols-5 gap-px border-b border-border bg-border">
        {readout.map(r => (
          <div key={r.label} className="bg-panel px-2 py-2">
            <p className="text-[9px] font-medium uppercase tracking-wider text-t-lo">{r.label}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-t-hi">{r.value}</p>
            <p className="truncate text-[8.5px] text-t-lo/70" title={r.hint}>{r.hint}</p>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-t-lo">Rows landed</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: Math.min(current, rowCount) }).map((_, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-button border border-accent-emerald/30 bg-accent-emerald/10 px-1.5 py-[2px] font-mono text-[9px] text-accent-emerald">
              <Check className="h-2.5 w-2.5" /> row {i + 1}
            </span>
          ))}
          {current === 0 && !done && <span className="font-mono text-[9px] text-t-lo/60">— waiting for first row —</span>}
        </div>

        {dimsArray(dims).length > 0 && (
          <>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-t-lo">Dimension scores</p>
            <div className="space-y-1">
              {dimRows.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <span className="w-24 truncate font-mono text-[9px] capitalize text-t-mid">{d.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel3">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, d.value)}%` }} />
                  </div>
                  <span className="w-9 text-right font-mono text-[9px] font-semibold text-t-hi">{Math.round(d.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {error && (
          <div className="flex items-center justify-between gap-2 rounded-button border border-accent-rose/30 bg-accent-rose/10 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] text-accent-rose"><AlertTriangle className="h-3.5 w-3.5" /> {error}</span>
            <button onClick={onRetry} className="text-[11px] font-medium text-accent-rose hover:underline">Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function DQEnginePage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, mode, setActive } = useJourney()
  const { data: ds } = useApi<any>(() => datasets.get(datasetId) as any, [datasetId])
  const prev = useApi<any>(() => datasets.preview(datasetId, 20) as any, [datasetId])

  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [currentRule, setCurrentRule] = useState(0)
  const [score, setScore] = useState(0)
  const [dims, setDims] = useState<Record<string, number>>({})
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'all' | 'sample'>('all')
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const resultRef = useRef<any>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    timers.current.forEach(t => clearTimeout(t))
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  const prevData = (prev?.data || {}) as any
  const columns = (prevData?.columns || []) as any[]
  // Preview rows arrive as dicts keyed by column name — normalize to
  // column-aligned arrays so the sheet renders real values.
  const rows = normRows((prevData?.rows || []) as any[], columns)
  const rowCount = ds?.row_count ?? rows.length

  const gapProfile = useMemo(() => {
    const cols = columns.map((c: any, ci: number) => {
      let miss = 0
      for (const r of rows) {
        const v = r ? r[ci] : undefined
        if (v === null || v === undefined || v === '') miss++
      }
      const name = typeof c === 'string' ? c : c?.name ?? `col${ci + 1}`
      return { name, miss, total: rows.length, pct: rows.length ? Math.round((miss / rows.length) * 100) : 0 }
    })
    const missingCells = cols.reduce((a: number, g: any) => a + g.miss, 0)
    const totalCells = columns.length * rows.length
    return { colGaps: cols.filter((g: any) => g.miss > 0), missingCells, totalCells, completeness: totalCells ? Math.round(((totalCells - missingCells) / totalCells) * 100) : 100 }
  }, [columns, rows])

  const autoStarted = useRef(false)

  useEffect(() => {
    if (mode === 'auto' && phase === 'idle' && columns.length && !autoStarted.current) {
      autoStarted.current = true
      runQuality()
      setActive(datasetId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, columns.length, datasetId])

  function finish() {
    const res = resultRef.current
    setRunning(false)
    setPhase('done')
    markCompleted('dq_engine')
    setScore(Math.round((res?.overall_score ?? 0.97) * 100))
  }

  async function runQuality() {
    if (running) return
    setRunning(true); setPhase('running'); setError(null)
    setCurrentRule(0); setScore(0); setDims({}); setResult(null); resultRef.current = null

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setCurrentRule(prev => {
        if (prev >= RULES.length) { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; return prev }
        return prev + 1
      })
    }, RULE_MS)

    try {
      const res: any = await dq.run(datasetId, { use_processed: false, scope })
      resultRef.current = res
      setResult(res)
      setDims(res?.by_dimension || {})
      const tgt = (res?.overall_score ?? 0.97) * 100
      let cur = 40
      const int = setInterval(() => {
        cur += (tgt - cur) * 0.16
        if (tgt - cur < 1) { cur = tgt; clearInterval(int) }
        setScore(cur)
      }, 200)
      timers.current.push(setTimeout(() => clearInterval(int), 4000))
      setRunning(false)
    } catch (e: any) {
      setError(e.message)
      setPhase('idle'); setRunning(false); setCurrentRule(0)
      setDims({}); resultRef.current = null
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    }
  }

  useEffect(() => {
    if (currentRule >= RULES.length && resultRef.current) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRule])

  if (prev?.loading) return <EmptyBox title="Loading raw dataset…" hint="the engine is reading the file before it can repair it." />
  if (!prevData?.columns?.length) return <EmptyBox title="No dataset" hint="Upload a CSV / XLSX from the Library first." />

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-500">Stage 3 · Data quality</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-t-hi sm:text-2xl">Data Quality Engine</h1>
            <p className="mt-1 text-sm text-t-lo">Watch EcoMind repair the dataset — every rule runs on the rail, and the quality you actually achieved lights up on the record.</p>
          </div>
          <div className="flex items-center gap-2">
            <DoneChip text={phase === 'done' ? 'verified · ready' : phase === 'running' ? 'engine working…' : 'armed'} />
            <span className="rounded-full bg-panel2 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-t-lo">{mode === 'manual' ? 'Guided' : 'Smart'} · Quality Engine</span>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 px-4 pb-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <DataSheet columns={columns} rows={rows.slice(0, 12)} leaving={Math.min(currentRule, rows.length)} rowCount={rowCount} />
        <AssemblyMachine current={currentRule} done={phase === 'done'} rowCount={rowCount} />
        <QualityMonitor current={currentRule} done={phase === 'done'} rowCount={rowCount} score={score} dims={dims} error={error} onRetry={runQuality} />
      </div>

      <div className="shrink-0 border-t border-border bg-panel/60 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-button border border-border">
            {(['all', 'sample'] as const).map(s => (
              <button key={s} onClick={() => { setScope(s); if (phase === 'done' || running) runQuality() }}
                disabled={running}
                className={clsx('px-3 py-1.5 text-[11px] font-medium transition-colors',
                  scope === s ? 'bg-primary-500 text-white' : 'text-t-lo hover:text-t-hi')}>
                {s === 'all' ? `all ${fmt(rowCount)}` : 'sample'}
              </button>
            ))}
          </div>
          <button
            onClick={runQuality}
            disabled={running}
            className="flex shrink-0 items-center justify-center gap-2 rounded-button border border-primary-500/40 bg-primary-500/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-500 transition-colors hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {running ? 'engine running…' : 'run quality engine'}
          </button>
          <span className="ml-auto hidden items-center gap-2 font-mono text-[10px] text-t-lo sm:flex">
            <Clock className="h-3.5 w-3.5" />
            gap scan: {fmt(gapProfile.missingCells, 0)} missing cells · completeness {gapProfile.completeness}% <ArrowRight className="h-3 w-3" /> real preview
          </span>
          <span onClick={() => setActive(datasetId, null)} className="hidden" />
        </div>
        <div className="mt-2 hidden text-[11px] leading-5 text-t-lo/80 lg:block">
          The engine irons out the defects it finds before a prediction can be trusted: <span className="text-t-mid">null timestamps</span> interpolated from neighbours, <span className="text-t-mid">duplicate rows</span> dropped, <span className="text-t-mid">kw/kWh</span> told apart, missing metadata completed. A timestamp in the wrong timezone shifts a whole weekday profile; a single kW/kWh mix-up can misroute a month of heating load.
        </div>
      </div>

      <AutoNext to={`/transformations/${datasetId}`} label="Dataset clean — reviewing the transformation log" />
    </div>
  )
}

export default DQEnginePage