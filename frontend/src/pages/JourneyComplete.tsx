import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2, Download, Home, PartyPopper, Archive } from 'lucide-react'
import clsx from 'clsx'
import { ai, models, recommendations, anomalies, reports } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useJourney, WORKFLOW } from '../lib/journey'
import { AnimatedNumber, Button, FlowStat, Gauge, PulseDot, Reveal, DoneChip } from '../lib/kit'

/**
 * Final overall summary after an automated run finishes.
 * Aggregates trust gate, best model, savings, anomalies and key findings.
 */
export default function JourneyComplete() {
  const navigate = useNavigate()
  const { datasetId, runId, stageStatuses } = useJourney()
  const dsId = datasetId ?? undefined

const { data: gate } = useApi(
    () => (dsId ? ai.confidence(dsId) : Promise.resolve(null)),
    [dsId],
  )
  const { data: modelsData } = useApi(
    () => (dsId ? models.list() : Promise.resolve(null)),
    [dsId],
  )
  const { data: recipes } = useApi(
    () => (dsId ? recommendations.list(dsId) : Promise.resolve(null)),
    [dsId],
  )
  const { data: anoms } = useApi(
    () => (dsId ? anomalies.list(dsId, 200) : Promise.resolve(null)),
    [dsId],
  )
  const { data: exec } = useApi(
    () => (dsId ? ai.executive(dsId) : Promise.resolve(null)),
    [dsId],
  )
  const { data: reportsData } = useApi(() => reports.list(), [])

  const g: any = gate?.gate || gate || {}
  const trustPct = g?.trust_score ?? 0
  const verdict = g?.verdict ?? (trustPct >= 60 ? 'high_trust' : 'low_trust')
  const trustColor = trustPct >= 80 ? '#10B981' : trustPct >= 60 ? '#F59E0B' : '#F43F5E'

  const list = Array.isArray(modelsData) ? modelsData : modelsData?.models || []
  const ranked = useMemo(
    () => list
      .filter((m: any) => m && m.id)
      .sort((a: any, b: any) => (b?.metrics?.r2 ?? 0) - (a?.metrics?.r2 ?? 0)),
    [list],
  )
  const best = ranked[0]
  const r2 = best?.metrics?.r2

  const recs = Array.isArray(recipes) ? recipes : recipes?.recommendations || []
  const totalSavings = recs.reduce((a: number, r: any) => a + (Number(r?.estimated_savings_kwh) || 0), 0)
  const savingsPct = recs.reduce((a: number, r: any) => a + (Number(r?.savings_percent) || 0), 0)
  const topRec = recs[0]

  const anomList = Array.isArray(anoms) ? anoms : anoms?.anomalies || []
  const bySeverity = (sev: string) => anomList.filter((a: any) => a?.severity === sev).length

  const summary = exec?.summary || exec || {}
  const findings = Array.isArray(summary?.key_findings)
    ? summary.key_findings
    : Array.isArray(summary?.findings)
      ? summary.findings
      : []

  const reportsList = Array.isArray(reportsData) ? reportsData : reportsData?.reports || []
  const latestReport = reportsList[reportsList.length - 1]

const doneCount = Object.values(stageStatuses).filter(s => s === 'done').length
  const isHigh = trustPct >= 60

  const [generating, setGenerating] = useState(false)

  const generateReport = async () => {
    if (!dsId || generating) return
    setGenerating(true)
    try {
      const r: any = await reports.generate({ dataset_id: dsId, format: 'html' })
      const rep = r?.report || r?.reports?.[0]
      if (rep) await reports.download(rep.id, rep.file_name || rep.name || 'ecomind-report.html')
    } catch {
      /* report — generation failed, stay on page */
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <Reveal>
        <div className="glass-panel relative overflow-hidden px-6 py-8">
          <div className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: 'radial-gradient(560px 220px at 18% 0%, rgba(76,95,213,0.16), transparent 60%), radial-gradient(520px 200px at 85% 100%, rgba(52,211,153,0.12), transparent 60%)' }} />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="flex items-center gap-2">
                <PartyPopper className="h-5 w-5 text-accent-amber" />
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-accent-amber">run complete</span>
              </span>
              <h1 className="mt-2 font-display text-3xl font-semibold text-gray-50">Journey complete.</h1>
              <p className="mt-1 max-w-xl text-sm text-gray-400">
                All 15 stages executed and recorded. Here is the whole analysis in one screen — trust,
                winning model, savings, anomalies and the executive verdict.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <DoneChip text={`${doneCount}/15 stages done`} />
                <DoneChip text={runId ? `run ${String(runId).slice(0, 8)}` : 'final results'} />
                {isHigh ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-accent-emerald/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-accent-emerald">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {verdict}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full border border-accent-rose/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-accent-rose">
                    {verdict}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center">
              <Gauge value={trustPct / 100} size={170} color={trustColor} threshold={0.6}
                label="Final Trust" sublabel={`${trustPct.toFixed(1)}%`} />
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Reveal delay={0.06}>
<FlowStat label="Best Model · R²" value={r2 ?? 0} decimals={r2 != null ? 4 : undefined}
            hint={best?.algorithm ?? 'not trained'}
            accent />
        </Reveal>
        <Reveal delay={0.09}>
          <FlowStat label="Estimated Savings" value={totalSavings} decimals={1} suffix=" kWh"
            hint={savingsPct ? `${savingsPct.toFixed(1)}% below baseline` : topRec?.savings_percent ? `${Number(topRec.savings_percent).toFixed(1)}% below baseline` : 'recommendation engine'} />
        </Reveal>
        <Reveal delay={0.12}>
          <FlowStat label="Anomalies Found" value={bySeverity('critical') + bySeverity('high')} suffix=" critical / high"
            hint={`${bySeverity('warning')} warning · ${bySeverity('info')} informational`} />
        </Reveal>
        <Reveal delay={0.15}>
          <FlowStat label="Stages Executed" value={doneCount} suffix={` / ${WORKFLOW.length}`}
            hint="explainable · auto-recorded" accent />
        </Reveal>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal delay={0.1}>
          <div className="glass-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <PulseDot color="bg-accent-emerald" />
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-gray-400">winner · best model</p>
            </div>
            {best ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-semibold text-accent-emerald">{best.algorithm ?? 'model'}</p>
                  <span className="rounded-full border border-accent-emerald/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent-emerald">winner</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ScoreCell label="R²" value={r2} digits={4} />
                  <ScoreCell label="RMSE" value={best?.metrics?.rmse} digits={4} />
                  <ScoreCell label="MAPE" value={best?.metrics?.mape} digits={2} suffix="%" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No model recorded for this dataset yet.</p>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="glass-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <PulseDot color="bg-accent-gold" />
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-gray-400">recommendation engine · savings</p>
            </div>
            {topRec ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base font-semibold text-gray-100">{topRec.title ?? topRec.category ?? 'Action'}</p>
                    <p className="mt-0.5 text-xs text-gray-400">implementation · {topRec.implementation_difficulty ?? 'moderate · configuration + validation'}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-accent-gold/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent-gold">
                    {Number(topRec.savings_percent || 0).toFixed(1)}% saving
                  </span>
                </div>
                <p className="text-sm text-gray-300">{topRec.expected_impact || topRec.description || ''}</p>
                <p className="text-xs text-gray-500">{recs.length} recommendations ranked for this portfolio · {totalSavings.toFixed(1)} kWh total potential</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No recommendations generated yet.</p>
            )}
          </div>
        </Reveal>
      </div>

      {findings.length > 0 && (
        <Reveal delay={0.16}>
          <div className="glass-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <PulseDot color="bg-accent-cyan" />
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-gray-400">executive · key findings</p>
            </div>
            <ul className="space-y-2">
              {findings.slice(0, 4).map((f: any, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-cyan" />
                  {typeof f === 'string' ? f : f?.text ?? f?.finding ?? JSON.stringify(f)}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.2}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-glass border border-white/[0.06] bg-black/20 px-5 py-4">
          <p className="text-sm text-gray-400">
            <AnimatedNumber value={doneCount} className="text-gray-200" /> of {WORKFLOW.length} stages recorded on this run —
            every decision is in the audit trail.
          </p>
<div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" gradient="emerald"
              onClick={generateReport}>
              <Download className="mr-1.5 h-4 w-4" /> {generating ? 'Generating…' : 'Generate audit report'}
            </Button>
            {latestReport?.id && (
              <Button variant="outline" gradient="gold"
                onClick={() => navigate({ to: '/reports' } as any)}>
                <Archive className="mr-1.5 h-4 w-4" /> Download reports
              </Button>
            )}
            <Button variant="outline"
              onClick={() => navigate({ to: '/dashboard' } as any)}>
              <Home className="mr-1.5 h-4 w-4" /> Return to dashboard
            </Button>
          </div>
        </div>
      </Reveal>
    </div>
  )
}

function ScoreCell({ label, value, digits, suffix = '' }: { label: string; value?: number; digits: number; suffix?: string }) {
  return (
    <div className="rounded-button border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-gray-200">
        {value != null ? value.toFixed(digits) + suffix : '—'}
      </p>
    </div>
  )
}
