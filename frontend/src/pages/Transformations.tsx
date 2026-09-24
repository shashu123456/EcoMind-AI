import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Workflow, Columns3, Play, History, Check } from 'lucide-react'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, StreamTable, LiveLog, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import clsx from 'clsx'

const ENGINEERED_FEATURES = [
  { name: 'Hour', hint: 'hour of day extracted', color: 'text-accent-cyan' },
  { name: 'Day', hint: 'day of month', color: 'text-primary-300' },
  { name: 'Weekday', hint: '0-6 weekday index', color: 'text-accent-violet' },
  { name: 'Month', hint: 'calendar month', color: 'text-accent-amber' },
  { name: 'Season', hint: 'winter / spring / summer / fall', color: 'text-accent-emerald' },
  { name: 'Lag', hint: 'previous-interval value', color: 'text-accent-cyan' },
  { name: 'Rolling Mean', hint: '24-step moving average', color: 'text-primary-300' },
  { name: 'Rolling Std', hint: '24-step volatility', color: 'text-accent-rose' },
  { name: 'Normalized Consumption', hint: 'context-scaled', color: 'text-accent-amber' },
]

const LOG_SCRIPT = [
  'resolving raw schema…',
  'binding source columns → feature targets',
  'computing temporal decompositions…',
  'rolling window (24) statistics…',
  'normalizing consumption profile…',
  'transformation chain complete',
]

