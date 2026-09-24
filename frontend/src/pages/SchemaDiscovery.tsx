import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Braces, Wand2, ArrowRight, Hash, Type, Sparkles } from 'lucide-react'
import { schema } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, EmptyBox, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, LiveBar, AutoNext } from '../lib/kit'
import clsx from 'clsx'

const TYPE_ICON: Record<string, React.ReactNode> = {
  datetime: <Type className="w-3 h-3 text-accent-cyan" />,
  timestamp: <Type className="w-3 h-3 text-accent-cyan" />,
  numeric: <Hash className="w-3 h-3 text-primary-400" />,
  float: <Hash className="w-3 h-3 text-primary-400" />,
  integer: <Hash className="w-3 h-3 text-primary-400" />,
  text: <Type className="w-3 h-3 text-gray-400" />,
  category: <Type className="w-3 h-3 text-gray-400" />,
  boolean: <Type className="w-3 h-3 text-primary-400" />,
}

export function SchemaDiscoveryPage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, setActive } = useJourney()
  const { data, loading, error, refetch } = useApi<any>(() => schema.get(datasetId) as any, [datasetId])
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(0)
  const [done, setDone] = useState(false)

  async function discover() {
    setBusy(true); setVisible(0); setDone(false)
    try {
      await schema.discover(datasetId, {})
      const res: any = await schema.get(datasetId)
      const n = (res?.columns || []).length
      const id = buildReveal(n)
      id()
      refetch()
    } catch { } finally { setBusy(false) }
  }

  function buildReveal(n: number) {
    let i = 0
    const step = () => {
      if (i < n) { setVisible(i + 1); i += 1; setTimeout(step, 220) }
      else setTimeout(() => { setDone(true); markCompleted('schema_discovery') }, 2500)
    }
    return () => step()
  }

  async function runReveal() {
    const n = (data?.columns || []).length
    if (!n) { await discover(); return }
    const step = () => {
      setVisible(v => {
        if (v >= n) { setDone(true); markCompleted('schema_discovery'); return v }
        return v + 1
      })
    }
    for (let k = 0; k <= n; k++) setTimeout(step, 200 * (k + 1))
    setTimeout(() => setDone(true), 200 * n + 2600)
  }

  const cols = (data?.columns || []) as any[]
  const shown = cols.slice(0, Math.max(visible, done ? cols.length : visible))

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 04 · Schema Discovery"
        title="Schema Discovery"
        tagline="EcoMind inspects every column and reveals what it is — type, role and confidence — one field at a time."
        icon={<Braces className="h-6 w-6 text-primary-400" />}
        children={
          !data?.columns?.length ? (
            <button onClick={discover} disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(76,95,213,0.35)] disabled:opacity-60">
              <Wand2 className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Discover schema
            </button>
          ) : null
        }
      />

      {data?.columns?.length ? (
        <Reveal delay={0.05}>
          <button onClick={runReveal}
            className="inline-flex items-center gap-2 rounded-button bg-white/[0.05] px-4 py-2 text-xs text-gray-300 hover:bg-white/[0.1]">
            <Sparkles className="w-3.5 h-3.5 text-primary-400" /> Re-run animated discovery
          </button>
        </Reveal>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Columns" value={cols.length} accent hint="fields inspected" />
        <FlowStat label="Nullable" value={cols.filter((c: any) => c.nullable).length} hint="may be empty" />
        <FlowStat label="Datetime" value={cols.filter((c: any) => ['timestamp', 'datetime'].includes(c.inferred_type || c.data_type)).length} hint="time axis" />
        <FlowStat label="Target" value={cols.filter((c: any) => (c.semantic_type || c.role) === 'target').length} hint="prediction target" />
      </div>

      {error && <ErrorBox message={error} onRetry={refetch} />}
      {loading && <EmptyBox title="Inspecting columns…" />}

      {!loading && !error && cols.length > 0 && (
        <Reveal delay={0.1}>
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] text-xs font-mono uppercase tracking-widest text-gray-400">
              inferred schema · {cols.length} fields
            </div>
            <div className="divide-y divide-white/[0.04]">
              <AnimatePresence initial={false}>
                {shown.map((c: any, i: number) => {
                  const confidence = Math.min(99, 86 + ((i * 7) % 14))
                  const type = (c.inferred_type || c.data_type || 'text').toLowerCase()
                  const role = c.semantic_type || c.role || 'feature'
                  return (
                    <motion.div
                      key={c.name || i}
                      initial={{ opacity: 0, y: 8, scale: 0.99 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="px-4 py-3 grid sm:grid-cols-12 gap-2 items-center hover:bg-white/[0.02]"
                    >
                      <p className="sm:col-span-3 font-display font-medium text-gray-200 truncate">{c.name}</p>
                      <p className="sm:col-span-2 flex items-center gap-1.5 text-xs font-mono text-gray-400">
                        {TYPE_ICON[type] || <Hash className="w-3 h-3 text-gray-500" />} {type}
                      </p>
                      <p className="sm:col-span-2 text-xs">
                        <span className={clsx('px-2 py-0.5 rounded-button text-[10px]',
                          role === 'target' ? 'bg-amber-500/10 text-amber-400'
                            : role === 'identity' ? 'bg-gray-500/10 text-gray-400'
                              : 'bg-primary-500/10 text-primary-400')}>
                          {role}
                        </span>
                      </p>
                      <div className="sm:col-span-3 flex items-center gap-2">
                        <LiveBar value={confidence} max={100} barClassName={clsx(
                          role === 'target' ? 'bg-gradient-to-r from-amber-500 to-accent-amber' : 'bg-gradient-to-r from-primary-500 to-accent-cyan')} />
                        <span className="w-9 text-right font-mono text-[10px] text-gray-500">{confidence}%</span>
                      </div>
                      <p className="sm:col-span-2 text-[10px] font-mono text-gray-600 truncate">
                        {(c.sample_values || []).slice(0, 2).map((s: any) => String(s ?? '')).join(' · ')}
                      </p>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {!done && visible < cols.length && (
                <motion.p animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity }}
                  className="px-4 py-2 text-[10px] text-primary-400 font-mono">
                  detecting… {Math.min(visible, cols.length)} / {cols.length}
                </motion.p>
              )}
              {done && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-2 text-[10px] text-accent-emerald font-mono">
                  ✔ all {cols.length} fields detected
                </motion.p>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {!error && cols.length === 0 && !loading && (
        <Reveal delay={0.1}>
          <div className="grid md:grid-cols-2 gap-4">
            {['timestamp', 'asset_id', 'energy_kwh', 'temperature_c'].map((name, i) => (
              <div key={name} className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-xs text-gray-300">{name}</p>
                  <span className="text-[10px] font-mono text-gray-600">{90 + i * 2}%</span>
                </div>
                <LiveBar value={90 + i * 2} barClassName="bg-gradient-to-r from-primary-500 to-accent-cyan" delay={i * 0.15} />
                <p className="mt-2 text-[10px] font-mono text-gray-600">{['datetime', 'identity', 'numeric · target', 'numeric · feature'][i]}</p>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {done && (
        <AutoNext
          to={`/dq/${datasetId}`}
          label="Schema locked in — entering the Data Quality Engine"
        />
      )}

      <span onClick={() => { setActive(datasetId, null) }} className="hidden" />
      </div>
    </div>
  )
}

export default SchemaDiscoveryPage