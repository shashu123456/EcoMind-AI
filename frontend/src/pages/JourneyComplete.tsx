import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Archive, Download, Home } from 'lucide-react'
import { ai, models, recommendations, anomalies, reports } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useJourney, WORKFLOW } from '../lib/journey'
import { Button, Gauge } from '../lib/kit'
import { Advanced, Hero, QualityRating, ResultSummary, SectionLabel } from '../lib/stagekit'

/**
 * The close of the journey.
 * One hero: the final verdict and the trust score behind it. Everything that
 * supports the decision — the winning model, the findings, the top action —
 * sits behind Advanced. The page leaves the reader with a clear next step.
 */
export default function JourneyComplete() {
  const navigate = useNavigate()
  const { datasetId, runId, stageStatuses } = useJourney()
  const dsId = datasetId ?? undefined

  const { data: gate } = useApi(() => (dsId ? ai.confidence(dsId) : Promise.resolve(null)), [dsId])
  const { data: modelsData } = useApi(() => (dsId ? models.list() : Promise.resolve(null)), [dsId])
  const { data: recipes } = useApi(() => (dsId ? recommendations.list(dsId) : Promise.resolve(null)), [dsId])
  const { data: anoms } = useApi(() => (dsId ? anomalies.list(dsId, 200) : Promise.resolve(null)), [dsId])
  const { data: exec } = useApi(() => (dsId ? ai.executive(dsId) : Promise.resolve(null)), [dsId])
  const { data: reportsData } = useApi(() => reports.list(), [])

  const g: any = gate?.gate || gate || {}
  const trustPct = Number(g?.trust_score ?? 0)
  const verdictWord = String(g?.verdict || (trustPct >= 60 ? 'trust established' : 'review advised')).replace(/_/g, ' ')
  const trustColor = trustPct >= 80 ? 'var(--color-accent-emerald)' : trustPct >= 60 ? 'var(--color-accent-amber)' : 'var(--color-accent-rose)'

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
  const topRec = recs[0]

  const anomList = Array.isArray(anoms) ? anoms : anoms?.anomalies || []
  const bySeverity = (sev: string) => anomList.filter((a: any) => a?.severity === sev).length
  const seriousAnomalies = bySeverity('critical') + bySeverity('high')

  const summary = exec?.summary || exec || {}
  const findings = Array.isArray(summary?.key_findings)
    ? summary.key_findings
    : Array.isArray(summary?.findings)
      ? summary.findings
      : []

  const reportsList = Array.isArray(reportsData) ? reportsData : reportsData?.reports || []
  const latestReport = reportsList[reportsList.length - 1]

  const doneCount = Object.values(stageStatuses).filter(s => s === 'done').length

  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  const generateReport = async () => {
    if (!dsId || generating) return
    setGenerating(true)
    try {
      const r: any = await reports.generate({ dataset_id: dsId, format: 'html' })
      const rep = r?.report || r?.reports?.[0]
      if (rep) {
        setGenerated(true)
        await reports.download(rep.id, rep.file_name || rep.name || 'ecomind-report.html')
      }
    } catch {
      /* report generation failed — the reader can retry from Reports */
    } finally {
      setGenerating(false)
    }
  }

  /* One plain-language verdict, assembled only from what really exists. */
  const verdictParts: string[] = []
  verdictParts.push(`EcoMind completed the full ${WORKFLOW.length}-stage analysis`)
  if (r2 != null) verdictParts.push(`the selected AI model explains ${(Number(r2) * 100).toFixed(1)}% of the variation in energy use`)
  if (totalSavings > 0) verdictParts.push(`${Math.round(totalSavings).toLocaleString()} kWh of savings were identified`)
  if (seriousAnomalies > 0) verdictParts.push(`${seriousAnomalies} high-severity anomalies need attention`)
  const verdict = verdictParts.length > 1
    ? `${verdictParts[0]} — ${verdictParts.slice(1).join(', ')}. Every step is recorded, explainable and ready to report.`
    : 'The analysis run is recorded end to end. Open any stage to inspect its evidence, or generate the audit report.'

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6">
      {/* Level 2 — the one hero: the final verdict and its trust score */}
      <Hero>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2.5">
          <SectionLabel>Final verdict</SectionLabel>
          <span className="font-mono text-[10px] text-t-lo">
            {doneCount} of {WORKFLOW.length} stages recorded{runId ? ` · run ${String(runId).slice(0, 8)}` : ''}
          </span>
        </div>
        <div className="grid items-center gap-6 p-6 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-t-hi sm:text-3xl">The analysis is complete.</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-t-mid">{verdict}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <QualityRating score={trustPct} label="AI trust" />
              <span className="text-[13px] font-medium capitalize text-t-mid">{verdictWord}</span>
            </div>
          </div>
          <div className="flex shrink-0 justify-center">
            <Gauge
              value={Math.max(0, Math.min(trustPct, 100)) / 100}
              size={168}
              color={trustColor}
              threshold={0.6}
              label="Final AI trust"
              sublabel={`${trustPct.toFixed(1)}%`}
            />
          </div>
        </div>
      </Hero>

      {/* Level 3 — the outcome and the exits */}
      <ResultSummary
        verdict={
          latestReport
            ? `An audit-ready report already exists for this dataset. Generate a fresh one to capture this run, or open the archive.`
            : `Nothing to write by hand — the report is generated from this run's real evidence, stage by stage.`
        }
        facts={[
          { label: 'Savings found', value: totalSavings > 0 ? `${Math.round(totalSavings).toLocaleString()} kWh` : '—' },
          { label: 'Severe anomalies', value: seriousAnomalies },
          { label: 'Stages', value: `${doneCount}/${WORKFLOW.length}` },
        ]}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => navigate({ to: '/reports' } as any)}>
              <Archive className="h-3.5 w-3.5" /> Open reports
            </Button>
            <Button size="sm" variant="primary" onClick={generateReport} loading={generating}>
              {!generating && <Download className="h-3.5 w-3.5" />}
              {generating ? 'Generating…' : generated ? 'Regenerate report' : 'Generate audit report'}
            </Button>
          </div>
        }
      />

      {/* Level 4 — the evidence behind the verdict, collapsed */}
      <Advanced label="Winning model" hint={best ? `${best.algorithm ?? 'model'} · R² ${r2 != null ? Number(r2).toFixed(4) : '—'}` : 'no model recorded'}>
        {best ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { k: 'Algorithm', v: best.algorithm ?? best.name ?? '—', mono: false },
                { k: 'R²', v: r2 != null ? Number(r2).toFixed(4) : '—', mono: true },
                { k: 'RMSE', v: best?.metrics?.rmse != null ? Number(best.metrics.rmse).toFixed(4) : '—', mono: true },
                { k: 'MAPE', v: best?.metrics?.mape != null ? `${Number(best.metrics.mape).toFixed(2)}%` : '—', mono: true },
              ].map(({ k, v, mono }) => (
                <div key={k} className="rounded-button border border-border bg-panel px-3.5 py-2.5">
                  <SectionLabel>{k}</SectionLabel>
                  <div className={`mt-1 truncate text-[15px] font-semibold text-t-hi ${mono ? 'font-mono' : ''}`}>{v}</div>
                </div>
              ))}
            </div>
            {ranked.length > 1 && (
              <div>
                <SectionLabel>Every model trained on this dataset</SectionLabel>
                <ol className="mt-2 space-y-1">
                  {ranked.map((m: any, i: number) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 text-[12px] last:border-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[10px] text-t-lo">{String(i + 1).padStart(2, '0')}</span>
                        <span className="truncate text-t-hi">{m.algorithm ?? m.name ?? 'model'}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-t-mid">
                        R² {m?.metrics?.r2 != null ? Number(m.metrics.r2).toFixed(4) : '—'}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-t-lo">No model was recorded for this dataset — run the prediction stage to create one.</p>
        )}
      </Advanced>

      {findings.length > 0 && (
        <Advanced label="Key findings" hint={`${findings.length} from the executive briefing`}>
          <ul className="space-y-2">
            {findings.slice(0, 6).map((f: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-6 text-t-mid">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-500" />
                {typeof f === 'string' ? f : f?.text ?? f?.finding ?? String(f)}
              </li>
            ))}
          </ul>
        </Advanced>
      )}

      {topRec && (
        <Advanced label="Highest-impact action" hint={`${recs.length} ranked recommendation${recs.length === 1 ? '' : 's'}`}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[14px] font-semibold text-t-hi">{topRec.title ?? topRec.category ?? 'Action'}</p>
              {topRec.savings_percent != null && (
                <span className="rounded-full border border-border bg-panel2 px-2.5 py-0.5 text-[11px] font-semibold text-t-mid">
                  {Number(topRec.savings_percent).toFixed(1)}% saving
                </span>
              )}
            </div>
            <p className="text-[13px] leading-6 text-t-mid">{topRec.expected_impact || topRec.description || ''}</p>
            <p className="text-[11px] text-t-lo">
              {recs.length} actions ranked for this portfolio · {totalSavings.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh total potential
            </p>
          </div>
        </Advanced>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-5 py-3.5">
        <p className="text-[13px] text-t-lo">
          Every stage of this run is preserved in the audit trail.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => navigate({ to: '/history' } as any)}>
            Audit trail
          </Button>
          <Button size="sm" onClick={() => navigate({ to: '/dashboard' } as any)}>
            <Home className="h-3.5 w-3.5" /> Back to overview <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
