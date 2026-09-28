import { STAGE_SCORES, STAGE_SCORE_OVERALL, AnimatedNumber, LiveBar } from '../lib/kit'
import { EcoMindLockup } from '../lib/logo'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'

export default function Scorecard() {
  const entries = Object.entries(STAGE_SCORES)
  const avg = entries.reduce((s, [, r]) => s + r.score, 0) / (entries.length || 1)
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 lg:p-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-500">ecosystem audit · presentability</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-gray-50">Presentability Scorecard</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Every pipeline stage is rated 0–10: how strong it is, why it earns the mark, and the exact thing to say when an examiner or committee member asks about it.
          </p>
        </div>
        <EcoMindLockup size={34} />
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="glass-panel flex flex-col items-center justify-center gap-2 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">overall</p>
          <p className="font-display text-6xl font-bold tracking-tight text-gray-50">
            <AnimatedNumber value={STAGE_SCORE_OVERALL.score} decimals={1} suffix="/10" />
          </p>
          <LiveBar value={STAGE_SCORE_OVERALL.score * 10} className="max-w-[180px]" barClassName="bg-primary-500" />
          <p className="mt-2 text-center text-xs leading-5 text-gray-500">{STAGE_SCORE_OVERALL.strong}</p>
        </div>
        <div className="glass-panel flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">average</p>
          <p className="font-display text-4xl font-bold tracking-tight text-primary-300">
            <AnimatedNumber value={avg} decimals={1} suffix="/10" />
          </p>
          <p className="max-w-lg text-xs leading-5 text-gray-400">{STAGE_SCORE_OVERALL.why}</p>
          <p className="mt-1 max-w-lg text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
            the arc to tell · intake → repair → features → models → trust → proof → decision
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([label, r]) => (
          <div key={label} className="glass-card flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold tracking-tight text-gray-100">{label}</p>
                <p className="mt-0.5 text-xs leading-4 text-gray-500">{r.why}</p>
              </div>
              <span className={clsx('shrink-0 font-display text-2xl font-bold tracking-tight',
                r.score >= 9 ? 'text-accent-emerald' : r.score >= 8 ? 'text-accent-gold' : 'text-accent-rose')}>
                {r.score}<span className="text-sm text-gray-600">/10</span>
              </span>
            </div>
            <LiveBar value={r.score * 10} barClassName={r.score >= 9
              ? 'bg-accent-emerald'
              : r.score >= 8
                ? 'bg-accent-amber'
                : 'bg-accent-rose'} />
            <p className="rounded-card border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-[11px] leading-4 text-primary-200/90">
              <span className="text-gray-600">say this · </span>{r.strong}
            </p>
          </div>
        ))}
      </div>

      <div className="glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="text-sm text-gray-400">
          Walk the whole pipeline in one sitting — every stage is interactive and backed by real data.
        </p>
        <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-button bg-primary-500 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white transition-all hover:brightness-110">
          open the demo
        </Link>
      </div>
    </div>
  )
}