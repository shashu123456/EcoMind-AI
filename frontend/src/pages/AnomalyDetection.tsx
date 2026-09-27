import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Activity, AlertTriangle, Check, Minus, Radar } from 'lucide-react'
import {
  anomalies,
  type Anomaly,
  type AnomalyContext,
  type AnomalyListPayload,
  type DetectResult,
} from '../lib/api'
import { useApi } from '../lib/hooks'
import { fmt, n, useRouteParams } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { beatForStage } from '../lib/story'
import {
  Bar,
  EmptyState,
  LoadingState,
  MetricPill,
  Panel,
  SectionLabel,
  StageHeader,
  Stat,
  StatusChip,
  StoryFlow,
} from '../lib/stagekit'
import { AutoNext, Button } from '../lib/kit'

/* ── Anomaly incident desk ────────────────────────────────────────────
   Beat 09 · Anomalies. One incident timeline (severity lanes over a date
   axis), one investigation panel (root cause + confirmation), one ledger.
   Every number is the real API payload.                            */

type Row = Omit<Anomaly, 'timestamp' | 'context'> & {
  timestamp: string | null
  context: Partial<AnomalyContext> | null
}

type Method = 'ensemble' | 'isolation_forest' | 'zscore'
const METHODS: Method[] = ['ensemble', 'isolation_forest', 'zscore']

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

type BarTone = 'primary' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet'
type SevTone = { label: string; dot: string; text: string; chip: string; tone: BarTone }

const SEV: Record<string, SevTone> = {
  critical: {
    label: 'Critical',
    dot: 'bg-rose-500',
    text: 'text-rose-500',
    chip: 'border-rose-500/30 bg-rose-500/[0.07] text-rose-500',
    tone: 'rose',
  },
  high: {
    label: 'High',
    dot: 'bg-amber-500',
    text: 'text-amber-500',
    chip: 'border-amber-500/30 bg-amber-500/[0.07] text-amber-500',
    tone: 'amber',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-accent-gold',
    text: 'text-accent-gold',
    chip: 'border-accent-gold/30 bg-accent-gold/[0.08] text-accent-gold',
    tone: 'amber',
  },
  low: {
    label: 'Low',
    dot: 'bg-cyan-500',
    text: 'text-cyan-500',
    chip: 'border-cyan-500/30 bg-cyan-500/[0.07] text-cyan-500',
    tone: 'cyan',
  },
}

function sevTone(severity: string | null | undefined): SevTone {
  const k = String(severity ?? '').toLowerCase()
  const known = SEV[k]
  if (known) return known
  return {
    label: k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Unknown',
    dot: 'bg-gray-400',
    text: 'text-t-mid',
    chip: 'border-border bg-panel2 text-t-mid',
    tone: 'primary',
  }
}

function sevKey(severity: string | null | undefined): string {
  return String(severity ?? '').toLowerCase() || 'low'
}

