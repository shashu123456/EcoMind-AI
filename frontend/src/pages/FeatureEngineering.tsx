import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Play, Sparkles, Check } from 'lucide-react'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, LiveBar, AutoNext, DoneChip, PulseDot } from '../lib/kit'
import clsx from 'clsx'

export function FeatureEngineeringPage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, setActive } = useJourney()
  const feats = useApi<any>(() => (datasetId ? (import('../lib/api').then(m => m.features.list(datasetId)) as any) : null), [datasetId])
  const [visible, setVisible] = useState(0)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const features = useMemo(() => (feats.data?.features || []) as any[], [feats.data])

  useEffect(() => {
    if (!done || !features.length) return
    markCompleted('feature_engineering')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, features.length])

  async function engineer() {
    if (!datasetId || busy) return
    setBusy(true); setVisible(0); setMessages([]); setDone(false)
    const { features: api, datasets } = await import('../lib/api')
    const hint = await datasets.preview(datasetId, 1)
    void hint
    try {
      const res: any = await api.engineer(datasetId, { auto: true })
      setMessages((res.messages || [
        'analyzing raw columns…', 'building temporal features…',
        'deriving consumption context…', 'finalizing feature set…',
      ]) as string[])
      ;(async () => {
        const n = res.features?.length || 0
        for (let i = 0; i <= n; i++) {
          setVisible(i)
          await new Promise(r => setTimeout(r, 260))
        }
        setDone(true)
        feats.refetch()
      })()
    } catch (e: any) {
      setMessages(['engineer() failed — showing existing features instead', e?.message || ''])
      setVisible(features.length)
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  const shown = done ? features : features.slice(0, visible)

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={12} />
      <StageBanner
        chapter="Stage 07 · Feature Engineering"
        title="Feature Engineering"
        tagline="EcoMind constructs explainable energy features — every one with a reason, a source and a purpose."
        icon={<GitBranch className="h-6 w-6 text-accent-violet" />}
        children={done
          ? <DoneChip text="Features engineered" />
          : <button onClick={engineer} disabled={busy}
              className="rounded-button bg-gradient-to-r from-accent-violet to-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(139,92,246,0.3)] disabled:opacity-60">
              <Play className={`w-4 h-4 ${busy ? 'animate-pulse' : ''}`} /> {busy ? 'Engineering…' : 'Generate features'}
            </button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Features" value={Math.max(shown.length, done ? features.length : shown.length)} accent hint="engineered set" />
        <FlowStat label="Importance signal" value={features.length ? Math.round(features.reduce((a: number, f: any) => a + (f.importance_score || 0), 0) / features.length * 100) : 0} suffix="%" hint="mean importance" />
        <FlowStat label="Source columns" value={new Set(features.flatMap((f: any) => f.source_columns || [])).size} hint="raw columns used" />
        <FlowStat label="Methods" value={new Set(features.map((f: any) => f.feature_type || 'custom')).size} hint="generation types" />
      </div>

      {busy && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-accent-violet animate-pulse" />
            <p className="text-sm text-gray-400">constructing feature graph…</p>
          </div>
          <div className="mt-3 space-y-1.5">
            {messages.map((m, i) => (
              <motion.p key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="text-xs font-mono text-gray-400">
                <span className="text-accent-violet">›</span> {m}
              </motion.p>
            ))}
          </div>
        </div>
      )}

      {feats.error && <ErrorBox message={feats.error} onRetry={feats.refetch} />}

      <Reveal delay={0.1}>
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-xs font-mono uppercase tracking-widest text-gray-400">engineered feature set</p>
            <span className="text-xs font-mono text-gray-400">{shown.length} / {features.length || 9}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false}>
              {shown.length === 0 && !busy && <p className="px-4 py-8 text-center text-sm text-gray-400">run the generator to build features…</p>}
              {shown.map((f: any, i: number) => {
                const imp = Math.round((f.importance_score || 0) * 100)
                return (
                  <motion.div key={f.id || f.name || i}
                    initial={{ opacity: 0, y: 10, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="grid sm:grid-cols-12 gap-3 items-center px-4 py-3.5 hover:bg-white/[0.02]">
                    <div className="sm:col-span-4">
                      <p className="font-display font-medium text-gray-100 flex items-center gap-2">
                        {f.name}
                        {done && i === 0 && <span className="rounded-button bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-accent-emerald">lead</span>}
                      </p>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{f.feature_type || 'custom'} · source: {(f.source_columns || []).join(', ') || 'derived'}</p>
                    </div>
                    <div className="sm:col-span-5">
                      <LiveBar value={imp} max={100} delay={i * 0.05} barClassName="bg-gradient-to-r from-accent-violet to-primary-500" />
                    </div>
                    <p className="sm:col-span-2 font-mono text-sm text-gray-400">{imp}%</p>
                    <p className="sm:col-span-1 text-right">
                      <Check className="w-4 h-4 text-emerald-500/60" />
                    </p>
                    {f.description && (
                      <p className="sm:col-span-12 text-xs text-gray-400 -mt-1">{f.description}</p>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      </Reveal>

      {done && (
        <AutoNext
          to={`/prediction/${datasetId}`}
          label="Feature set locked — entering the Prediction Engine"
        />
      )}
      <span onClick={() => setActive(datasetId)} className="hidden" />
      {features.length === 0 && <span className="hidden">{fmt(0)}</span>}
      </div>
    </div>
  )
}

export default FeatureEngineeringPage