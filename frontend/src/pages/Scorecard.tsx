import { Link } from '@tanstack/react-router'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { STAGE_SCORES, STAGE_SCORE_OVERALL, AnimatedNumber } from '../lib/kit'
import { Bar, Hero, ResultSummary, SectionLabel } from '../lib/stagekit'
import clsx from 'clsx'

/**
 * Presenter preparation aid — kept out of the product navigation on purpose.
 * It is the only place where the "what to say" notes live, so the working
 * screens stay free of self-assessment.
 */
export default function Scorecard() {
  const entries = Object.entries(STAGE_SCORES)
  const avg = entries.reduce((s, [, r]) => s + r.score, 0) / (entries.length || 1)

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Preparation aid · not part of the workspace</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-t-hi sm:text-2xl">Presentability Scorecard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-t-lo">
            Every stage rated 0–10, with one plain-English line about why it earns the mark and one line
            worth saying out loud when an examiner asks about it.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-t-lo">
          <ShieldCheck className="h-3 w-3 text-accent-emerald" /> private
        </span>
      </div>

      <Hero>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2.5">
          <SectionLabel>Overall standard</SectionLabel>
          <span className="font-mono text-[10px] text-t-lo">{entries.length} stages rated</span>
        </div>
        <div className="grid items-center gap-6 p-6 sm:grid-cols-[220px_1fr]">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-semibold tracking-tight text-t-hi">
                <AnimatedNumber value={STAGE_SCORE_OVERALL.score} decimals={1} />
              </span>
              <span className="text-lg text-t-lo">/10</span>
            </div>
            <Bar value={STAGE_SCORE_OVERALL.score * 10} className="mt-3" />
            <p className="mt-2 text-[11px] text-t-lo">
              Average across all stages: {avg.toFixed(1)}/10
            </p>
          </div>
          <div>
            <p className="text-[15px] font-medium leading-7 text-t-hi">{STAGE_SCORE_OVERALL.why}</p>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-t-mid">{STAGE_SCORE_OVERALL.strong}</p>
          </div>
        </div>
      </Hero>

      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([label, r]) => (
          <div key={label} className="flex flex-col gap-3 rounded-card border border-border bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-t-hi">{label}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-t-lo">{r.why}</p>
              </div>
              <span className={clsx(
                'shrink-0 font-mono text-lg font-semibold',
                r.score >= 9 ? 'text-accent-emerald' : r.score >= 8 ? 'text-accent-amber' : 'text-accent-rose',
              )}>
                {r.score}<span className="text-[11px] text-t-lo">/10</span>
              </span>
            </div>
            <Bar
              value={r.score * 10}
              tone={r.score >= 9 ? 'emerald' : r.score >= 8 ? 'amber' : 'rose'}
            />
            <p className="rounded-card border border-border bg-panel2 px-3 py-2 text-[12px] leading-5 text-t-mid">
              <span className="font-semibold text-t-lo">Say this · </span>{r.strong}
            </p>
          </div>
        ))}
      </div>

      <ResultSummary
        verdict="Walk the pipeline in one sitting — every stage is interactive and backed by real backend data."
        right={
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-button bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
          >
            Open the workspace <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
    </div>
  )
}
