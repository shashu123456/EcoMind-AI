import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, RefreshCw, ArrowRight, Sparkles } from 'lucide-react'
import { ai, workflows } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, Gauge, LiveBar, FlowStat, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import clsx from 'clsx'

const VERDICT: Record<string, { label: string; color: string; tip: string }> = {
  high_trust: { label: 'Reliable', color: 'text-accent-emerald', tip: 'Proceed with confidence' },
  moderate: { label: 'Reliable with Caveats', color: 'text-accent-amber', tip: 'Review the flagged factors' },
  low: { label: 'Need More Data', color: 'text-accent-rose', tip: 'Improve data before deciding' },
}

const SIGNALS: { key: string; weight: number; symbol: string }[] = [
  { key: 'prediction_confidence', weight: 0.4, symbol: 'pred' },
  { key: 'dq_score', weight: 0.25, symbol: 'dq' },
  { key: 'model_relevance', weight: 0.2, symbol: 'rel' },
  { key: 'shap_stability', weight: 0.15, symbol: 'shap' },
]

function SignalMath({ name, value, last, total, verdict }: {
  name: string; value: number; last: boolean; total: number; verdict: string
}) {
  const sig = SIGNALS.find(s => s.key.replace(/_/g, ' ') === name.toLowerCase() || s.key === name.toLowerCase().replace(/ /g, '_'))
  if (!sig) return null
  const w = sig.weight
  const part = w * value
  return (
    <div className="ml-[10rem] mt-1.5 rounded border border-white/[0.06] bg-[#0B0E13] px-3 py-2 font-mono text-[10px] leading-4 text-gray-500">
      <span className="text-gray-400">equation </span>
      trust += {sig.symbol}·{w.toFixed(2)}
      <span className="text-gray-400"> = </span>
      {w.toFixed(2)}×{value.toFixed(1)} = <span className="text-gray-200">{part.toFixed(1)}</span> pts
      {last && (
        <div className="mt-1 border-t border-white/[0.06] pt-1">
          <span className="text-gray-400">Σ = 0.40·pred + 0.25·dq + 0.20·rel + 0.15·shap = </span>
          <span className="text-[#34D399]">{total.toFixed(1)}</span>
          <span className="text-gray-400"> → </span>
          <span className={verdict === 'high_trust' ? 'text-[#34D399]' : verdict === 'moderate' ? 'text-accent-amber' : 'text-[#F87171]'}>{verdict}</span>
        </div>
      )}
    </div>
  )
}

