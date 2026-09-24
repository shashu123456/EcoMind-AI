import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { anomalies } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import clsx from 'clsx'

const SEV: Record<string, { color: string; dot: string; label: string }> = {
  critical: { color: 'text-accent-rose border-rose-500/40 bg-rose-500/10', dot: 'bg-accent-rose', label: 'Critical' },
  high: { color: 'text-accent-rose border-rose-500/30 bg-rose-500/[0.06]', dot: 'bg-accent-rose/70', label: 'High' },
  warning: { color: 'text-accent-amber border-amber-500/40 bg-amber-500/10', dot: 'bg-accent-amber', label: 'Warning' },
  medium: { color: 'text-accent-violet border-violet-500/30 bg-violet-500/[0.06]', dot: 'bg-accent-violet', label: 'Medium' },
  low: { color: 'text-accent-cyan border-cyan-500/30 bg-cyan-500/[0.06]', dot: 'bg-accent-cyan/60', label: 'Low' },
  info: { color: 'text-accent-cyan border-cyan-500/40 bg-cyan-500/10', dot: 'bg-accent-cyan', label: 'Info' },
}

const LEGEND = ['critical', 'high', 'warning', 'medium', 'low', 'info']

function MiniCurve({ near, peak, expected }: { near?: number[] | null; peak?: number | null; expected?: number | null }) {
  const pts = (near && near.length >= 2 ? near.slice(0, 12) : [])
  if (!pts.length && peak == null && expected == null) return null
  const all = [...pts, ...(peak != null ? [peak] : []), ...(expected != null ? [expected] : [])]
  const x = (i: number, n: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const base = expected != null && expected > 0 ? expected : (pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 1)
  const devOf = (v: number) => (base > 0 ? (v - base) / base : 0)
  if (!expected || expected > 0) {
    const devs = all.map(devOf)
    const floor = Math.max(0.5, ...devs.map(d => Math.abs(d)))
    const pMax = Math.max(floor * 1.18, 0.5)
    const yMid = 17
    const y = (v: number) => yMid - (devOf(v) / pMax) * 12
    const line = pts.map((v, i) => `${x(i, pts.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    const peakX = pts.length ? x(pts.length, pts.length + 1) : 50
    return (
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="h-9 w-full">
        <line x1="0" y1={yMid - (0 / pMax) * 12} x2="100" y2={yMid - (0 / pMax) * 12}
          stroke="rgba(217,166,72,0.45)" strokeWidth="0.8" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        {pts.length > 1 && (
          <>
            <polygon points={`0,34 ${line} 100,34`} fill="rgba(74,159,216,0.12)" vectorEffect="non-scaling-stroke" />
            <polyline points={line} fill="none" stroke="#5AB6E8" strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {peak != null && (
          <circle cx={peakX} cy={y(peak)} r="3" fill="#F43F5E" stroke="#0B0E13" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    )
  }
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = Math.max(hi - lo, 1e-6)
  const y = (v: number) => 30 - ((v - lo) / span) * 26
  const line = pts.map((v, i) => `${x(i, pts.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const peakX = pts.length ? x(pts.length, pts.length + 1) : 50
  return (
    <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="h-9 w-full">
      {expected != null && (
        <line x1="0" y1={y(expected)} x2="100" y2={y(expected)}
          stroke="rgba(217,166,72,0.45)" strokeWidth="0.8" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      )}
      {pts.length > 1 && (
        <polyline points={line} fill="none" stroke="#4A9FD8" strokeWidth="1.4"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
      {peak != null && (
        <circle cx={peakX} cy={y(peak)} r="3" fill="#F43F5E" stroke="#0B0E13" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}

export function AnomalyDetectionPage() {
  const { datasetId } = useRouteParams()
  const { setActive, markCompleted } = useJourney()
  const res = useApi<any>(() => (datasetId ? anomalies.list(datasetId, 100) as any : null), [datasetId])
  const list = (res.data || {}) as any
  const items = (list.by_type ? list.anomalies || [] : list.anomalies || []) as any[]
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [scanMeta, setScanMeta] = useState<{ precision?: number | null; recall?: number | null; elapsed_ms?: number } | null>(null)

  const tpos = items.map(a => Date.parse(a.timestamp)).filter(Number.isFinite) as number[]
  const tmin = tpos.length ? Math.min(...tpos) : 0
  const tmax = tpos.length ? Math.max(...tpos) : 1
  const tspread = Math.max(tmax - tmin, 1)
  const posOf = (a: any, i: number) => {
    const t = Date.parse(a.timestamp)
    if (!Number.isFinite(t)) return (i + 0.5) / Math.max(items.length, 1) * 100
    return ((t - tmin) / tspread) * 92 + 4
  }

  async function detect() {
    if (!datasetId || busy) return
    setBusy(true)
    try {
      const resp = await anomalies.detect(datasetId, { method: 'ensemble' }) as any
      setScanMeta({ precision: resp?.precision ?? null, recall: resp?.recall ?? null, elapsed_ms: resp?.elapsed_ms })
      await res.refetch()
      setDone(true)
      markCompleted('anomaly')
      setActive(datasetId)
    } catch { } finally { setBusy(false) }
  }

  useEffect(() => {
    if (items.length && datasetId) { setDone(true); markCompleted('anomaly'); setActive(datasetId) }
  }, [items.length, datasetId])

  const counts = (list.by_severity || {}) as Record<string, number>

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 12 · Anomaly Detection"
        title="Scanning the energy timeline for trouble"
        tagline="Severity-ranked anomalies with evidence, context and suggested actions underneath each one."
        icon={<Activity className="h-6 w-6 text-accent-rose" />}
        children={!items.length ? (
          <button onClick={detect} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-accent-rose to-accent-amber px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(244,63,94,0.3)] disabled:opacity-60">
            <TrendingUp className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Run anomaly scan
          </button>
        ) : <DoneChip text="Scan complete" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Anomalies" value={items.length} accent hint="found in scan" />
        <FlowStat label="Critical" value={counts.critical ?? 0} />
        <FlowStat label="Warning" value={counts.warning ?? 0} />
        <FlowStat label="Info" value={counts.info ?? 0} />
      </div>

      {scanMeta && (
        <Reveal delay={0.05}>
          <div className="glass-panel flex flex-wrap items-center gap-x-6 gap-y-2 p-5">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">Detection quality</p>
            {scanMeta.precision != null ? (
              <>
                <span className="flex items-center gap-2 text-sm text-gray-400">
                  precision
                  <b className="font-mono text-accent-emerald">{fmt(scanMeta.precision * 100, 1)}%</b>
                </span>
                <span className="flex items-center gap-2 text-sm text-gray-400">
                  recall
                  <b className="font-mono text-accent-cyan">{fmt(scanMeta.recall! * 100, 1)}%</b>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-button border border-accent-emerald/30 bg-accent-emerald/[0.06] px-2.5 py-1 text-xs font-medium text-accent-emerald">
                  <CheckCircle2 className="h-3.5 w-3.5" /> evaluated against is_anomaly labels
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-button border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs font-medium text-gray-400">
                no ground-truth labels in this dataset — unsupervised evaluation
              </span>
            )}
            {scanMeta.elapsed_ms != null && (
              <span className="ml-auto text-xs font-mono text-gray-400">scan completed in {fmt(scanMeta.elapsed_ms, 0)} ms</span>
            )}
          </div>
        </Reveal>
      )}

      {items.length === 0 && !res.loading && (
        <p className="py-10 text-center text-sm text-gray-400">No anomalies detected in this window.</p>
      )}

      {items.length > 0 && (
        <Reveal delay={0.1}>
          <div className="glass-panel mb-4 overflow-hidden px-5 pb-3 pt-4">
            <div className="relative h-12 select-none">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  points={Array.from({ length: 14 }, (_, i) => {
                    const wx = (i / 13) * 92 + 4
                    const wy = 50 + Math.sin(i / 1.6) * 20 + Math.cos(i / 0.9) * 8
                    return `${wx.toFixed(1)},${wy.toFixed(1)}`
                  }).join(' ')}
                  fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="0.9" />
              </svg>
              <div className="absolute inset-x-4 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-accent-rose/70 via-accent-amber/70 to-accent-cyan/70" />
              {items.map((a: any, i: number) => {
                const sev = SEV[a.severity] || SEV.info
                return (
                  <motion.button key={a.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setOpen(open === a.id ? null : a.id)}
                    title={`${a.anomaly_type} · ${sev.label} · ${a.timestamp}`}
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${posOf(a, i)}%` }}>
                    <span className={clsx('block h-4 w-4 rounded-full ring-4 ring-black/40', sev.dot, i === items.length - 1 && 'animate-pulse')} />
                  </motion.button>
                )
              })}
              <span className="absolute bottom-0 left-4 text-[11px] font-mono text-gray-400">
                {tpos.length ? new Date(tmin).toISOString().slice(0, 16).replace('T', ' ') : 'start'}
              </span>
              <span className="absolute bottom-0 right-4 text-[11px] font-mono text-gray-400">
                {tpos.length ? new Date(tmax).toISOString().slice(0, 16).replace('T', ' ') : 'end'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.05] pt-3">
              {LEGEND.map(s => {
                const sev = SEV[s] || SEV.info
                return (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-gray-400">
                    <span className={clsx('h-2 w-2 rounded-full', sev.dot)} /> {sev.label}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {items.slice(0, 12).map((a: any, i: number) => {
              const sev = SEV[a.severity] || SEV.info
              const c = a.context || {}
              const expanded = open === a.id
              return (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={clsx('glass-panel overflow-hidden border', sev.color)}>
                  <button onClick={() => setOpen(open === a.id ? null : a.id)} className="w-full px-5 py-4 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <PulseDot color={sev.dot} ping={sev.dot} />
                        <div className="min-w-0">
                          <p className="font-display text-sm font-semibold text-gray-200 truncate">{a.asset_id || a.timestamp}</p>
                          <p className="text-xs font-mono text-gray-400">{a.timestamp} · {a.anomaly_type}</p>
                        </div>
                      </div>
                      <span className={clsx('shrink-0 rounded-button px-2 py-0.5 text-[11px] font-semibold', sev.color)}>
                        {sev.label}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <span className="font-mono text-gray-400">reading <b className="text-gray-200 text-sm">{c.reading_value ?? '—'}</b></span>
                      <span className="font-mono text-gray-400">expected <b className="text-gray-200 text-sm">{c.expected_value ?? '—'}</b></span>
                      {c.deviation_pct != null && (
                        <span className="font-mono text-accent-rose">{fmt(c.deviation_pct, 1)}% off</span>
                      )}
                    </div>
                  </button>
                  {expanded && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-white/[0.06] px-5 py-4">
                      <p className="mb-3 text-sm text-gray-300">{a.description}</p>
                      <div className="rounded-button bg-white/[0.03] p-3">
                        <p className="mb-2 flex items-center gap-1 text-xs font-mono uppercase tracking-widest text-gray-400">
                          <TrendingUp className="w-3.5 h-3.5 text-accent-rose" /> Curve · reading vs window
                        </p>
                        <MiniCurve near={c.nearby_readings} peak={c.reading_value} expected={c.expected_value} />
                        <p className="mt-1 text-[11px] font-mono text-gray-500">
                          {c.nearby_readings?.length ? `window: [${c.nearby_readings.slice(0, 5).map((n: number) => fmt(n, 1)).join(', ')}…]` : 'context sampled'} · centre dot is the reading, dashed line is expected
                        </p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-button bg-white/[0.03] p-3">
                          <p className="mb-1 flex items-center gap-1 text-xs font-mono uppercase tracking-widest text-gray-400">
                            <CheckCircle2 className="w-3 h-3 text-accent-emerald" /> Evidence
                          </p>
                          <p className="text-xs text-gray-300 font-mono">
                            {c.nearby_readings?.length ? `neighbours: [${c.nearby_readings.slice(0, 5).map((n: number) => fmt(n, 1)).join(', ')}]` : 'context sampled'}
                          </p>
                        </div>
                        <div className="rounded-button bg-white/[0.03] p-3">
                          <p className="mb-1 flex items-center gap-1 text-xs font-mono uppercase tracking-widest text-gray-400">
                            <AlertTriangle className="w-3 h-3 text-accent-amber" /> Confidence
                          </p>
                          <p className="text-xs text-gray-300 font-mono">{(a.confidence ?? 0) * 100}% · score {fmt(a.score ?? 0, 3)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-gray-400">
                        Suggested action: {a.severity === 'critical' ? 'Immediately investigate & correlate with weather/occupancy.' : a.severity === 'warning' ? 'Schedule a review within 48h.' : 'Monitor — likely benign drift.'}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )
            })}
          </div>

          {items.length > 12 && (
            <p className="text-xs font-mono text-gray-500">showing the 12 most recent of {items.length} anomalies — the strip above covers the full window.</p>
          )}

          {done && (
            <AutoNext
              to={datasetId ? `/benchmarks/${datasetId}` : '/library'}
              label="Timeline clean — comparing models and peers"
            />
          )}
        </Reveal>
      )}

      <span onClick={() => { markCompleted('anomaly'); setActive(datasetId) }} className="hidden" />
      </div>
    </div>
  )
}

export default AnomalyDetectionPage