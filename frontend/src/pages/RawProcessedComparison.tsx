import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Scale, Zap, ArrowRight, Trophy } from 'lucide-react'
import { comparison, workflows } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, LiveBar, FlowStat, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import { AnnotatedText } from '../lib/interactive'
import clsx from 'clsx'

const METRICS = [
  { key: 'r2', label: 'R²', higher: true },
  { key: 'rmse', label: 'RMSE', higher: false },
  { key: 'mae', label: 'MAE', higher: false },
  { key: 'mape', label: 'MAPE', higher: false },
]

export function RawProcessedComparisonPage() {
  const { runId } = useRouteParams()
  const { setActive, markCompleted } = useJourney()
  const run = useApi<any>(() => (runId ? workflows.get(runId) as any : null), [runId])
  const dsId = (run.data?.run?.dataset_id as string) || ''

  const res = useApi<any>(() => (runId ? comparison.get(runId) as any : null), [runId])
  const cmp = res.data?.comparison ?? (res.data as any)
  const [busy, setBusy] = useState(false)
  const [ran, setRan] = useState(false)

  const raw = useMemo(() => cmp?.metrics?.raw as any, [cmp])
  const processed = useMemo(() => cmp?.metrics?.processed as any, [cmp])
  const improvement = useMemo(() => (cmp?.improvement || {}) as any, [cmp])
  const conclusion = (cmp?.conclusion || '') as string

  async function runComparison() {
    if (!runId || busy) return
    setBusy(true)
    try {
      await comparison.run(runId, { target_column: 'energy_kwh', algorithm: 'xgboost' })
      await res.refetch()
      setRan(true)
      markCompleted('raw_vs_processed')
      setActive(dsId, runId)
    } catch { } finally { setBusy(false) }
  }

  useEffect(() => { if (cmp && runId) { setRan(true); markCompleted('raw_vs_processed'); setActive(dsId, runId) } }, [cmp, runId])

  const hasCmp = !!(raw && processed)
  const improvementPct = improvement?.r2_delta != null ? Math.max(0, improvement.r2_delta * 100) : null
  const metricPct = (m: string) => {
    if (!raw || !processed) return null
    const r = Number(raw[m]); const p = Number(processed[m])
    if (r === null || r === undefined || !Number.isFinite(r) || !Number.isFinite(p) || r === 0) return null
    return ((p - r) / Math.abs(r)) * 100
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 10 · Raw vs Processed AI Comparison"
        title="The dataset just proved it is worth fixing"
        tagline="Two worlds, one demand curve. Watch processed data beat raw data by the numbers."
        icon={<Scale className="h-6 w-6 text-primary-400" />}
        children={!hasCmp ? (
          <button onClick={runComparison} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(76,95,213,0.35)] disabled:opacity-60">
            <Zap className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Run comparison
          </button>
        ) : <DoneChip text="Comparison complete" />}
      />

      {res.error && <ErrorBox message={res.error} onRetry={runComparison} />}

      {hasCmp && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { label: 'Raw Dataset Prediction', data: raw, accent: 'text-accent-rose', border: 'border-rose-500/30', dot: 'bg-accent-rose' },
              { label: 'Processed Dataset Prediction', data: processed, accent: 'text-accent-emerald', border: 'border-emerald-500/40', dot: 'bg-accent-emerald' },
            ].map(({ label, data, accent, border, dot }, side) => (
              <Reveal key={label} delay={side * 0.1}>
                <div className={clsx('glass-panel overflow-hidden', border)}>
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
                    <PulseDot color={dot} />
                    <p className="font-display text-sm font-semibold text-gray-100">{label}</p>
                    {side === 1 && <Trophy className="ml-auto w-4 h-4 text-accent-emerald" />}
                  </div>
                  <div className="space-y-5 p-5">
                    {METRICS.map((m) => {
                      const v = Number(data?.[m.key])
                      const valid = v !== null && v !== undefined && Number.isFinite(v)
                      const disp = valid ? (m.key === 'r2' || m.key === 'mape' ? fmt(v, 3) : fmt(v, 2)) : '—'
                      const pct = metricPct(m.key)
                      return (
                        <div key={m.key}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-mono uppercase tracking-widest text-gray-400">{m.label}</span>
                            <span className={clsx('font-mono text-sm', accent)}>{disp}{pct != null && (
                              <span className={clsx('ml-2', pct >= 0 ? 'text-accent-emerald' : 'text-accent-rose')}>
                                ({pct >= 0 ? '+' : ''}{fmt(pct, 0)}%)
                              </span>)}</span>
                          </div>
                          <LiveBar value={valid ? v : 0} max={m.higher ? 1 : 200}
                            barClassName={side === 1
                              ? 'bg-gradient-to-r from-emerald-500 to-accent-emerald'
                              : 'bg-gradient-to-r from-rose-500 to-accent-rose'} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <div className="glass-panel relative overflow-hidden px-6 py-5">
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-wrap items-center gap-5">
                <div className="flex items-center gap-3">
                  <p className="font-display text-lg font-semibold text-rose-400">Raw Dataset</p>
                  <span className="text-gray-400">&lt;</span>
                  <ArrowRight className="w-4 h-4 text-accent-emerald" />
                  <p className="font-display text-lg font-semibold text-accent-emerald">Processed Dataset</p>
                </div>
                {improvementPct != null ? (
                  <p className="font-display text-2xl font-bold text-accent-emerald">
                    <AnnotatedText variant="underline">+{fmt(improvementPct, 1)}% improvement</AnnotatedText>
                  </p>
                ) : null}
                {conclusion ? <p className="w-full text-sm text-gray-400">
                  <AnnotatedText variant="highlight">{conclusion}</AnnotatedText>
                </p> : null}
              </motion.div>
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <motion.div
                  className="absolute h-full w-24 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent"
                  animate={{ x: ['-10%', '110%'] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} />
              </div>
            </div>
          </Reveal>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FlowStat label="R² delta" value={improvement?.r2_delta != null ? improvement.r2_delta * 100 : 0} decimals={1} suffix="%" accent />
            <FlowStat label="RMSE reduction" value={improvement?.rmse_delta_pct != null ? improvement.rmse_delta_pct : 0} decimals={1} suffix="%" />
            <FlowStat label="MAE reduction" value={improvement?.mae_delta_pct != null ? improvement.mae_delta_pct : 0} decimals={1} suffix="%" />
            <FlowStat label="SHAP stability delta" value={improvement?.shap_stability_delta != null ? improvement.shap_stability_delta : 0} decimals={1} suffix="%" />
          </div>

          {ran && (
            <AutoNext
              to={dsId ? `/shap/auto` : '/library'}
              label="Quality proven — inspecting why the model decides"
            />
          )}
        </>
      )}

      {!hasCmp && !res.loading && !res.error && (
        <p className="py-10 text-center text-sm text-gray-400">
          Run a raw-vs-processed comparison to see data quality lift model performance.
        </p>
      )}
      <span onClick={() => { setActive(dsId, runId) }} className="hidden" />
      </div>
    </div>
  )
}

export default RawProcessedComparisonPage