import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Sparkles } from 'lucide-react'
import { explanations, models } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, LiveBar, FlowStat, AutoNext, DoneChip } from '../lib/kit'
import clsx from 'clsx'

export function SHAPExplainabilityPage() {
  const { modelId } = useRouteParams()
  const { datasetId, runId, setActive, markCompleted } = useJourney()
  const placeholder = !modelId || modelId === '$modelId' || modelId === 'auto'
  const [resolved, setResolved] = useState<string | null>(placeholder ? null : modelId)

  const res = useApi<any>(async () => {
    let id = resolved
    if (!id) {
      const ml = await models.list() as any
      const mine = (ml?.models || []).filter((m: any) => m.id && (!datasetId || !m.dataset_id || m.dataset_id === datasetId))
      if (!mine.length) return null
      id = mine[0].id
      setResolved(id as string)
    }
    return explanations.global(id as string, 15)
  }, [resolved, datasetId])

  const noModel = placeholder && !resolved && !res.loading && !res.data
  const g = res.data as any
  const [revealed, setRevealed] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (g && g.feature_names?.length) {
      let i = 0
      const t = setInterval(() => {
        i += 1
        setRevealed(i)
        if (i >= g.feature_names.length) { clearInterval(t); setTimeout(() => { setDone(true); markCompleted('shap') }, 1200) }
      }, 220)
      return () => clearInterval(t)
    }
  }, [g])

  const names = (g?.feature_names || []) as string[]
  const vals = (g?.global_importance || []) as number[]
  const stability = (g?.stability_index ?? 0) as number

  const rows = useMemo(() => names.map((n, i) => ({ name: n, v: Number(vals[i] || 0) })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)), [names, vals])
  const max = Math.max(0.0001, ...rows.map(r => Math.abs(r.v)))

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 11 · SHAP Explainability"
        title="Why the model decided what it decided"
        tagline="Every prediction decomposes into contributions — nothing is a black box."
        icon={<GitBranch className="h-6 w-6 text-accent-violet" />}
        children={!g ? (
          <button onClick={res.refetch} disabled={res.loading}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-accent-violet to-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(139,92,246,0.35)] disabled:opacity-60">
            <Sparkles className={`w-4 h-4 ${res.loading ? 'animate-spin' : ''}`} /> Compute global SHAP
          </button>
        ) : <DoneChip text="Explanations ready" />}
      />

      {res.error && <ErrorBox message={res.error} onRetry={res.refetch} />}

      {g && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FlowStat label="Features" value={names.length} accent hint="ranked by |SHAP|" />
            <FlowStat label="SHAP Stability" value={stability * 100} decimals={1} suffix="%" hint="repeatability across samples" />
            <FlowStat label="Base value" value={g.base_value ?? 0} decimals={2} />
            <FlowStat label="Expected value" value={g.expected_value ?? 0} decimals={2} />
          </div>

          <Reveal delay={0.1}>
            <div className="glass-panel overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-3 text-xs font-mono uppercase tracking-widest text-gray-400">
                Global feature importance →
              </div>
              <div className="space-y-2.5 p-5">
                {rows.slice(0, revealed).map((r, i) => {
                  const positive = r.v >= 0
                  return (
                    <motion.div key={r.name} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-mono text-gray-300">{r.name}</span>
                        <span className={clsx('font-mono text-sm', positive ? 'text-accent-emerald' : 'text-accent-rose')}>
                          {positive ? '+' : ''}{fmt(r.v, 4)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(Math.abs(r.v) / max) * 100}%` }}
                          transition={{ duration: 0.8, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                          className={clsx('h-full rounded-full', positive ? 'bg-gradient-to-r from-emerald-500 to-accent-emerald' : 'bg-gradient-to-r from-rose-500 to-accent-rose')}
                        />
                      </div>
                    </motion.div>
                  )
                })}
                {revealed < rows.length && (
                  <motion.p animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.3, repeat: Infinity }}
                    className="text-xs font-mono text-primary-400">
                    decomposing…
                  </motion.p>
                )}
              </div>
            </div>
          </Reveal>

          {done && (
            <AutoNext
              to={datasetId ? `/anomalies/${datasetId}` : '/library'}
              label="Why-tree explained — scanning the timeline for anomalies"
            />
          )}
        </>
      )}

      {noModel && (
        <p className="py-10 text-center text-sm text-gray-400">
          No trained model found. Train one in the <span className="text-gray-200">Prediction Engine</span> stage, then compute global SHAP here.
        </p>
      )}
      <span onClick={() => { markCompleted('shap'); setActive(datasetId, runId, resolved || modelId) }} className="hidden" />
      </div>
    </div>
  )
}

export default SHAPExplainabilityPage