/** reading window: nearby readings + the flagged reading, one point highlighted. */
function MiniSpark({ readings, current, expected }: {
  readings: number[]
  current: number | null
  expected: number | null
}) {
  const series = readings.filter(v => Number.isFinite(v))
  if (current !== null) series.push(current)
  if (!series.length) {
    return <p className="py-4 text-center text-[11px] text-t-lo">no neighbours in the sampled window</p>
  }
  const exp = expected !== null && expected > 0 ? expected : null
  const domain = exp !== null ? series.concat(exp) : series
  const lo = Math.min(...domain)
  const hi = Math.max(...domain)
  const span = hi - lo || Math.abs(hi) || 1
  const W = 200
  const H = 40
  const PAD = 5
  const x = (i: number) =>
    series.length <= 1 ? W / 2 : PAD + (i / (series.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2)
  const line = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const li = series.length - 1
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-10 w-full"
        role="img"
        aria-label="reading window versus expected"
      >
        {exp !== null && (
          <line
            x1="0" y1={y(exp)} x2={W} y2={y(exp)}
            stroke="currentColor" strokeOpacity="0.3" strokeWidth="1"
            strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
            className="text-t-lo"
          />
        )}
        <polygon points={area} className="fill-primary-500/[0.08]" />
        {series.length > 1 && (
          <polyline
            points={line} fill="none" className="stroke-primary-500"
            strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <span
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-rose ring-2 ring-panel"
        style={{ left: `${(x(li) / W) * 100}%`, top: `${(y(series[li]) / H) * 100}%` }}
      />
    </div>
  )
}

/** indeterminate sweep — only rendered while a detect/confirm call is in flight */
function Working({ label }: { label: string }) {
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
    </div>
  )
}

export function AnomalyDetectionPage() {
  const { datasetId } = useRouteParams()
  const { setActive, markCompleted } = useJourney()

  const res = useApi<AnomalyListPayload>(
    () => (datasetId
      ? anomalies.list(datasetId, 200)
      : Promise.resolve({ anomalies: [], total: 0 })),
    [datasetId],
  )

  const [run, setRun] = useState<DetectResult | null>(null)
  const [method, setMethod] = useState<Method>('ensemble')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmBusy, setConfirmBusy] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const items = useMemo<Row[]>(() => res.data?.anomalies ?? [], [res.data])
  const listTotal = n(res.data?.total) ?? items.length
  const sevCounts = run?.by_severity ?? res.data?.by_severity ?? null
  const typeCounts = run?.by_type ?? res.data?.by_type ?? null

  const detected = n(run?.detected_count) ?? items.length
  const scanned = n(run?.total) ?? listTotal
  /* detect result first, stored list stats otherwise */
  const confSource = useMemo(
    () => (run?.anomalies?.length ? run.anomalies : items),
    [run, items],
  )
  const avgConfidence = useMemo(() => {
    if (!confSource.length) return null
    const sum = confSource.reduce((acc, a) => acc + (n(a.confidence) ?? 0), 0)
    return sum / confSource.length
  }, [confSource])

  const confirmedCount = useMemo(
    () => items.filter(a => overrides[a.id] ?? Boolean(a.is_confirmed)).length,
    [items, overrides],
  )

  const sevKeys = useMemo(() => {
    const seen = new Set<string>()
    items.forEach(a => seen.add(sevKey(a.severity)))
    if (sevCounts) Object.keys(sevCounts).forEach(k => seen.add(k.toLowerCase()))
    return Array.from(seen)
      .filter(k => k !== '')
      .sort((a, b) => {
        const ai = SEVERITY_ORDER.indexOf(a)
        const bi = SEVERITY_ORDER.indexOf(b)
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
      })
  }, [items, sevCounts])

  const countOf = (key: string) => {
    const fromAgg = n(sevCounts?.[key])
    if (fromAgg !== null) return fromAgg
    return items.filter(a => sevKey(a.severity) === key).length
  }

  const times = useMemo(
    () => items.map(a => Date.parse(a.timestamp ?? '')).filter(Number.isFinite) as number[],
    [items],
  )
  const tMin = times.length ? Math.min(...times) : 0
  const tMax = times.length ? Math.max(...times) : 0
  const spread = Math.max(tMax - tMin, 1)
  const timelineReady = times.length >= 2 && tMax > tMin
  const posOf = (t: number) => 3 + ((t - tMin) / spread) * 94

  const selected = useMemo(
    () => items.find(a => a.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  )

  async function detect() {
    if (!datasetId || busy) return
    setBusy(true)
    setError(null)
    try {
      const resp = await anomalies.detect(datasetId, { method })
      setRun(resp)
      setOverrides({})
      setSelectedId(null)
      await res.refetch()
      markCompleted('anomaly')
      setActive(datasetId)
    } catch (e: any) {
      setError(e?.message || 'detection failed')
    } finally {
      setBusy(false)
    }
  }

  async function toggleConfirm(a: Row) {
    if (!datasetId || confirmBusy) return
    const next = !(overrides[a.id] ?? Boolean(a.is_confirmed))
    setConfirmBusy(a.id)
    setError(null)
    try {
      const updated = await anomalies.confirm(datasetId, a.id, { is_confirmed: next })
      const landed = typeof updated?.is_confirmed === 'boolean' ? updated.is_confirmed : next
      setOverrides(p => ({ ...p, [a.id]: landed }))
      await res.refetch()
    } catch (e: any) {
      setError(e?.message || 'confirmation failed')
    } finally {
      setConfirmBusy(null)
    }
  }

  useEffect(() => {
    if (items.length && datasetId) {
      markCompleted('anomaly')
      setActive(datasetId)
    }
  }, [items.length, datasetId, markCompleted, setActive])

  const beat = beatForStage('anomaly')
  const loading = res.loading && !res.data
  const ctx = (selected?.context || {}) as Partial<AnomalyContext>
  const reading = n(ctx.reading_value)
  const expected = n(ctx.expected_value)
  const deviation = n(ctx.deviation_pct)
  const devTone =
    deviation === null || deviation === 0
      ? 'text-t-mid'
      : deviation > 20
        ? 'text-rose-500'
        : deviation > 0
          ? 'text-amber-500'
          : 'text-emerald-600'
  const selConfirmed = selected ? overrides[selected.id] ?? Boolean(selected.is_confirmed) : false
  const activeStep = busy ? 'processed' : items.length ? 'produced' : 'entered'

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={beat.beat}
        chapter="Anomalies"
        title="Anomaly incident desk"
        tagline="Every flagged reading on one date axis — then open one incident and work the root cause."
        icon={<Activity className="h-5 w-5 text-accent-rose" />}
        right={
          <>
            <div className="inline-flex rounded-button border border-border bg-panel2 p-0.5">
              {METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  disabled={busy}
                  onClick={() => setMethod(m)}
                  title={`Detection method: ${m.replace(/_/g, ' ')}`}
                  className={clsx(
                    'rounded-button px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors disabled:opacity-50',
                    method === m ? 'bg-primary-500' : 'text-t-lo hover:text-t-hi',
                  )}
                >
                  {m.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={detect}
              disabled={busy}
              aria-busy={busy}
              className="whitespace-nowrap"
            >
              <Radar className="h-4 w-4" />
              {busy ? 'Detecting…' : 'Run detection'}
            </Button>
          </>
        }
      />

      {/* ── top strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Detected"
          value={fmt(detected, 0)}
          hint={`${fmt(items.length - confirmedCount, 0)} awaiting triage`}
          accent="rose"
        />
        <Stat
          label="Total scanned"
          value={fmt(scanned, 0)}
          hint={run ? 'this detection run' : `${fmt(listTotal, 0)} stored incidents`}
        />
        <Stat
          label="Avg confidence"
          value={avgConfidence === null ? '—' : `${fmt(avgConfidence * 100, 1)}%`}
          hint="across the incident set"
          accent="primary"
          mono
        />
        <Stat
          label="Elapsed"
          value={run?.elapsed_ms != null ? `${fmt(run.elapsed_ms, 0)}` : '—'}
          hint={run?.elapsed_ms != null ? 'ms · last detect call' : 'run a detection to measure'}
          mono
        />
      </div>

      {busy && <Working label="scanning timeline" />}
      {!busy && error && <StatusChip status="warn">{error}</StatusChip>}

      {/* ── cluster chips ───────────────────────────────────────── */}
      {(typeCounts || sevCounts) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border bg-panel px-3.5 py-2.5">
          {typeCounts && Object.keys(typeCounts).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <SectionLabel>by type</SectionLabel>
              {Object.entries(typeCounts)
                .sort((a, b) => (n(b[1]) ?? 0) - (n(a[1]) ?? 0))
                .map(([k, v]) => (
                  <MetricPill key={k} label={k.replace(/_/g, ' ')} value={fmt(n(v) ?? 0, 0)} />
                ))}
            </div>
          )}
          {sevCounts && Object.keys(sevCounts).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <SectionLabel>by severity</SectionLabel>
              {sevKeys
                .filter(k => countOf(k) > 0)
                .map(k => (
                  <span
                    key={k}
                    className={clsx(
                      'inline-flex items-baseline gap-1.5 rounded-button border px-2.5 py-1 font-mono text-[11px]',
                      sevTone(k).chip,
                    )}
                  >
                    {sevTone(k).label}
                    <span className="font-semibold">{fmt(countOf(k), 0)}</span>
                  </span>
                ))}
            </div>
          )}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-t-lo">
            {fmt(confirmedCount, 0)} confirmed
          </span>
        </div>
      )}

      {loading && <LoadingState label="Loading incidents…" />}

      {!loading && !items.length && !run && (
        <EmptyState
          title="No anomalies recorded for this dataset"
          hint="Run detection to score every reading against the isolation-forest, z-score and rule ensemble."
          action={
            <Button size="sm" onClick={detect} disabled={busy}>
              <Radar className="h-4 w-4" /> Run detection
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <>
          {/* ── severity timeline ────────────────────────────── */}
          <Panel
            title="Severity timeline"
            right={
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                {SEVERITY_ORDER.map(k => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-t-lo"
                    title={`severity ${sevTone(k).label}`}
                  >
                    <span className={clsx('h-1.5 w-1.5 rounded-full', sevTone(k).dot)} />
                    {sevTone(k).label}
                  </span>
                ))}
                <span className="font-mono text-[9px] uppercase tracking-widest text-t-lo">
                  · dot size = confidence
                </span>
              </div>
            }
          >
            {timelineReady ? (
              <div className="space-y-2">
                {sevKeys.map(key => {
                  const tone = sevTone(key)
                  const lane = items.filter(a => sevKey(a.severity) === key)
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="flex w-28 shrink-0 items-center gap-1.5">
                        <span className={clsx('h-2 w-2 shrink-0 rounded-full', tone.dot)} />
                        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-t-lo">
                          {tone.label}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-t-mid">
                          {fmt(countOf(key), 0)}
                        </span>
                      </div>
                      <div className="relative h-8 flex-1 rounded-button bg-panel2">
                        <span className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-border" />
                        {lane.map((a, i) => {
                          const t = Date.parse(a.timestamp ?? '')
                          if (!Number.isFinite(t)) return null
                          const conf = Math.max(0, Math.min(1, n(a.confidence) ?? 0))
                          const size = 8 + conf * 8
                          const on = selected?.id === a.id
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setSelectedId(a.id)}
                              title={`${a.timestamp ?? '—'} · ${a.anomaly_type ?? 'anomaly'} · ${tone.label} · confidence ${fmt(conf * 100, 0)}%`}
                              className={clsx(
                                'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-125',
                                on && 'ring-2 ring-primary-500 ring-offset-2 ring-offset-panel2',
                              )}
                              style={{ left: `${posOf(t)}%`, width: size, height: size }}
                            >
                              <motion.span
                                initial={{ scale: 0.3, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
                                className={clsx(
                                  'block h-full w-full rounded-full',
                                  tone.dot,
                                  (overrides[a.id] ?? Boolean(a.is_confirmed)) && 'ring-1 ring-panel',
                                )}
                              />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center gap-3 border-t border-border pt-2">
                  <div className="w-28 shrink-0" />
                  <div className="flex flex-1 items-center justify-between font-mono text-[10px] text-t-lo">
                    <span>{new Date(tMin).toISOString().slice(0, 16).replace('T', ' ')}</span>
                    <span>
                      {new Date(tMin + spread / 2).toISOString().slice(0, 16).replace('T', ' ')}
                    </span>
                    <span>{new Date(tMax).toISOString().slice(0, 16).replace('T', ' ')}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-t-lo">
                Fewer than two distinct timestamps in this window — the date axis cannot place
                incidents, so work from the ledger below instead.
              </p>
            )}
          </Panel>

          {/* ── investigation panel ──────────────────────────── */}
          <Panel
            title="Investigation"
            right={
              selected && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                  {selected.id ? selected.id.slice(0, 8) : '—'}
                </span>
              )
            }
            className="min-h-0"
          >
            {run?.precision != null || run?.recall != null ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-button bg-panel2 px-3 py-2">
                <SectionLabel>vs is_anomaly labels</SectionLabel>
                {run.precision != null && (
                  <MetricPill label="precision" value={`${fmt(run.precision * 100, 1)}%`} accent="text-emerald-600" />
                )}
                {run.recall != null && (
                  <MetricPill label="recall" value={`${fmt(run.recall * 100, 1)}%`} accent="text-accent-cyan" />
                )}
                {run.precision == null && run.recall == null && (
                  <span className="text-[11px] text-t-lo">no ground-truth labels in this dataset</span>
                )}
              </div>
            ) : null}

            {!selected ? (
              <p className="text-xs text-t-lo">Select an incident from the timeline or ledger.</p>
            ) : (
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest',
                      sevTone(selected.severity).chip,
                    )}
                  >
                    {sevTone(selected.severity).label}
                  </span>
                  <MetricPill label="score" value={fmt(n(selected.score), 3)} />
                  <MetricPill label="conf" value={`${fmt((n(selected.confidence) ?? 0) * 100, 1)}%`} />
                  {selConfirmed ? (
                    <StatusChip status="ok">confirmed</StatusChip>
                  ) : (
                    <StatusChip status="idle">unconfirmed</StatusChip>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <SectionLabel>confidence</SectionLabel>
                  </div>
                  <Bar
                    value={(n(selected.confidence) ?? 0) * 100}
                    className="flex-1"
                    tone={sevTone(selected.severity).tone}
                  />
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] text-t-mid">
                    {fmt((n(selected.confidence) ?? 0) * 100, 1)}%
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-t-mid">
                  {selected.description || 'No description recorded for this incident.'}
                </p>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-t-lo">
                  <span>
                    asset <b className="ml-1 font-semibold text-t-hi">{selected.asset_id || '—'}</b>
                  </span>
                  <span>{selected.timestamp ? selected.timestamp.replace('T', ' ').slice(0, 19) : '—'}</span>
                </div>

                {/* root cause */}
                <div className="rounded-card border border-border bg-panel2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SectionLabel>root cause</SectionLabel>
                    <span className="rounded-button border border-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary-500">
                      {(selected.anomaly_type || 'anomaly').replace(/_/g, ' ')}
                    </span>
                    <span
                      className={clsx(
                        'ml-auto font-mono text-[11px] font-semibold',
                        devTone,
                      )}
                    >
                      Δ {deviation === null ? '—' : `${deviation > 0 ? '+' : ''}${fmt(deviation, 1)}%`}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div className="rounded-button border border-border bg-panel px-3 py-2">
                      <SectionLabel>reading</SectionLabel>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-t-hi">
                        {fmt(reading, 2)}
                      </p>
                    </div>
                    <div className="rounded-button border border-border bg-panel px-3 py-2">
                      <SectionLabel>expected</SectionLabel>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-t-mid">
                        {fmt(expected, 2)}
                      </p>
                    </div>
                  </div>

                  {reading !== null && expected !== null && (
                    <p className="mt-2 font-mono text-[11px] text-t-lo">
                      absolute gap{' '}
                      <span className="text-t-mid">
                        {fmt(reading - expected, 2)}
                      </span>{' '}
                      · {fmt(ctx.nearby_readings?.length ?? 0, 0)} neighbour readings sampled
                    </p>
                  )}

                  <div className="mt-2.5">
                    <MiniSpark
                      readings={(ctx.nearby_readings ?? []).map(v => n(v) ?? NaN)}
                      current={reading}
                      expected={expected}
                    />
                    <p className="mt-1 text-[10px] text-t-lo">
                      dashed line = expected value · filled dot = the flagged reading
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={selConfirmed ? 'secondary' : 'success'}
                    gradient="emerald"
                    disabled={confirmBusy === selected.id}
                    onClick={() => toggleConfirm(selected)}
                  >
                    {confirmBusy === selected.id ? (
                      'Saving…'
                    ) : selConfirmed ? (
                      <>
                        <Minus className="h-4 w-4" /> Unconfirm
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Confirm anomaly
                      </>
                    )}
                  </Button>
                  {selConfirmed && (
                    <span className="text-[11px] text-t-lo">
                      this reading is locked out of the next detection run
                    </span>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {/* ── ledger ──────────────────────────────────────── */}
          <Panel
            title="Incident ledger"
            right={
              <span className="font-mono text-[10px] uppercase tracking-widest text-t-lo">
                {fmt(items.length, 0)} of {fmt(scanned, 0)}
              </span>
            }
            flush
          >
            <div className="overflow-x-auto">
              <div className="min-w-[46rem]">
                <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,8.5rem)_minmax(0,1fr)_6rem_6rem_5.5rem_4.5rem] gap-3 border-b border-border px-4 py-2">
                  {['id', 'timestamp', 'type', 'severity', 'score', 'conf', 'state'].map(h => (
                    <SectionLabel key={h} className="truncate">
                      {h}
                    </SectionLabel>
                  ))}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {items.map(a => {
                    const tone = sevTone(a.severity)
                    const on = selected?.id === a.id
                    const isOn = overrides[a.id] ?? Boolean(a.is_confirmed)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedId(a.id)}
                        className={clsx(
                          'grid w-full grid-cols-[minmax(0,5.5rem)_minmax(0,8.5rem)_minmax(0,1fr)_6rem_6rem_5.5rem_4.5rem] items-center gap-3 border-b border-border px-4 py-2 text-left transition-colors last:border-0',
                          on ? 'bg-primary-500/[0.06]' : 'hover:bg-panel2',
                        )}
                      >
                        <span className="truncate font-mono text-[11px] text-t-lo">
                          {a.id ? a.id.slice(0, 8) : '—'}
                        </span>
                        <span className="truncate font-mono text-[11px] text-t-mid">
                          {a.timestamp ? a.timestamp.replace('T', ' ').slice(0, 16) : '—'}
                        </span>
                        <span className="truncate text-[11px] text-t-mid">
                          {(a.anomaly_type || '—').replace(/_/g, ' ')}
                        </span>
                        <span
                          className={clsx(
                            'truncate rounded-button border px-1.5 py-0.5 text-center font-mono text-[10px] uppercase tracking-wider',
                            tone.chip,
                          )}
                        >
                          {tone.label}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Bar value={(n(a.score) ?? 0) * 100} className="flex-1" tone="primary" />
                          <span className="font-mono text-[10px] text-t-lo">
                            {fmt((n(a.score) ?? 0) * 100, 0)}
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-t-mid">
                          {fmt((n(a.confidence) ?? 0) * 100, 0)}%
                        </span>
                        <span className="flex items-center justify-end">
                          {isOn ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Minus className="h-4 w-4 text-t-lo" />
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </Panel>
        </>
      )}

      <StoryFlow stageKey="anomaly" activeKey={activeStep} />

      {items.length > 0 && (
        <AutoNext
          to={datasetId ? `/benchmarks/${datasetId}` : '/library'}
          label="Anomalies reviewed — benchmarking the pipeline"
        />
      )}

      {!items.length && !loading && (
        <p className="flex items-center gap-2 text-[11px] text-t-lo">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          Nothing to investigate yet — the ledger stays empty until a detection run scores this
          dataset.
        </p>
      )}
    </div>
  )
}

export default AnomalyDetectionPage
