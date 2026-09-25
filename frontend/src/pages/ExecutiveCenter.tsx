import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, AlertTriangle, Award, Sparkles, TrendingUp } from 'lucide-react'
import { ai, datasets } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, n } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, Gauge, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import clsx from 'clsx'

export function ExecutiveCenterPage() {
  const { datasetId } = useRouteParams()
  const { setActive, markCompleted, datasetId: ctxDs } = useJourney()
  const ds = useApi<any>(() => datasets.list() as any, [])
  const dsList = (ds.data?.datasets || []) as any[]
  const activeId = datasetId || ctxDs || dsList[0]?.id || ''

  const ex = useApi<any>(() => (activeId ? ai.executive(activeId) as any : null), [activeId])
  const sum = ex.data?.summary as any
  const tl = useApi<any>(() => (activeId ? ai.timeline(activeId) as any : null), [activeId])
  const stages = (tl.data?.stages || []) as any[]

  const chart = stages.map((s: any, i: number) => ({
    name: s.stage_name ? s.stage_name.replace(/_/g, ' ').slice(0, 14) : `Stage ${s.stage_number}`,
    ms: n(s.duration_ms) ?? 0,
    c: i % 2 ? '#3B82F6' : '#22C55E',
  })).filter((d: any) => d.ms > 0)

  useEffect(() => {
    if (activeId) setActive(activeId, null)
    if (sum) markCompleted('executive_center')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sum, activeId])

  const trust = n(sum?.trust?.trust_score ?? sum?.trust_score) ?? 0
  const dq = n(sum?.dq_score) ?? 0
  const tmp = sum?.totals || {}
  const best = sum?.best_model || {}
  const anomaly = sum?.anomaly_summary || {}
  const anomalyTotal = n(anomaly.total) ?? 0
  const byType: Record<string, number> = anomaly.by_type && typeof anomaly.by_type === 'object' ? anomaly.by_type : {}
  const board = sum?.leaderboard && typeof sum.leaderboard === 'object' ? (sum.leaderboard as Record<string, any>) : {}
  const recos = (Array.isArray(sum?.recommendations) ? sum.recommendations : []) as any[]
  const drivers = Array.isArray(sum?.shap_drivers)
    ? (sum.shap_drivers as unknown[]).filter((d): d is string => typeof d === 'string')
    : []
  const driverCount = drivers.length
  const bestName = typeof sum?.best_model === 'string'
    ? (sum.best_model as string)
    : typeof best?.name === 'string' && best.name ? best.name : '—'
  const findings: string[] = []
  if (recos.length) findings.push(...recos.map((r: any) => r?.title).filter((t): t is string => typeof t === 'string' && t.length > 0))
  if (drivers.length) findings.push(`Model driven by ${drivers.join(', ')}`)
  if (anomalyTotal > 0) findings.push(`${anomalyTotal} anomalies flagged across ${Object.keys(byType).length} patterns`)

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={22} />
      <StageBanner
        chapter="Stage 13 · Executive Intelligence Center"
        title="Mission Control"
        tagline="The entire journey compressed into a CEO-grade briefing. Everything EcoMind believes, in one view."
        icon={<Crown className="h-6 w-6 text-accent-amber" />}
        children={
          dsList.length > 1 ? (
            <select value={activeId} onChange={(e) => setActive(e.target.value, null)}
              className="rounded-button border border-white/10 bg-surface-light px-3 py-2 text-xs font-mono text-gray-300 outline-none focus:border-primary-500">
              {dsList.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : <DoneChip text="Briefing ready" />
        }
      />

      {sum && (
        <>
          <Reveal delay={0.05}>
            <div className="glass-panel relative overflow-hidden px-6 py-8">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-accent-emerald/10" />
              <p className="font-display text-2xl font-semibold tracking-tight text-gray-100 md:text-3xl">
                {sum.headline || 'Energy intelligence briefing'}
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
                {findings.length > 0 ? findings.slice(0, 3).join('. ') + '.' : 'The pipeline ran to completion and produced an explainable energy intelligence snapshot.'}
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FlowStat label="Data Quality" value={dq} decimals={1} suffix="%" accent />
            <FlowStat label="Trust Score" value={trust} decimals={1} suffix="%" />
            <FlowStat label="Anomalies" value={anomalyTotal} />
            <FlowStat label="Best Model" value={n((sum?.best_model as any)?.r2) ?? 0}
              decimals={n((sum?.best_model as any)?.r2) != null ? 3 : undefined} hint={bestName} />
          </div>

          <Reveal delay={0.1}>
            <div className="grid lg:grid-cols-[300px_1fr] gap-6">
              <div className="glass-panel flex flex-col items-center justify-center py-6">
                <Gauge value={trust / 100} size={200} color={trust >= 80 ? '#22C55E' : trust >= 60 ? '#F59E0B' : '#F43F5E'}
                  label="Overall trust" sublabel="explainable confidence" />
              </div>

              <div className="space-y-4">
                <div className="glass-panel overflow-hidden">
                  <div className="border-b border-white/[0.06] px-5 py-3 text-xs font-mono uppercase tracking-widest text-gray-400">
                    Business impact
                  </div>
                  <div className="grid grid-cols-3 gap-px bg-white/[0.04]">
                    {[
                      { label: 'Total demand', value: `${fmt(n(tmp.forecast_kwh), 1)} kWh`, sub: 'forecast horizon' },
                      { label: 'CO₂ footprint', value: `${fmt(n(tmp.co2_kg), 1)} kg`, sub: 'estimated' },
                      { label: 'Cost exposure', value: `$${fmt(n(tmp.cost), 2)}`, sub: 'estimated' },
                    ].map((b) => (
                      <div key={b.label} className="px-5 py-4 text-center">
                        <p className="text-[11px] font-mono uppercase tracking-widest text-gray-400">{b.label}</p>
                        <p className="mt-1 font-display text-lg font-bold text-accent-emerald">{b.value}</p>
                        <p className="text-xs font-mono text-gray-400">{b.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {findings.length > 0 && (
                    <div className="glass-panel p-5">
                      <p className="mb-3 flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-gray-400">
                        <Sparkles className="w-3.5 h-3.5 text-primary-400" /> Key findings
                      </p>
                      <ul className="space-y-2">
                        {findings.slice(0, 5).map((f: string, i: number) => (
                          <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="mt-0.5 text-accent-emerald">✓</span> {f}
                          </motion.li>
                        ))}
                      </ul>
                      <div className="mt-5 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-accent-emerald" />
                        <p className="text-xs text-gray-400">
                          Recommended savings: {fmt(n(sum.total_savings_kwh), 0)} kWh ({fmt(n(sum.total_savings_percent), 0)}%) across {recos.length} actions
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="glass-panel p-5">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-gray-400">
                      <AlertTriangle className="w-3.5 h-3.5 text-accent-rose" /> Risks & drivers
                    </p>
                    <ul className="space-y-2">
                      {anomalyTotal > 0 && (
                        <motion.li initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="mt-0.5 text-accent-rose">⚠</span>
                          {anomalyTotal} confirmed anomalies — {Object.entries(byType).map(([k, v]) => `${n(v) ?? 0} ${k.replace(/_/g, ' ')}`).join(', ')}
                        </motion.li>
                      )}
                      {driverCount > 0 && (
                        <motion.li initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.08 }} className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="mt-0.5 text-accent-cyan">◆</span>
                          Top SHAP drivers: {drivers.join(', ')}
                        </motion.li>
                      )}
                      {Object.keys(board).length > 0 && (
                        <motion.li initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.16 }} className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="mt-0.5 text-accent-amber">◆</span>
                          {Object.keys(board).length} models benchmarked head-to-head
                        </motion.li>
                      )}
                      {anomalyTotal <= 0 && driverCount === 0 && Object.keys(board).length === 0 && (
                        <li className="text-xs text-gray-400">No anomalies or model risks flagged yet.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-[1fr_380px] gap-6">
            <Reveal delay={0.15}>
              <div className="glass-panel p-5">
                <p className="mb-4 text-xs font-mono uppercase tracking-widest text-gray-400">Stage duration timeline (ms)</p>
                {chart.length > 0 ? (
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <XAxis dataKey="name" tick={{ fill: 'var(--gray-500)', fontSize: 9 }} interval={0} angle={-24} height={50} />
                        <YAxis tick={{ fill: 'var(--gray-400)', fontSize: 9 }} width={42} />
                        <Tooltip formatter={(v: any) => `${Math.round(Number(v))} ms`} cursor={{ fill: 'var(--bg2, rgba(255,255,255,0.04))' }}
                          contentStyle={{ background: 'var(--panel2, #171A20)', border: '1px solid var(--color-border, rgba(255,255,255,0.1))', borderRadius: 12, color: 'var(--gray-100, #E8EAEE)' }}
                          labelStyle={{ color: 'var(--gray-300, #BEC4CF)', fontSize: 12, fontWeight: 600 }}
                          itemStyle={{ color: 'var(--gray-100, #E8EAEE)', fontSize: 12 }} />
                        <Bar dataKey="ms" radius={[4, 4, 0, 0]}>
                          {chart.map((d: any, i: number) => <Cell key={i} fill={d.c} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-10 text-center text-xs text-gray-400">No stage timing data yet.</p>
                )}
              </div>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="glass-panel p-5">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-gray-400">
                  <Award className="w-3.5 h-3.5 text-accent-amber" /> Model leaderboard
                </p>
                {Object.keys(board).length > 0 ? (
                  <div className="space-y-2.5">
                    {Object.entries(board).map(([name, m]: [string, any], i: number) => {
                      const r2 = n(m?.r2)
                      return (
                        <div key={name} className={clsx('rounded-button px-3 py-2', i === 0 ? 'bg-amber-500/10' : 'bg-white/[0.03]')}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-gray-300">
                              {i === 0 && <Crown className="w-3 h-3 text-accent-amber" />} {name}
                            </span>
                            <span className="font-mono text-accent-emerald">R² {fmt(r2, 3)}</span>
                          </div>
                          <p className="text-[11px] font-mono text-gray-400">
                            RMSE {fmt(n(m?.rmse), 3)} · MAE {fmt(n(m?.mae), 3)} · MAPE {fmt(n(m?.mape), 2)}%
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No models benchmarked for this dataset.</p>
                )}
                <div className="mt-5 flex items-center gap-2">
                  <PulseDot color="bg-accent-emerald" />
                  <p className="text-xs text-gray-400">Business readiness: {trust >= 80 ? 'HIGH' : trust >= 60 ? 'MEDIUM' : 'LOW'}</p>
                </div>
              </div>
            </Reveal>
          </div>

          <AutoNext to="/reports" label="Briefing assembled — generating audit-ready reports" />
        </>
      )}

      {!sum && !ex.loading && <p className="py-10 text-center text-sm text-gray-400">No executive summary yet — run a journey first.</p>}
      <span onClick={() => setActive(activeId, null)} className="hidden" />
      </div>
    </div>
  )
}

export default ExecutiveCenterPage