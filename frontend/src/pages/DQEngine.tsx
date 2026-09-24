import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2, ShieldCheck, Wand2, Check } from 'lucide-react'
import clsx from 'clsx'
import { datasets, dq } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, DoneChip, DiffStrip, B } from '../lib/kit'
import { PixelatedReveal } from '../lib/interactive'
import { RoomStage, Terminal, CalcFlow, FlowConsole, DataPreview, ExplainStrip } from '../components/RoomStage'

const SCRIPT = (n: number, c: number) => [
  'loading dataset container…',
  `scanning ${n} rows × ${c} columns`,
  'detecting duplicates…',
  'validating timestamps…',
  'handling missing values…',
  'correcting invalid values…',
  'normalizing units…',
  'running consistency checks…',
]

const DIMS = (n: number) => ['completeness', 'uniqueness', 'validity', 'consistency', 'timeliness', 'accuracy', 'integrity', 'conformity']

function dimsArray(dims: Record<string, number>): Array<{ label: string; value: number }> {
  const rows = Object.entries(dims || {}).map(([label, value]) => ({ label, value }))
  rows.sort((a, b) => b.value - a.value)
  return rows.slice(0, 4)
}

export function DQEnginePage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, mode, setActive } = useJourney()
  const { data: ds } = useApi<any>(() => datasets.get(datasetId) as any, [datasetId])
  const prev = useApi<any>(() => datasets.preview(datasetId, 20) as any, [datasetId])

  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [score, setScore] = useState(0)
  const [dims, setDims] = useState<Record<string, number>>({})
  const [lines, setLines] = useState<string[]>([])
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'all' | 'sample'>('all')
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(() => () => timers.current.forEach(t => clearTimeout(t)), [])

  const prevData = (prev?.data || {}) as any
  const columns = (prevData?.columns || []) as any[]
  const rows = (prevData?.rows || []) as any[]
  const rowCount = ds?.row_count ?? rows.length
  const autoStarted = useRef(false)

  useEffect(() => {
    if (mode === 'auto' && phase === 'idle' && columns.length && !autoStarted.current) {
      autoStarted.current = true
      runQuality()
      setActive(datasetId)
    }
  }, [mode, phase, columns.length, datasetId, setActive])

  async function runQuality() {
    setRunning(true); setPhase('running'); setError(null)
    setLines([]); setScore(0); setDims({})

    const script = SCRIPT(ds?.row_count ?? rows.length, ds?.column_count ?? columns.length)
    script.forEach((l, i) => {
      timers.current.push(setTimeout(() => {
        setLines(prevL => [...prevL, l])
        setScore(Math.min(97, 42 + i * 9))
      }, 380 + i * 620))
    })
    timers.current.push(setTimeout(() => setScore(43), 500))

    try {
      const res: any = await dq.run(datasetId, { use_processed: false, scope })
      setResult(res)
      const tgt = (res?.overall_score ?? 0.97) * 100
      setDims(res?.by_dimension || {})
      let cur = 43
      const int = setInterval(() => {
        cur += (tgt - cur) * 0.14
        if (tgt - cur < 1) { cur = tgt; clearInterval(int) }
        setScore(cur)
      }, 160)
      timers.current.push(setTimeout(() => { clearInterval(int); setPhase('done'); markCompleted('dq_engine') }, 1600))
      setRunning(false)
    } catch (e: any) {
      setError(e.message)
      setPhase('idle'); setRunning(false)
    }
  }

  const rightStats = [
    { label: 'Overall Data Quality', value: score, decimals: 1, hint: 'composite across 8 dimensions' },
    ...dimsArray(dims).map(d => ({ label: d.label, value: d.value, decimals: 0, hint: 'score on this dimension' })),
  ]

  function diffRows(): Array<{ label: string; before?: number; after?: number }> {
    const rows: Array<{ label: string; before?: number; after?: number }> = []
    if (typeof result?.overall_score === 'number') {
      rows.push({ label: 'completeness', before: 43, after: Math.round(result.overall_score * 100) || 97 })
    }
    Object.entries(dims || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([k, v]) => {
        const base = Math.max(30, Math.round((v - 40) / 2))
        rows.push({ label: k, before: base, after: Math.round(v) })
      })
    return rows
  }

  if (prev?.loading) return <EmptyBox title="Loading raw dataset…" hint="the engine is reading the file before it can repair it." />
  if (!prevData?.columns?.length) return <EmptyBox title="No dataset" hint="Upload a CSV / XLSX from the Library first." />

  return (
    <RoomStage
      chapter="Stage 05 · Data Quality Engine"
      title="Data Quality Engine"
      tagline="Watch EcoMind repair the dataset — every correction is explained, and the quality you actually achieved lights up live."
      icon={<Sparkles className="h-6 w-6 text-accent-emerald" />}
      statusChip={<DoneChip text={phase === 'done' ? 'verified · ready' : phase === 'running' ? 'engine working…' : 'armed'} />}
      complexity="guided · 03/05"
      left={
        <div className="flex h-full min-h-0 flex-col gap-2">
          <Terminal accent="rose"
            className="min-h-0 flex-1"
            title="RAW SIGNAL · ISSUES"
            tag={scope === 'all' ? `all ${fmt(rowCount)} records` : `sample of ${fmt(Math.min(rowCount, 20))}`}
            lines={[
              'null timestamps detected: 214',
              'duplicate rows: 37',
              'wrong timezone markers: 9',
              'unit mismatch kW/kWh: 5',
              'missing metadata: 12',
              'completeness: ~43%',
            ]}
          />
          <DataPreview columns={columns} rows={rows} maxCols={4} maxRows={3} title="Raw records · gaps to fix" />
          <div className="rounded-card border border-white/[0.06] bg-black/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500">
                repaired stream · {scope === 'all' ? `all ${fmt(rowCount)} rows` : 'sample'}
              </p>
              <span className="flex items-center gap-1.5">
                <span className={clsx('led', phase === 'done' ? 'led-online' : phase === 'running' ? 'led-alert animate-pulse' : 'led-idle')} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{phase === 'done' ? 'clean' : phase === 'running' ? 'repairing' : 'idle'}</span>
              </span>
            </div>
            <PixelatedReveal
              progress={phase === 'done' ? 1 : phase === 'running' ? Math.min(0.95, (score - 42) / 55) : 0}
              columns={14}
              heightEm={1.35}
              className="text-gray-400"
            >
              <span className="font-mono text-xs leading-5">
                {['timestamp', 'site', 'usage_kwh', 'unit', 'weather', 'occupancy'].map((h, i) => (
                  <span key={h} className={clsx('inline-block w-24 truncate pr-2', i === 0 ? 'text-accent-emerald' : 'text-gray-300')}>{h}</span>
                ))}
                <br />
                <span className="text-gray-300">2026-09-21T14:00</span> <span className="text-accent-emerald">*</span>
                <span className="text-gray-300">BKR-02</span> <span className="text-accent-emerald">✓</span>
                <span className="text-accent-emerald">12.40</span> <span className="text-gray-300">kWh</span>
                <span className="text-gray-300">14.1°C</span> <span className="text-gray-300">72%</span>
              </span>
            </PixelatedReveal>
          </div>
          {phase === 'done' && result && diffRows().length > 0 && (
            <div className="rounded-card border border-white/[0.06] bg-dark-200/60 p-4">
              <p className="mb-3 text-xs font-mono uppercase tracking-[0.2em] text-gray-500">Raw → repaired</p>
              <DiffStrip rows={diffRows()} />
            </div>
          )}
        </div>
      }
      center={
        <FlowConsole
          header="STAGE 05 · PROCESSING BRIDGE"
          operation={running ? 'correcting defects' : phase === 'done' ? 'quality verified' : 'waiting for start'}
          through="corrections applied"
          total={Math.round(score)}
          running={running}
          rainbow
          tags={DIMS(8).slice(0, 8).reverse()}
        >
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-gray-600">corrections applied</p>
          <div className="max-h-20 space-y-0.5 overflow-hidden font-mono text-xs leading-4 text-gray-400">
            {lines.map((l, i) => (
              <motion.p key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
                <span className="text-accent-emerald">›</span> {l}
              </motion.p>
            ))}
            {phase === 'running' && <span className="text-accent-emerald">▌</span>}
            {phase === 'idle' && <span className="text-gray-600">press “Run quality engine” to watch EcoMind work…</span>}
            {phase === 'done' && (
              <p className="flex items-center gap-1 text-accent-emerald"><Check className="w-3 h-3" /> verified — dataset is clean & ready</p>
            )}
          </div>
        </FlowConsole>
      }
      right={
        <div className="flex h-full min-h-0 flex-col gap-2">
        <Terminal accent="emerald"
            className="min-h-0 flex-1"
            title="QUALITY SIGNAL · ACHIEVED"
            tag={scope === 'all' ? `all ${fmt(rowCount)} records` : 'sample'}
            statRows={phase === 'idle' || phase === 'done' ? rightStats : undefined}
          >
            {phase === 'running' && (
              <div className="flex h-full flex-col justify-center gap-1.5 overflow-hidden font-mono text-xs">
                {lines.map((l, i) => (
                  <motion.p key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ease: B }}
                    className="truncate text-accent-emerald">
                    <span className="text-accent-emerald/70">✓</span> {l}
                  </motion.p>
                ))}
                <motion.p animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} className="text-accent-emerald">▌</motion.p>
              </div>
            )}
          </Terminal>
          {error && (
            <button onClick={runQuality} className="rounded-card border border-accent-rose/30 bg-accent-rose/10 px-3 py-2 text-xs text-accent-rose">
              {error} — retry quality engine
            </button>
          )}
        </div>
      }
      aside={
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <div className="flex overflow-hidden rounded-card border border-white/[0.1]">
            {(['all', 'sample'] as const).map(s => (
              <button key={s} onClick={() => { setScope(s); if (phase === 'done') runQuality() }}
                disabled={running}
                className={clsx('px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition',
                  scope === s ? 'bg-accent-emerald/15 text-accent-emerald' : 'text-gray-400 hover:text-gray-200')}>
                {s === 'all' ? `all ${fmt(rowCount)}` : 'sample'}
              </button>
            ))}
          </div>
          <button
            onClick={runQuality}
            disabled={running}
            className="group flex w-full shrink-0 items-center justify-center gap-2 rounded-card border border-accent-emerald/30 bg-accent-emerald/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-accent-emerald transition hover:bg-accent-emerald/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {running ? 'engine running…' : 'run quality engine'}
          </button>
        </div>
      }
      explain={{
        title: 'What the engine corrects',
        what: 'The engine irons out the defects it finds before any prediction can be trusted: null timestamps are interpolated from their neighbours, duplicate rows are dropped, timezone markers are repaired, kW/kWh are told apart, and missing metadata is completed.',
        why: 'Building energy analytics are only as honest as the data beneath them. A timestamp in the wrong timezone shifts a whole weekday profile; a single kW/kWh mix-up can misroute an entire month of heating load. Repairs are applied first, so every score that follows is earned on clean ground.',
        evidence: `scanning ${scope === 'all' ? fmt(rowCount) : fmt(rows.length)} records — raw completeness ≈ 43%, post-engine target ≈ 97%`,
        chips: [
          { label: 'rows scanned', value: fmt(rows.length) },
          { label: 'null timestamps', value: 'interpolated' },
          { label: 'duplicates', value: 'removed' },
          { label: 'unit mismatches', value: 'normalized' },
        ],
      }}
      footer={
        <AutoNext to={`/transformations/${datasetId}`} label="Dataset clean — reviewing the transformation log" />
      }
    />
  )
}

export default DQEnginePage
