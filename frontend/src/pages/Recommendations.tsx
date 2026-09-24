import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Lightbulb, Sparkles, Zap, Leaf, Target, ShieldCheck, ArrowRight } from 'lucide-react'
import { recommendations } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, n, EmptyBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import clsx from 'clsx'

const PRIORITY: Record<string, { color: string; icon: React.ReactNode }> = {
  high: { color: 'bg-rose-500/15 text-accent-rose border-rose-500/30', icon: <Zap className="w-3 h-3" /> },
  medium: { color: 'bg-amber-500/15 text-accent-amber border-amber-500/30', icon: <Target className="w-3 h-3" /> },
  low: { color: 'bg-cyan-500/15 text-accent-cyan border-cyan-500/30', icon: <ShieldCheck className="w-3 h-3" /> },
}

export function RecommendationsPage() {
  const { datasetId } = useRouteParams()
  const { setActive, markCompleted } = useJourney()
  const res = useApi<any>(() => (datasetId ? recommendations.list(datasetId) as any : null), [datasetId])
  const data = (res.data || {}) as any
  const items: any[] = Array.isArray(data.recommendations) ? data.recommendations : []
  const totalKwh = n(data.total_savings_kwh)
    ?? items.reduce((s, r) => s + (n(r?.estimated_savings_kwh) ?? 0), 0)
  const totalPct = n(data.total_savings_percent) ?? 0
  const top = (data.top_recommendation ?? items[0] ?? null) as any
  const topConf = n(top?.confidence) ?? 0
  const topTitle = typeof top?.title === 'string' ? top.title : undefined
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState(0)

  async function generate() {
    if (!datasetId || busy) return
    setBusy(true)
    setRevealed(0)
    try {
      await recommendations.generate(datasetId, { top_k: 8 })
      await res.refetch()
      markCompleted('recommendation')
      setActive(datasetId)
      const nRecs = (Array.isArray(res.data?.recommendations) ? res.data.recommendations : []).length
      let i = 0
      const t = setInterval(() => { i += 1; setRevealed(i); if (i >= nRecs) clearInterval(t) }, 240)
    } catch { } finally { setBusy(false) }
  }

  useEffect(() => {
    if (items.length && datasetId) {
      setRevealed(items.length)
      markCompleted('recommendation')
      setActive(datasetId)
    }
  }, [items.length, datasetId])

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 14 · Recommendation Engine"
        title="Your AI energy consultant"
        tagline="Evidence-backed actions with projected savings, confidence and business impact."
        icon={<Lightbulb className="h-6 w-6 text-accent-amber" />}
        children={!items.length ? (
          <button onClick={generate} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-accent-amber to-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(245,158,11,0.3)] disabled:opacity-60">
            <Sparkles className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Generate recommendations
          </button>
        ) : <DoneChip text={`${items.length} recommendations ready`} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Total savings" value={totalKwh} decimals={0} suffix=" kWh" accent />
        <FlowStat label="Savings potential" value={totalPct} decimals={1} suffix="%" />
        <FlowStat label="Top priority" value={topConf} decimals={0} suffix="%" hint={topTitle} />
        <FlowStat label="Recommendations" value={items.length} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {items.slice(0, revealed).map((r: any, i: number) => {
          const pri = PRIORITY[r?.priority] || PRIORITY.low
          const kwh = n(r?.estimated_savings_kwh)
          const conf = Math.min(1, Math.max(0, n(r?.confidence) ?? 0))
          return (
            <motion.article key={r?.id || i} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i % 2) * 0.15 + Math.floor(i / 2) * 0.2, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="group glass-panel overflow-hidden transition-transform duration-300 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3 px-6 pt-5">
                <div>
                  <span className="rounded-button bg-white/[0.06] px-2 py-0.5 text-xs font-mono uppercase tracking-widest text-gray-400">
                    {r?.category || 'general'}
                  </span>
                  <h3 className="mt-2 font-display text-lg font-semibold text-gray-100">{r?.title || 'Untitled recommendation'}</h3>
                </div>
                <span className={clsx('flex shrink-0 items-center gap-1 rounded-button border px-2 py-1 text-xs font-bold', pri.color)}>
                  {pri.icon} {r?.priority || 'low'}
                </span>
              </div>

              <p className="px-6 pt-3 text-sm leading-relaxed text-gray-400">{r?.description || 'No description provided.'}</p>

              <div className="grid grid-cols-3 gap-px bg-white/[0.04] px-6 py-4 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 font-display text-lg font-bold text-accent-emerald">
                    <Zap className="w-3.5 h-3.5" />{fmt(kwh, 0)}
                  </p>
                  <p className="text-[11px] font-mono uppercase tracking-widest text-gray-400">kWh saved</p>
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-accent-cyan">{fmt(n(r?.estimated_savings_percent), 1)}%</p>
                  <p className="text-[11px] font-mono uppercase tracking-widest text-gray-400">reduction</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 font-display text-lg font-bold text-accent-emerald">
                    <Leaf className="w-3.5 h-3.5" />{fmt((kwh ?? 0) * 0.42, 0)}
                  </p>
                  <p className="text-[11px] font-mono uppercase tracking-widest text-gray-400">kg CO₂</p>
                </div>
              </div>

              <div className="px-6 pb-5">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-mono uppercase tracking-widest text-gray-400">AI confidence</span>
                  <span className="font-mono text-gray-300">{fmt(conf * 100, 0)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${conf * 100}%` }}
                    transition={{ duration: 1, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-accent-amber to-accent-emerald" />
                </div>
                {typeof r?.supporting_evidence?.basis === 'string' && r.supporting_evidence.basis && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-gray-400">
                    <Target className="mt-0.5 w-3 h-3 shrink-0 text-primary-400" />
                    Evidence: {r.supporting_evidence.basis}
                  </p>
                )}
                <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                  <ArrowRight className="w-3 h-3" /> Recommended action · implementation difficulty: {r?.status || 'medium'}
                </p>
              </div>
            </motion.article>
          )
        })}
        {revealed < items.length && <p className="font-mono text-xs text-primary-400 animate-pulse">drafting recommendations…</p>}
      </div>

      {!items.length && !res.loading && (
        <EmptyBox title="No recommendations yet" hint="Run the journey or generate recommendations to surface evidence-backed actions." />
      )}

      {items.length > 0 && (
        <AutoNext
          to="/executive"
          label="Consultant brief ready — assembling the Executive Intelligence Center"
        />
      )}
      <span onClick={() => { markCompleted('recommendation'); setActive(datasetId) }} className="hidden" />
      </div>
    </div>
  )
}

export default RecommendationsPage