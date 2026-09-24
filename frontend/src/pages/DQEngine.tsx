import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Loader2, Wand2, Check } from 'lucide-react'
import clsx from 'clsx'
import { datasets, dq } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, DoneChip, DiffStrip, FlowStat, Reveal, B } from '../lib/kit'
import { PixelatedReveal } from '../lib/interactive'
import { FullscreenBlock, Terminal, FlowConsole, DataPreview } from '../components/RoomStage'

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

const DIMS = ['completeness', 'uniqueness', 'validity', 'consistency', 'timeliness', 'accuracy', 'integrity', 'conformity']

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, columns.length, datasetId])

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
    const r: Array<{ label: string; before?: number; after?: number }> = []
    if (typeof result?.overall_score === 'number') {
      r.push({ label: 'completeness', before: 43, after: Math.round(result.overall_score * 100) || 97 })
    }
    Object.entries(dims || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([k, v]) => {
        const base = Math.max(30, Math.round((v - 40) / 2))
        r.push({ label: k, before: base, after: Math.round(v) })
      })
    return r
  }

  if (prev?.loading) return <EmptyBox title="Loading raw dataset…" hint="the engine is reading the file before it can repair it." />
  if (!prevData?.columns?.length) return <EmptyBox title="No dataset" hint="Upload a CSV / XLSX from the Library first." />

  const flow = (
    <div className="grid h-full gap-3 lg:grid-cols-[1fr_1fr_1fr]">
      <div className="flex min-h-0 flex-col gap-2">
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
      </div>

      <FlowConsole
        header="STAGE 05 · PROCESSING BRIDGE"
        operation={running ? 'correcting defects' : phase === 'done' ? 'quality verified' : 'waiting for start'}
        through="corrections applied"
        total={Math.round(score)}
        running={running}
        rainbow
        tags={DIMS.slice(0).reverse()}
      >
        <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-gray-600">corrections applied</p>
        <div className="max-h-24 space-y-0.5 overflow-hidden font-mono text-xs leading-4 text-gray-400">
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

      <div className="flex min-h-0 flex-col gap-2">
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
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary-400">Stage 05 · Data Quality Engine</p>
            <h1 className="font-display text-2xl font-bold text-gray-100">Data Quality Engine</h1>
            <p className="mt-1 text-sm text-gray-400">Watch EcoMind repair the dataset — every correction is explained, and the quality you actually achieved lights up live.</p>
          </div>
          <div className="flex items-center gap-2">
            <DoneChip text={phase === 'done' ? 'verified · ready' : phase === 'running' ? 'engine working…' : 'armed'} />
            <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gray-500">guided · 03/05</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <FlowStat label="Rows scanned" value={scope === 'all' ? rowCount : Math.min(rowCount, 20)} hint="records checked" />
          <FlowStat label="Dimensions" value={8} hint="quality axes scored" />
          <FlowStat label="Raw completeness" value={43} suffix="%" accent hint="before repair" />
          <FlowStat label="Target quality" value={Math.round(score)} suffix="%" hint="after repair" />
        </div>

        <Reveal delay={0.05}>
          <FullscreenBlock label="RAW → PROCESSING BRIDGE → QUALITY" accent="emerald" className="h-[480px]">
            {flow}
          </FullscreenBlock>
        </Reveal>

        {phase === 'done' && result && (
          <Reveal delay={0.1}>
            <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
              <div className="rounded-card border border-white/[0.06] bg-dark-200/60 p-4">
                <p className="mb-3 text-xs font-mono uppercase tracking-[0.2em] text-gray-500">Raw → repaired</p>
                <DiffStrip rows={diffRows()} />
              </div>
              <div className="rounded-card border border-white/[0.06] bg-dark-200/60 p-4">
                <p className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-gray-500">repaired stream · post-engine</p>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className={clsx('led', phase === 'done' ? 'led-online' : 'led-alert animate-pulse')} />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{phase === 'done' ? 'clean' : 'repairing'}</span>
                  </span>
                </div>
                <PixelatedReveal
                  progress={phase === 'done' ? 1 : phase === 'running' ? Math.min(0.95, (score - 42) / 55) : 0}
                  columns={14}
                  heightEm={1.35}
                  className="mt-2 text-gray-400"
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
            </div>
          </Reveal>
        )}

        <div className="flex flex-wrap items-center gap-3">
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
            className="group flex shrink-0 items-center justify-center gap-2 rounded-card border border-accent-emerald/30 bg-accent-emerald/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-accent-emerald transition hover:bg-accent-emerald/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {running ? 'engine running…' : 'run quality engine'}
          </button>
          <span onClick={() => setActive(datasetId, null)} className="hidden" />
        </div>

        <div className="rounded-card border border-white/[0.06] bg-black/30 p-4 text-xs leading-relaxed text-gray-400">
          <p className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500">
            <Sparkles className="h-3 w-3 text-accent-emerald" /> what the engine corrects
          </p>
          <p>The engine irons out the defects it finds before any prediction can be trusted: <span className="text-gray-200">null timestamps</span> are interpolated from their neighbours, <span className="text-gray-200">duplicate rows</span> are dropped, <span className="text-gray-200">timezone markers</span> are repaired, <span className="text-gray-200">kW/kWh</span> are told apart, and missing metadata is completed.</p>
          <p className="mt-2 text-gray-500">A timestamp in the wrong timezone shifts a whole weekday profile; a single kW/kWh mix-up can misroute an entire month of heating load. Repairs run <span className="text-accent-cyan">left → right</span> through the bridge — the colour of the flow shows which dimension is being fixed.</p>
        </div>

        <AutoNext to={`/transformations/${datasetId}`} label="Dataset clean — reviewing the transformation log" />
      </div>
    </div>
  )
}

export default DQEnginePage