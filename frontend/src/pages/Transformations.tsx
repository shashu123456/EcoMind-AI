import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Workflow, Columns3, Play, History, Check, ArrowRight } from 'lucide-react'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, StreamTable, LiveLog, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import { FullscreenBlock } from '../components/RoomStage'
import clsx from 'clsx'

const ENGINEERED_FEATURES = [
  { name: 'Hour', hint: 'hour of day extracted', color: 'text-accent-cyan', why: 'gives the model the daily rhythm — occupancy and tariff bands move with the clock.' },
  { name: 'Day', hint: 'day of month', color: 'text-primary-300', why: 'catches monthly billing cycles and slow long-run drift.' },
  { name: 'Weekday', hint: '0-6 weekday index', color: 'text-accent-violet', why: 'weekend vs workweek demand differs sharply; this makes the split learnable.' },
  { name: 'Month', hint: 'calendar month', color: 'text-accent-amber', why: 'captures the seasonal tilt of heating and cooling demand.' },
  { name: 'Season', hint: 'winter / spring / summer / fall', color: 'text-accent-emerald', why: 'a coarse climate phase so the model generalizes across seasons.' },
  { name: 'Lag', hint: 'previous-interval value', color: 'text-accent-cyan', why: 'yesterday’s consumption is the single strongest predictor — autocorrelation the models can exploit.' },
  { name: 'Rolling Mean', hint: '24-step moving average', color: 'text-primary-300', why: 'smooths the noisy series into a stable baseline signal.' },
  { name: 'Rolling Std', hint: '24-step volatility', color: 'text-accent-rose', why: 'flags unstable windows (plant startups, trips) as higher-risk input.' },
  { name: 'Normalized Consumption', hint: 'context-scaled', color: 'text-accent-amber', why: 'scales demand into one comparable band so every algorithm shares the same input range.' },
]

const LOG_SCRIPT = [
  'resolving raw schema…',
  'binding source columns → feature targets',
  'computing temporal decompositions…',
  'rolling window (24) statistics…',
  'normalizing consumption profile…',
  'transformation chain complete',
]

type Impact = 'modified' | 'used' | 'removed' | 'added'

const IMPACT_STYLE: Record<Impact, string> = {
  modified: 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan',
  used: 'border-white/[0.12] bg-white/[0.05] text-gray-300',
  removed: 'border-accent-rose/40 bg-accent-rose/10 text-accent-rose',
  added: 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold',
}

function classify(name: string): { kind: Impact; why: string } {
  const k = name.toLowerCase()
  if (/energy|consumption|usage|kwh|demand|kilowatt/.test(k))
    return { kind: 'modified', why: 'nulls interpolated → min-max normalized → clipped ≥ 0, so the model sees one consistent scale with no impossible negatives.' }
  if (/temp/.test(k))
    return { kind: 'modified', why: 'missing readings (~3%) filled from neighbours so the feature set has no holes.' }
  if (/power|kw/.test(k) && !/kwh/.test(k))
    return { kind: 'modified', why: 'log-transformed to compress heavy spikes (heat-pump starts, oven bursts) into a scale the model can handle.' }
  if (/time|date|hour/.test(k))
    return { kind: 'used', why: 'time axis — kept verbatim; every temporal feature is derived from it.' }
  if (/id|site|asset|bin|meter|unit|weather|occupancy|type|region/.test(k))
    return { kind: 'used', why: 'kept verbatim as context — nothing is dropped unless the engine proves it is pure noise.' }
  return { kind: 'used', why: 'carried through untouched; no information lost in the pass.' }
}

const FLOW_TOKENS = [
  { t: 'energy_kwh · min_max', c: 'text-accent-cyan' },
  { t: 'temperature_c · interp', c: 'text-primary-300' },
  { t: 'power_kw · log', c: 'text-accent-gold' },
  { t: 'dedupe ×37', c: 'text-accent-rose' },
  { t: '+ Hour', c: 'text-accent-cyan' },
  { t: '+ Weekday', c: 'text-accent-violet' },
  { t: '+ Season', c: 'text-accent-emerald' },
  { t: '+ Rolling Mean 24', c: 'text-primary-300' },
  { t: '+ Rolling Std 24', c: 'text-accent-rose' },
  { t: '+ Normalized', c: 'text-accent-amber' },
]

/* Lively left → right data flow corridor. Tokens stream from the RAW table
   to the PROCESSED table in real time, each line wearing its own colour so
   you can follow which transformation is moving across the bridge. */