export function ConfidenceGatePage() {
  const { runId } = useRouteParams()
  const { setActive, markCompleted, datasetId: ctxDs, modelId } = useJourney()
  const run = useApi<any>(() => (runId ? workflows.get(runId) as any : null), [runId])
  const datasetId = (run.data?.run?.dataset_id as string) || ctxDs || ''

  const [dsId, setDsId] = useState<string>('')
  useEffect(() => { if (datasetId) setDsId(datasetId) }, [datasetId])

  const res = useApi<any>(() => (dsId ? ai.confidence(dsId) as any : null), [dsId])
  const gate = (res.data?.gate ?? res.data) as any
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const verdict = VERDICT[gate?.verdict || 'low'] || VERDICT.low
  const trustPct = gate ? Number(gate.trust_score ?? 0) : 0
  const threshold = 60

  async function evaluate() {
    setBusy(true)
    try {
      const r: any = await ai.evaluate(dsId, {}) as any
      const g = r?.gate ?? r
      if (g) {
        await res.refetch()
        setDone(true)
        markCompleted('confidence_gate')
        setActive(dsId, runId)
      }
      void g
    } catch { } finally { setBusy(false) }
  }

  useEffect(() => { if (gate && runId) { setDone(true); markCompleted('confidence_gate'); setActive(dsId, runId) } }, [gate, runId])

  const factors = useMemo(() => {
    const raw = (gate?.factors || {}) as any
    if (Array.isArray(raw) && raw.length) return raw
    if (!gate || !raw || typeof raw !== 'object') return []
    const rows: { name: string; value: number }[] = []
    const map: Record<string, string> = {
      prediction_confidence: 'Prediction Confidence',
      dq_score: 'Data Quality',
      model_relevance: 'Model Reliability',
      shap_stability: 'SHAP Stability',
    }
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number') rows.push({ name: map[k] || k.replace(/_/g, ' '), value: v })
    }
    if (!rows.length && gate.prediction_confidence != null) {
      return [
        { name: 'Prediction Confidence', value: gate.prediction_confidence },
        { name: 'Data Quality', value: gate.dq_score },
        { name: 'Model Reliability', value: gate.model_relevance },
        { name: 'SHAP Stability', value: gate.shap_stability },
      ]
    }
    return rows
  }, [gate])

  const reasoning = useMemo(() => {
    const r = gate?.reasoning as any
    if (!r) return []
    if (Array.isArray(r)) return r as string[]
    const lines: string[] = [r.explanation || 'Weighted fusion of prediction confidence, DQ score, model relevance and SHAP stability.']
    if (r.weights && typeof r.weights === 'object') {
      for (const [k, v] of Object.entries(r.weights)) {
        lines.push(`${k.replace(/_/g, ' ')} weighted at ${fmt(Number(v) * 100, 0)}%`)
      }
    }
    if (Array.isArray(r.missing_factors) && r.missing_factors.length) {
      lines.push(`Missing (weight redistributed): ${(r.missing_factors as string[]).join(', ')}`)
    }
    return lines
  }, [gate])

  const below = gate && trustPct < threshold

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 09 · AI Confidence Gate"
        title="The AI must earn your trust before it decides"
        tagline="Four explainable signals are fused into a single trust score. Nothing is opaque."
        icon={<ShieldCheck className="h-6 w-6 text-accent-emerald" />}
        children={gate ? <DoneChip text="Trust assessed" /> : (
          <button onClick={evaluate} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-emerald px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(76,95,213,0.35)] disabled:opacity-60">
            <Sparkles className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Evaluate trust gate
          </button>
        )}
      />

      {res.error && <ErrorBox message={res.error} onRetry={res.refetch} />}

      {gate && (
        <>
          <Reveal delay={0.05}>
            <div className="grid lg:grid-cols-[320px_1fr] gap-6">
              <div className="glass-panel flex flex-col items-center justify-center py-6">
                <Gauge
                  value={trustPct / 100}
                  size={220}
                  color={trustPct >= 80 ? '#10B981' : trustPct >= 60 ? '#F59E0B' : '#F43F5E'}
                  label="Final Trust Score"
                  sublabel={`${fmt(trustPct, 1)}%`}
                  decimals={0}
                />
                <motion.div key={gate.verdict} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className={clsx('mt-4 flex items-center gap-2 rounded-button px-4 py-2 text-sm font-semibold',
                    gate.verdict === 'high_trust' && 'bg-emerald-500/15 text-accent-emerald',
                    gate.verdict === 'moderate' && 'bg-amber-500/15 text-accent-amber',
                    gate.verdict === 'low' && 'bg-rose-500/15 text-accent-rose')}>
                  <PulseDot color={verdict.color.replace('text-', 'bg-')} />
                  {verdict.label}
                </motion.div>
                {below && (
                  <p className="mt-3 max-w-[240px] text-center text-xs text-accent-rose">
                    Below the {threshold}% threshold — return to the data quality stage to lift confidence.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="glass-panel overflow-hidden">
                  <div className="border-b border-white/[0.06] px-5 py-3 text-xs font-mono uppercase tracking-widest text-gray-400">
                    Contributing signals
                  </div>
                  <div className="space-y-5 p-5">
                    {factors.map((f: any, i: number) => {
                      const v = Number(f.value ?? 0)
                      return (
                        <Reveal key={f.name || i} delay={i * 0.12} y={10}>
                          <div className="flex items-center gap-3">
                            <p className="w-40 shrink-0 text-sm text-gray-300">{f.name}</p>
                            <LiveBar value={v} max={100}
                              barClassName={clsx(
                                v >= 80 ? 'bg-gradient-to-r from-emerald-500 to-accent-emerald'
                                  : v >= 60 ? 'bg-gradient-to-r from-amber-500 to-accent-amber'
                                    : 'bg-gradient-to-r from-rose-500 to-accent-rose')} />
                            <span className="w-14 text-right font-mono text-sm text-gray-400">{fmt(v, 0)}%</span>
                          </div>
                          <SignalMath name={f.name} value={v} last={i === factors.length - 1}
                            total={factors.reduce((s: number, x: any) => s + Number(x.value ?? 0), 0) > 0 ? trustPct : 0}
                            verdict={gate.verdict} />
                        </Reveal>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {reasoning.length > 0 && (
            <Reveal delay={0.15}>
              <div className="glass-panel overflow-hidden">
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
                  <PulseDot color="bg-primary-400" />
                  <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Explainable reasoning</p>
                </div>
                <div className="space-y-2 p-5">
                  {reasoning.map((r: string, i: number) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.4 }}
                      className="flex items-start gap-2 rounded-button bg-white/[0.03] px-3 py-2 text-sm text-gray-300">
                      <span className="mt-0.5 text-accent-emerald">✓</span> {r}
                    </motion.div>
                  ))}
                </div>
              </div>
            </Reveal>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FlowStat label="Prediction Confidence" value={Number(gate.prediction_confidence ?? 0)} decimals={1} suffix="%" />
            <FlowStat label="Data Quality" value={Number(gate.dq_score ?? 0)} decimals={1} suffix="%" />
            <FlowStat label="Model Reliability" value={Number(gate.model_relevance ?? 0)} decimals={1} suffix="%" />
            <FlowStat label="SHAP Stability" value={Number(gate.shap_stability ?? 0)} decimals={1} suffix="%" />
          </div>

          {done && (
            <AutoNext
              to={modelId ? `/shap/${modelId}` : '/library'}
              label="Trust gate passed — opening SHAP explanations of every prediction"
            />
          )}
        </>
      )}

      {below && (
        <Reveal delay={0.1}>
          <div className="glass-panel flex flex-wrap items-center gap-4 px-5 py-4">
            <p className="flex items-center gap-2 text-sm text-gray-300">
              <RefreshCw className="w-4 h-4 text-accent-amber" />
              Trust is below the {threshold}% threshold.
            </p>
            <button onClick={() => window.location.assign(dsId ? `/dq/${dsId}` : '/library')}
              className="inline-flex items-center gap-2 rounded-button border border-accent-amber/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-accent-amber hover:bg-amber-500/20">
              Return to Data Quality <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </Reveal>
      )}

      {!gate && !res.loading && (
        <p className="py-10 text-center text-sm text-gray-400">Awaiting a trained model to gate…</p>
      )}
      <span onClick={() => { setActive(dsId, runId) }} className="hidden" />
      </div>
    </div>
  )
}

export default ConfidenceGatePage