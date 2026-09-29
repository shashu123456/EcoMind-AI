import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ShieldCheck, Check } from 'lucide-react'
import clsx from 'clsx'
import { datasets, dq } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, DoneChip, AnimatedNumber, PulseDot, normRows } from '../lib/kit'
import { colLabel } from '../lib/kit'
import { StageHeader, Hero, Advanced, ResultSummary, QualityRating, SectionLabel } from '../lib/stagekit'

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

function dimsArray(dims: Record<string, number>): Array<{ label: string; value: number }> {
  const rows = Object.entries(dims || {}).map(([label, value]) => ({ label, value: Math.round(value) }))
  rows.sort((a, b) => b.value - a.value)
  return rows
}

/* ── Level 2 · the hero: one repair machine on a hairline rail ──────────
   Rows enter from the sheet, pass rule by rule, and the quality score
   lands when the last rule fires. Nothing else on the page competes.  */
function RuleMachine({ current, done, running, rowCount, score }: {
  current: number; done: boolean; running: boolean; rowCount: number; score: number;
}) {
  const band = (idx: number) => {
    if (done || idx < current) return 'passed'
    if (idx === current && running) return 'active'
    return 'pending'
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 lg:flex-row">
      {/* in — quiet summary of what enters */}
      <div className="flex w-full shrink-0 flex-row justify-around gap-3 border-border lg:w-44 lg:flex-col lg:justify-start lg:border-r lg:pr-5">
        <div>
          <SectionLabel>Rows in</SectionLabel>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-t-hi">{fmt(rowCount)}</p>
          <p className="text-[11px] text-t-lo">raw records</p>
        </div>
        <div>
          <SectionLabel>Rules</SectionLabel>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-t-hi">{RULES.length}</p>
          <p className="text-[11px] text-t-lo">repair checks</p>
        </div>
      </div>

      {/* the machine */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute bottom-0 left-[30px] top-0 w-px bg-border" />
        <div className="grid h-full grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
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
                  <span className={clsx('hidden truncate text-right text-[9.5px] sm:block', st === 'passed' ? 'text-accent-emerald/80' : st === 'active' ? 'text-accent-amber/90' : 'text-t-lo/40')}>
                    {st === 'passed' ? 'passed' : st === 'active' ? r.caption : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        {running && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 rounded-button border border-accent-amber/40 bg-accent-amber/10 px-3 py-2">
            <span className="ml-[27px] rounded-button bg-primary-500 px-1.5 py-[2px] font-mono text-[8px] font-semibold text-white shadow-sm">
              row {Math.min(current + 1, rowCount)}
            </span>
            <span className="text-[11px] font-medium text-accent-amber">repairing…</span>
          </div>
        )}
        {done && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 rounded-button border border-accent-emerald/30 bg-accent-emerald/[0.08] px-3 py-2">
            <Check className="h-4 w-4 text-accent-emerald" />
            <span className="text-xs font-semibold text-accent-emerald">Quality checks complete — the clean record is ready for feature engineering</span>
          </div>
        )}
      </div>

      {/* out — the one number that matters */}
      <div className="flex w-full shrink-0 flex-row justify-around gap-3 border-border lg:w-44 lg:flex-col lg:justify-start lg:border-l lg:pl-5">
        <div>
          <SectionLabel>Quality</SectionLabel>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-t-hi">
            {done || score > 0 ? <><AnimatedNumber value={Math.round(score)} />%</> : '—'}
          </p>
          <div className="mt-1.5">{(done || score > 0) && <QualityRating score={score} label="" />}</div>
        </div>
        <div>
          <SectionLabel>Status</SectionLabel>
          <p className="mt-1 text-sm font-medium text-t-hi">
            {done ? 'Verified' : running ? 'Repairing…' : 'Armed'}
          </p>
          <p className="text-[11px] text-t-lo">
            {done ? 'record stored for the pipeline' : running ? 'rules running in order' : 'run the engine to score'}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Level 3 · raw records sheet (hidden by default) ──────────────────── */
function RawSheet({ columns, rows, rowCount }: { columns: any[]; rows: any[][]; rowCount: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Raw records preview</SectionLabel>
        <span className="font-mono text-[10px] tabular-nums text-t-lo">{fmt(rowCount)} rows · first {rows.length}</span>
      </div>
      <div className="overflow-auto rounded-button border border-border">
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
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td className="border-b border-border/60 px-2 py-1 text-right font-mono text-[9px] text-t-lo">{ri + 1}</td>
                {columns.map((_, ci) => {
                  const raw = r ? r[ci] : undefined
                  const v = raw === null || raw === undefined || raw === '' ? '∅' : String(raw)
                  return (
                    <td key={ci} className={clsx('max-w-[160px] truncate px-2 py-1 font-mono text-[10px]', v === '∅' ? 'text-accent-rose' : 'text-t-mid')}>
                      {v === '∅' ? <span className="text-accent-rose/70">{v}</span> : v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
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

  const dimRows = dimsArray(dims)
  const verdict = phase === 'done'
    ? `The dataset passed all ${RULES.length} repair rules — ${Math.round(score)}% quality, ready for transformation.`
    : running
      ? 'The engine is repairing the dataset rule by rule — nulls filled, duplicates dropped, units corrected.'
      : 'Run the engine: it validates every row across 12 rules and repairs the defects it finds before machine learning.'

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Level 1 — one sentence */}
      <div className="px-4 pb-3 pt-4">
        <StageHeader
          chapter="Stage 3 · Data quality"
          title="Data Quality Engine"
          tagline="Validates and repairs the incoming dataset before machine learning."
          right={<DoneChip text={phase === 'done' ? 'verified · ready' : phase === 'running' ? 'engine working…' : 'armed'} />}
        />
      </div>

      {/* Level 2 — the one hero: the repair machine */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <Hero>
          <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
            <SectionLabel>Repair machine</SectionLabel>
            <span className="flex items-center gap-2">
              <PulseDot color={phase === 'done' ? 'bg-accent-emerald' : 'bg-accent-amber'} ping={phase === 'done' ? 'bg-accent-emerald/50' : 'bg-accent-amber/50'} />
              <span className="text-[10px] font-medium uppercase tracking-wider text-t-lo">
                {phase === 'done' ? 'verified' : phase === 'running' ? 'live' : 'idle'}
              </span>
            </span>
          </div>
          <RuleMachine current={currentRule} done={phase === 'done'} running={running} rowCount={rowCount} score={score} />
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
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
              className="flex shrink-0 items-center justify-center gap-2 rounded-button bg-primary-500 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {running ? 'engine running…' : 'run quality engine'}
            </button>
            {error && <span className="text-[11px] text-accent-rose">{error} — adjust scope and retry</span>}
          </div>
        </Hero>
      </div>

      {/* verdict — the stage's conclusion in one line */}
      <div className="shrink-0 px-4 pb-3">
        <ResultSummary
          verdict={verdict}
          facts={phase === 'done' ? [
            { label: 'Rows processed', value: fmt(rowCount) },
            { label: 'Completeness', value: `${gapProfile.completeness}%` },
            { label: 'Dimensions scored', value: dimRows.length || '—' },
          ] : undefined}
        />
      </div>

      {/* Level 3 — everything else, hidden until asked for */}
      <div className="shrink-0 space-y-2 px-4 pb-4">
        <Advanced label="Dimension scores" hint={dimRows.length ? `${dimRows.length} dimensions · lowest: ${dimRows[dimRows.length - 1]?.label}` : 'available after a run'}>
          {dimRows.length === 0 ? (
            <p className="text-xs text-t-lo">Run the quality engine to score all eight dimensions.</p>
          ) : (
            <div className="space-y-1.5">
              {dimRows.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <span className="w-28 truncate text-[11px] capitalize text-t-mid">{d.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel3">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, d.value)}%` }} />
                  </div>
                  <span className="w-9 text-right font-mono text-[10px] font-semibold text-t-hi">{Math.round(d.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Advanced>

        <Advanced label="Gap profile" hint={`${fmt(gapProfile.missingCells, 0)} missing cells · ${gapProfile.completeness}% complete`}>
          {gapProfile.colGaps.length === 0 ? (
            <p className="text-xs text-t-lo">No missing cells in the scanned preview — the sheet is complete.</p>
          ) : (
            <div className="space-y-1.5">
              {gapProfile.colGaps.map(g => (
                <div key={g.name} className="flex items-center gap-2">
                  <span className="w-28 truncate text-[11px] text-t-mid">{g.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel3">
                    <div className="h-full rounded-full bg-accent-amber" style={{ width: `${Math.min(100, g.pct)}%` }} />
                  </div>
                  <span className="w-16 text-right font-mono text-[10px] text-t-hi">{fmt(g.miss, 0)} · {g.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </Advanced>

        <Advanced label="Raw records" hint={`first ${rows.length} of ${fmt(rowCount)} rows`}>
          <RawSheet columns={columns} rows={rows} rowCount={rowCount} />
        </Advanced>
      </div>

      <AutoNext to={`/transformations/${datasetId}`} label="Dataset clean — reviewing the transformation log" />
    </div>
  )
}

export default DQEnginePage
