import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Trophy, Award, Medal } from 'lucide-react'
import { benchmarks } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, n, EmptyBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, AutoNext, DoneChip, PulseDot, LiveBar, downloadCSV } from '../lib/kit'
import clsx from 'clsx'

const RANK_ICON: Record<number, React.ReactNode> = {
  1: <Trophy className="w-4 h-4 text-accent-amber" />,
  2: <Medal className="w-4 h-4 text-gray-400" />,
  3: <Award className="w-4 h-4 text-accent-amber" />,
}

export function BenchmarkingPage() {
  const { datasetId } = useRouteParams()
  const { setActive, markCompleted } = useJourney()
  const res = useApi<any>(() => (datasetId ? benchmarks.list(datasetId) as any : null), [datasetId])
  const bench = (res.data || {}) as any
  const leaderboard: any[] = Array.isArray(bench?.leaderboard) ? bench.leaderboard : []
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [revealed, setRevealed] = useState(0)

  async function run() {
    if (!datasetId || busy) return
    setBusy(true)
    setRevealed(0)
    try {
      await benchmarks.run(datasetId, {})
      await res.refetch()
      setDone(true)
      markCompleted('benchmarking')
      setActive(datasetId)
      const nRows = (Array.isArray(res.data?.leaderboard) ? res.data.leaderboard : []).length
      let i = 0
      const t = setInterval(() => { i += 1; setRevealed(i); if (i >= nRows) clearInterval(t) }, 400)
    } catch { } finally { setBusy(false) }
  }

  useEffect(() => {
    if (leaderboard.length) {
      setDone(true)
      markCompleted('benchmarking')
      setActive(datasetId)
      setRevealed(leaderboard.length)
    }
  }, [leaderboard.length, datasetId])

  const maxScore = Math.max(0.0001, ...leaderboard.map((r: any) => n(r?.total_score) ?? 0))

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 13 · Benchmarking"
        title="Every model is now ranked against its peers"
        tagline="Percentile positions, per-metric scores and a clear winner."
        icon={<BarChart3 className="h-6 w-6 text-accent-amber" />}
        children={!leaderboard.length ? (
          <button onClick={run} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-accent-amber to-accent-rose px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(245,158,11,0.3)] disabled:opacity-60">
            <BarChart3 className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Run benchmark
          </button>
        ) : <DoneChip text="Benchmark complete" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Contenders" value={leaderboard.length} accent hint="models in the race" />
        <FlowStat label="Winner" value={n(leaderboard[0]?.total_score) ?? 0} decimals={2} suffix=" pts" hint={leaderboard[0]?.name} />
        <FlowStat label="Best R²" value={n(leaderboard[0]?.scores?.r2) ?? 0} decimals={3} />
        <FlowStat label="Methodology" value={0} hint={bench?.benchmark?.methodology || 'k-fold'} />
      </div>

      {!leaderboard.length && !res.loading && (
        <EmptyBox title="No benchmark results yet" hint="Run a benchmark to rank every model head-to-head." />
      )}

      {leaderboard.length > 0 && (
        <Reveal delay={0.1}>
          <div className="glass-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Leaderboard</p>
              <button
                onClick={() => exportLeaderboard(leaderboard)}
                className="rounded-button border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-primary-300 transition-colors hover:border-primary-500/40 hover:bg-primary-500/10"
                title="Download leaderboard as CSV"
              >
                export csv
              </button>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {leaderboard.slice(0, revealed).map((r: any, i: number) => {
                  const score = n(r?.total_score) ?? 0
                  const rank = r?.rank ?? i + 1
                  const scores: Record<string, number> = r?.scores && typeof r.scores === 'object' && !Array.isArray(r.scores)
                    ? r.scores : {}
                  return (
                <motion.div key={r?.model_id || i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.12, duration: 0.4 }}
                  className={clsx('flex items-center gap-4 px-5 py-4', i === 0 && winnerGlow())}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-button bg-white/[0.05]">
                    {RANK_ICON[rank] || <span className="font-mono text-xs text-gray-400">{rank}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-sm font-semibold text-gray-200 truncate">{r?.name || r?.model_id || `Model ${i + 1}`}</p>
                      {r?.algorithm && <span className="rounded-button bg-white/[0.05] px-2 py-0.5 text-xs font-mono text-gray-400">{r.algorithm}</span>}
                    </div>
                    <LiveBar value={(score / maxScore) * 100} max={100} className="mt-2"
                      barClassName={i === 0 ? 'bg-gradient-to-r from-amber-500 to-accent-amber' : 'bg-gradient-to-r from-primary-500 to-accent-cyan'} />
                  </div>
                  <div className="hidden shrink-0 gap-4 md:flex">
                    {Object.entries(scores).slice(0, 4).map(([k, v]) => (
                      <div key={k} className="text-center">
                        <p className="font-mono text-sm text-gray-200">{fmt(n(v), 3)}</p>
                        <p className="text-[11px] font-mono uppercase text-gray-400">{k}</p>
                      </div>
                    ))}
                  </div>
                  <span className="shrink-0 font-mono text-lg font-semibold text-accent-emerald">
                    {fmt(score, 1)}
                  </span>
                </motion.div>
                  )
                })}
              {revealed < leaderboard.length && <p className="px-5 py-2 text-xs font-mono text-primary-400 animate-pulse">ranking…</p>}
            </div>
          </div>
        </Reveal>
      )}

      {leaderboard.length > 0 && (
        <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl border border-accent-amber/30 px-5 py-4">
          <PulseDot color="bg-accent-amber" ping="bg-accent-amber/60" />
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-accent-amber">{leaderboard[0]?.name || 'Top model'}</span> wins —{' '}
            {fmt(n(leaderboard[0]?.scores?.r2), 3)} R² across the benchmark methodology.
          </p>
        </div>
      )}

      {done && leaderboard.length > 0 && (
        <AutoNext
          to={datasetId ? `/recommendations/${datasetId}` : '/library'}
          label="Benchmarks locked — ask the AI consultant what to do next"
        />
      )}

      <span onClick={() => { markCompleted('benchmarking'); setActive(datasetId) }} className="hidden" />
      </div>
    </div>
  )
}

function winnerGlow(): string {
  return 'relative bg-gradient-to-r from-amber-500/5 via-transparent to-transparent shadow-[inset_0_0_40px_rgba(245,158,11,0.06)]'
}

function exportLeaderboard(rows: any[]) {
  const metrics = new Set<string>()
  rows.forEach(r => {
    if (r?.scores && typeof r.scores === 'object' && !Array.isArray(r.scores)) {
      Object.keys(r.scores).forEach(k => metrics.add(k))
    }
  })
  const columns: string[] = ['rank', 'name', 'algorithm', 'total_score']
  const metricCols = Array.from(metrics).sort().map(k => `scores.${k}`)
  const flat = rows.map(r => {
    const row: any = { rank: r?.rank, name: r?.name || r?.model_id, algorithm: r?.algorithm, total_score: r?.total_score }
    metricCols.forEach(c => {
      const key = c.replace('scores.', '')
      row[c] = (r?.scores && typeof r.scores === 'object' ? r.scores[key] : undefined) ?? ''
    })
    return row
  })
  downloadCSV([...columns, ...metricCols], flat, 'ecomind-benchmark-leaderboard.csv')
}

export default BenchmarkingPage