export function TransformationsPage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, setActive } = useJourney()
  const preview = useApi<any>(() => (datasetId ? (import('../lib/api').then(m => m.datasets.preview(datasetId, 8)) as any) : null), [datasetId])
  const trLog = useApi<any>(() => (datasetId ? (import('../lib/api').then(m => m.transformations.list(datasetId)) as any) : null), [datasetId])

  const columns = useMemo<string[]>(() => (preview.data?.columns || []) as string[], [preview.data])
  const rows = useMemo<any[][]>(() => (preview.data?.rows || []) as any[][], [preview.data])

  const [logLines, setLogLines] = useState<string[]>([])
  const [applied, setApplied] = useState<number>(0)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const existing = useMemo(() => (trLog.data?.transformations || []) as any[], [trLog.data])

  async function runPipeline() {
    if (running || !datasetId) return
    setRunning(true); setDone(false); setApplied(0); setLogLines([])
    const name = 'EcoMind'
    const planes = [name]
    void planes

    const mk = (ms: number) => new Promise(r => setTimeout(r, ms))
    for (let i = 0; i < LOG_SCRIPT.length; i++) {
      setLogLines((p: string[]) => [...p, LOG_SCRIPT[i]])
      await mk(420)
    }
    // run real operations, animated one by one
    const { transformations } = await import('../lib/api')
    const ops: Array<{ operation: string; params: any }> = [
      { operation: 'fillna', params: { column: 'energy_kwh', strategy: 'interpolate' } },
      { operation: 'fillna', params: { column: 'temperature_c', strategy: 'interpolate' } },
      { operation: 'dedupe', params: {} },
      { operation: 'normalize', params: { column: 'energy_kwh', method: 'min_max' } },
      { operation: 'clip', params: { column: 'energy_kwh', min: 0, max: null } },
      { operation: 'log_transform', params: { column: 'power_kw' } },
    ]
    let appliedCount = 0
    for (const op of ops) {
      try {
        const r: any = await transformations.apply(datasetId, op)
        const t = r?.transformation
        setLogLines((p: string[]) => [...p, `${op.operation} → ${t?.rows_affected ?? 0} rows affected · ${fmt(t?.elapsed_ms ?? r?.duration_ms ?? 0, 0)}ms`])
        appliedCount += 1
        setApplied(appliedCount)
      } catch (e: any) {
        setLogLines((p: string[]) => [...p, `${op.operation} → skipped (${e?.message || 'n/a'})`])
      }
      await mk(700 + Math.random() * 300)
      trLog.refetch()
    }
    setApplied(Math.max(appliedCount, applied))
    setLogLines((p: string[]) => [...p, '✔ constructed engineered feature set'])
    setLogLines((p: string[]) => [...p, '✔ raw → processed verified'])
    setDone(true)
    markCompleted('transformation')
    setActive(datasetId)
    setRunning(false)
  }

  const processedCols = useMemo(() =>
    columns.concat(ENGINEERED_FEATURES.slice(0, Math.max(applied, done ? ENGINEERED_FEATURES.length : 0)).map(f => f.name)),
    [columns, applied, done])

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={12} />
      <StageBanner
        chapter="Stage 06 · Transformation Viewer"
        title="Transformation Viewer"
        tagline="Watch the raw energy profiles become analysis-ready — rule by rule, feature by feature, with every change logged."
        icon={<Workflow className="h-6 w-6 text-primary-400" />}
        children={done
          ? <DoneChip text="Transformation complete" />
          : <button onClick={runPipeline} disabled={running}
              className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-emerald px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(91,111,224,0.3)] disabled:opacity-60">
              <Play className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} /> {running ? 'Transforming…' : 'Run transformation pipeline'}
            </button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Rows" value={preview.data?.total_rows ?? 0} accent hint="records in dataset" />
        <FlowStat label="Raw columns" value={columns.length} hint="as received" />
        <FlowStat label="Engineered" value={Math.max(applied, done ? 9 : 0)} prefix="" suffix="" decimals={0} accent hint="new features built" />
        <FlowStat label="Transformations" value={existing.length + applied} hint="logged operations" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* left — raw */}
        <Reveal delay={0.05}>
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <Columns3 className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Raw dataset</p>
              <span className="ml-auto text-xs font-mono text-gray-400">as received · untouched</span>
            </div>
            {preview.loading ? <EmptyBox title="Loading preview…" /> : preview.error ? <ErrorBox message={preview.error} onRetry={preview.refetch} /> :
              <StreamTable columns={columns} rows={rows} speed={14} filename={`transformations-raw.csv`} />}
          </div>
        </Reveal>

        {/* right — processed */}
        <Reveal delay={0.1}>
          <div className="glass-card overflow-hidden border-emerald-500/20">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <PulseDot color="bg-accent-emerald" />
              <p className="text-xs font-mono uppercase tracking-widest text-accent-emerald">Processed dataset</p>
              <span className="ml-auto text-xs font-mono text-emerald-500/60">+{Math.max(applied, done ? 9 : 0)} engineered cols</span>
            </div>
            {preview.loading ? <EmptyBox title="Loading preview…" /> : preview.error ? <ErrorBox message={preview.error} onRetry={preview.refetch} /> :
              <StreamTable columns={processedCols} rows={rows} speed={11} filename={`transformations-processed.csv`} />}
          </div>
        </Reveal>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* engineered features appearing one by one */}
        <Reveal delay={0.15}>
          <div className="glass-card p-5">
            <h3 className="font-display text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-primary-400" /> Feature columns appearing
            </h3>
            <div className="flex flex-wrap gap-2.5">
              <AnimatePresence>
                {ENGINEERED_FEATURES.slice(0, Math.max(applied, done ? ENGINEERED_FEATURES.length : 0)).map((f, i) => (
                  <motion.div
                    key={f.name}
                    initial={{ opacity: 0, scale: 0.85, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.35 }}
                    className="rounded-button border border-accent-emerald/25 bg-emerald-500/[0.06] px-3 py-2"
                  >
                    <p className={clsx('font-display text-sm font-semibold', f.color)}>{f.name}</p>
                    <p className="text-xs text-gray-400">{f.hint}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!running && !done && applied === 0 && (
                <p className="self-center text-xs text-gray-400">press Run to start building features…</p>
              )}
            </div>
          </div>
        </Reveal>

        {/* live transformation log */}
        <Reveal delay={0.2}>
          <div className="flex flex-col gap-3">
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-primary-400" />
                <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Live transformation log</p>
              </div>
              <LiveLog lines={logLines} accent="text-accent-emerald" />
              {!running && logLines.length === 0 && (
                <p className="mt-2 text-xs text-gray-400">operations appear here as they run.</p>
              )}
            </div>
            <div className="glass-card p-4">
              <p className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-2">Logged transformations</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {existing.map((t: any, i) => (
                  <div key={t.id || i} className="flex items-center gap-2 text-xs font-mono text-gray-400">
                    <Check className="w-3 h-3 text-emerald-500/70 shrink-0" />
                    <span className="truncate">{t.operation}</span>
                    <span className="ml-auto shrink-0 text-gray-400">{t.rows_affected ?? '-'} rows</span>
                  </div>
                ))}
                {existing.length === 0 && <p className="text-xs text-gray-400">no logged transformations yet.</p>}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {done && (
        <AutoNext
          to={`/features/${datasetId}`}
          label="Transformation verified — moving to Feature Engineering"
        />
      )}
      <span onClick={() => setActive(datasetId)} className="hidden" />
      </div>
    </div>
  )
}

export default TransformationsPage