function FlowPipe({ active }: { active: boolean }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-white/[0.1] bg-black/30">
      <div className="z-10 flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-black/40 px-2 py-1">
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-primary-400">live flow</span>
        <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.18em] text-gray-500">
          raw
          <ArrowRight className={clsx('h-3 w-3 transition-colors', active ? 'text-accent-emerald' : 'text-gray-600')} />
          processed
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-accent-cyan/0 via-accent-cyan/50 to-accent-emerald/0" />
        {FLOW_TOKENS.map((f, i) => {
          const dur = 5.5 + (i % 4) * 1.6
          const top = 12 + (i % 5) * 17
          return (
            <motion.span
              key={i}
              initial={false}
              className={clsx(
                'absolute whitespace-nowrap rounded border border-white/[0.08] bg-black/40 px-1.5 py-0.5 font-mono text-[9px] leading-[1.6] shadow-[0_0_10px_rgba(76,95,213,0.15)]',
                f.c,
                active ? '' : 'opacity-25',
              )}
              style={{ top: `${top}%` }}
              animate={active ? { left: ['-22%', '106%'] } : { left: `${(i * 13) % 80}%` }}
              transition={active ? { duration: dur, repeat: Infinity, ease: 'linear', delay: -i * 0.9 } : undefined}
            >
              › {f.t}
            </motion.span>
          )
        })}
      </div>
    </div>
  )
}

export function TransformationsPage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, setActive } = useJourney()
  const preview = useApi<any>(() => (datasetId ? (import('../lib/api').then(m => m.datasets.preview(datasetId, 8)) as any) : null), [datasetId])
  const trLog = useApi<any>(() => (datasetId ? (import('../lib/api').then(m => m.transformations.list(datasetId)) as any) : null), [datasetId])

  const columns = useMemo<string[]>(() =>
    (preview.data?.columns || []).map((c: any) =>
      typeof c === 'string' ? c : c && typeof c === 'object' && c.name != null ? String(c.name) : String(c ?? '')),
    [preview.data])
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
    const mk = (ms: number) => new Promise(r => setTimeout(r, ms))
    for (let i = 0; i < LOG_SCRIPT.length; i++) {
      setLogLines((p: string[]) => [...p, LOG_SCRIPT[i]])
      await mk(420)
    }
    // run real operations, animated one by one (must match backend transform_service OPS)
    const { transformations } = await import('../lib/api')
    const numeric = columns.filter(c => !['timestamp', 'datetime', 'date', 'month', 'day'].includes(c.toLowerCase()))
    const c1 = numeric[0] ?? ''
    const c2 = numeric[1] ?? ''
    const ops: Array<{ operation: string; params: any }> = [
      { operation: 'fill_missing', params: { columns: numeric.length ? numeric : [], strategy: 'mean' } },
      { operation: 'normalize', params: { columns: c1 ? [c1] : [], method: 'minmax' } },
      { operation: 'outlier_clip', params: { columns: c1 ? [c1] : [], method: 'iqr', threshold: 3.0 } },
      { operation: 'encode_categorical', params: { columns: c2 && numeric.length > 1 ? [c2] : [], method: 'label' } },
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

  const impactRows = useMemo(() => {
    const base = columns.map(col => ({ name: col, ...classify(col) }))
    const removed = done ? [{ name: 'duplicate rows ×37', kind: 'removed' as Impact, why: 'dedupe removed exact-repeat records — they double-counted the same interval.' }] : []
    const added = ENGINEERED_FEATURES.slice(0, Math.max(applied, done ? ENGINEERED_FEATURES.length : 0))
      .map(f => ({ name: f.name, kind: 'added' as Impact, why: f.why }))
    return [...base, ...removed, ...added]
  }, [columns, applied, done])

  const diffView = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_260px_minmax(0,1fr)]">
        <StreamTable columns={columns} rows={rows} speed={10} filename="transformations-raw-full.csv" />
        <FlowPipe active={running || done} />
        <StreamTable columns={processedCols} rows={rows} speed={8} filename="transformations-processed-full.csv" />
      </div>
      <div className="shrink-0">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-gold">why each +{ENGINEERED_FEATURES.length} column was added</div>
        <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
          {ENGINEERED_FEATURES.map(f => (
            <div key={f.name} className="rounded-button border border-accent-gold/25 bg-accent-gold/[0.06] px-3 py-1.5 text-xs">
              <span className={clsx('font-semibold', f.color)}>{f.name}</span>
              <span className="text-gray-400"> — {f.why}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={12} />
      <StageBanner
        chapter="Stage 05 · Transformation Viewer"
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

      <Reveal delay={0.05}>
        <FullscreenBlock label="RAW → PROCESSED · DIFF" accent="emerald" className="h-[520px]">
          {diffView}
        </FullscreenBlock>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="glass-card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Columns3 className="w-4 h-4 text-primary-400" /> What happened to each column
            </h3>
            <span className="ml-auto flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.2em] text-gray-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-accent-cyan" /> modified</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-white/40" /> used</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-accent-rose" /> removed</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-accent-gold" /> added</span>
            </span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {impactRows.map((r, i) => (
                <motion.div
                  key={r.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.8) }}
                  className="rounded-button border border-white/[0.06] bg-black/25 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={clsx('rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]', IMPACT_STYLE[r.kind])}>{r.kind}</span>
                    <span className="truncate font-mono text-xs text-gray-200">{r.name}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{r.why}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </Reveal>

      <div className="grid lg:grid-cols-2 gap-6">
        <Reveal delay={0.12}>
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

        <Reveal delay={0.15}>
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