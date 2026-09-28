import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, CheckCircle2, RotateCw, ShieldCheck, XCircle } from 'lucide-react'
import { ai, workflows, type ConfidenceResponse, type Gate } from '../lib/api'
import { useApi } from '../lib/hooks'
import { ErrorBox, fmt, n, useRouteParams } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { AutoNext, Button, DoneChip } from '../lib/kit'
import {
  Bar,
  EmptyState,
  LoadingState,
  MetricPill,
  Panel,
  StageHeader,
  Stat,
  StatusChip,
  StoryFlow,
} from '../lib/stagekit'
import { beatForStage, storyForStage } from '../lib/story'
import clsx from 'clsx'

/* ── Stage identity ─────────────────────────────────────────────── */
const STAGE = 'confidence_gate'
const BEAT = beatForStage(STAGE)
const STORY = storyForStage(STAGE)

/* The API sends verdict as a string. The backend emits
   high_trust / moderate_trust / low_trust (see app.workflow.stages.trust_verdict),
   and older payloads used moderate / low — so the band is resolved from the
   string first and falls back to the score thresholds (80 / 60). */
type Band = 'pass' | 'review' | 'fail'

function bandOf(verdict: string | null | undefined, score: number): Band {
  const v = (verdict || '').toLowerCase().trim()
  if (v.includes('high') || v === 'pass' || v === 'passed' || v === 'trusted') return 'pass'
  if (v.includes('moderate') || v.includes('medium') || v === 'review') return 'review'
  if (v.includes('low') || v === 'fail' || v === 'failed' || v === 'rejected') return 'fail'
  return score >= 80 ? 'pass' : score >= 60 ? 'review' : 'fail'
}

const BAND: Record<Band, {
  label: string
  Icon: typeof CheckCircle2
  chip: 'ok' | 'warn'
  accent: 'emerald' | 'amber' | 'rose'
  border: string
  wash: string
  advice: string
}> = {
  pass: {
    label: 'Trusted — decision released',
    Icon: CheckCircle2, chip: 'ok', accent: 'emerald',
    border: 'border-accent-emerald/30', wash: 'bg-accent-emerald/10',
    advice: 'Every signal cleared its threshold. The model may act on this dataset.',
  },
  review: {
    label: 'Trusted with caveats',
    Icon: AlertTriangle, chip: 'warn', accent: 'amber',
    border: 'border-accent-amber/30', wash: 'bg-accent-amber/10',
    advice: 'At least one signal is soft or missing. Read the breakdown before continuing.',
  },
  fail: {
    label: 'Not trusted — hold the decision',
    Icon: XCircle, chip: 'warn', accent: 'rose',
    border: 'border-accent-rose/30', wash: 'bg-accent-rose/10',
    advice: 'Trust is below the 60-point decision threshold. Strengthen the weakest signal first.',
  },
}

const FACTOR_META: Record<string, { label: string; hint: string }> = {
  prediction_confidence: { label: 'Prediction confidence', hint: 'confidence carried by the most recent forecast run' },
  dq_score: { label: 'Data quality', hint: 'overall score from the Data Quality stage' },
  model_relevance: { label: 'Model reliability', hint: 'R² of the active model, scaled to 0–100' },
  shap_stability: { label: 'SHAP stability', hint: 'consistency of feature attributions' },
}
const FACTOR_ORDER = ['prediction_confidence', 'dq_score', 'model_relevance', 'shap_stability']

function humanize(key: string) {
  return key.replace(/_/g, ' ')
}

function toneOf(value: number | null) {
  if (value === null) return 'idle' as const
  return value >= 75 ? ('emerald' as const) : value >= 50 ? ('amber' as const) : ('rose' as const)
}

function barTone(value: number) {
  return value >= 75 ? 'emerald' as const : value >= 50 ? 'amber' as const : 'rose' as const
}

/* gate_payload() adds model_id, which the frontend Gate type omits. */
type GateView = Gate & { model_id?: string | null }

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

/* Pure-SVG radial trust score. The stroke sweeps once on arrival. */
function TrustDonut({ value, tone }: { value: number; tone: 'emerald' | 'amber' | 'rose' | 'idle' }) {
  const SIZE = 168
  const STROKE = 13
  const R = (SIZE - STROKE) / 2 - 4
  const C = 2 * Math.PI * R
  const cx = SIZE / 2
  const cy = SIZE / 2
  const frac = Math.max(0, Math.min(1, value / 100))
  const stroke = tone === 'emerald' ? 'var(--color-accent-emerald)' : tone === 'amber' ? 'var(--color-accent-amber)' : tone === 'rose' ? 'var(--color-accent-rose)' : 'var(--t-lo)'
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0" role="img" aria-label={`Trust score ${fmt(value, 1)} of 100`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--panel3, #E4E8F0)" strokeWidth={STROKE} />
      <motion.circle
        cx={cx} cy={cy} r={R} fill="none" stroke={stroke} strokeWidth={STROKE} strokeLinecap="round"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - frac) }}
        transition={{ duration: 1.1, ease: EASE }}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* backend decision thresholds: 60 (review) and 80 (pass) */}
      {[60, 80].map(t => {
        const a = ((-90 + (t / 100) * 360) * Math.PI) / 180
        const ri = R - STROKE / 2 - 3
        const ro = R + STROKE / 2 + 3
        return (
          <line
            key={t}
            x1={cx + ri * Math.cos(a)} y1={cy + ri * Math.sin(a)}
            x2={cx + ro * Math.cos(a)} y2={cy + ro * Math.sin(a)}
            stroke="var(--color-border-hover, #B6BFCF)" strokeWidth={2} strokeLinecap="round"
          />
        )
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-t-hi font-mono" style={{ fontSize: 34, fontWeight: 600 }}>
        {fmt(value, 1)}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" className="fill-t-lo font-mono" style={{ fontSize: 11 }}>% of 100</text>
    </svg>
  )
}

export function ConfidenceGatePage() {
  const { runId } = useRouteParams()
  const { setActive, markCompleted, datasetId: ctxDs, modelId } = useJourney()
  const navigate = useNavigate()
  const breakdownRef = useRef<HTMLDivElement | null>(null)

  const run = useApi<any>(() => (runId ? (workflows.get(runId) as any) : Promise.resolve(null)), [runId])
  const datasetId = (run.data?.run?.dataset_id as string) || ctxDs || ''

  const res = useApi<ConfidenceResponse | null>(
    () => (datasetId ? ai.confidence(datasetId) : Promise.resolve(null)),
    [datasetId],
  )
  const gate = (res.data?.gate ?? null) as GateView | null

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const trustPct = n(gate?.trust_score) ?? 0
  const band = bandOf(gate?.verdict, trustPct)
  const style = BAND[band]
  const VerdictIcon = style.Icon

  const reasoning = (gate?.reasoning ?? null) as
    | { explanation?: string; weights?: Record<string, number>; missing_factors?: string[] }
    | null
  const weights = useMemo<Record<string, number>>(() => {
    const w = reasoning?.weights
    return w && typeof w === 'object' ? w : {}
  }, [reasoning])
  const missing = useMemo<string[]>(
    () => (Array.isArray(reasoning?.missing_factors) ? (reasoning?.missing_factors as string[]) : []),
    [reasoning],
  )

  /* factors is a numeric map on the wire; non-numeric entries (the backend
     also parks model_id in there) are ignored. */
  const factors = useMemo(() => {
    const raw = (gate?.factors ?? {}) as Record<string, unknown>
    const numeric = Object.keys(raw).filter(k => n(raw[k]) !== null)
    const ordered = [...FACTOR_ORDER.filter(k => numeric.includes(k)), ...numeric.filter(k => !FACTOR_ORDER.includes(k))]
    return ordered.map(k => {
      const v = n(raw[k]) as number
      const w = n(weights[k])
      return { key: k, label: FACTOR_META[k]?.label ?? humanize(k), hint: FACTOR_META[k]?.hint ?? '', value: v, weight: w }
    })
  }, [gate, weights])

  const signal = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const f of factors) map[f.key] = f.value
    const seeded: Record<string, number | null> = {
      prediction_confidence: map.prediction_confidence ?? n(gate?.prediction_confidence),
      dq_score: map.dq_score ?? n(gate?.dq_score),
      model_relevance: map.model_relevance ?? n(gate?.model_relevance),
      shap_stability: map.shap_stability ?? n(gate?.shap_stability),
    }
    return seeded
  }, [factors, gate])

  /* trust_score = Σ weight × signal, published by reasoning.weights */
  const contribution = useMemo(
    () => factors.reduce((sum, f) => sum + (f.weight === null ? 0 : f.weight * f.value), 0),
    [factors],
  )
  const fullyWeighted = factors.length > 0 && factors.every(f => f.weight !== null)

  const modelTarget = (gate?.model_id || modelId || '') as string
  const shapTarget = modelTarget ? `/shap/${modelTarget}` : '/library'

  /* Workflow wiring: a landed gate means the stage is done. */
  useEffect(() => {
    if (!gate) return
    setActive(datasetId, runId || null, gate.model_id || undefined)
    if (runId) markCompleted(STAGE)
  }, [gate, datasetId, runId, setActive, markCompleted])

  async function evaluate() {
    if (!datasetId || busy) return
    setBusy(true)
    setActionError(null)
    try {
      await ai.evaluate(datasetId, {})
      await res.refetch()
    } catch (e: any) {
      setActionError(e?.message || 'Re-evaluation failed')
    } finally {
      setBusy(false)
    }
  }

  const continueJourney = () => {
    markCompleted(STAGE)
    navigate({ to: shapTarget })
  }

  const openReview = () => {
    setReviewing(true)
    breakdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => setReviewing(false), 2600)
  }

  const stat = (label: string, key: string) => {
    const v = signal[key]
    const t = toneOf(v)
    return <Stat key={key} label={label} value={v === null ? '—' : `${fmt(v, 1)}%`} mono hint={FACTOR_META[key]?.hint} accent={t === 'idle' ? undefined : t} />
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      <StageHeader
        beat={BEAT.beat}
        chapter={BEAT.chapter}
        title="Trust, earned before a decision is allowed"
        tagline={`${BEAT.title} — ${STORY.happened}`}
        icon={<ShieldCheck className="h-5 w-5" />}
        right={gate ? <DoneChip text="Trust assessed" /> : <StatusChip status="idle">not evaluated</StatusChip>}
      />

      {res.error && <ErrorBox message={res.error} onRetry={res.refetch} />}
      {actionError && (
        <div className="flex items-center gap-2 rounded-card border border-accent-rose/30 bg-accent-rose/10 px-3.5 py-2.5 text-xs text-accent-rose">
          <XCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{actionError}</span>
          <Button size="xs" variant="outline" onClick={() => void evaluate()} loading={busy}>Retry</Button>
        </div>
      )}

      {res.loading && !gate && <LoadingState label="Loading the trust gate…" />}

      {!gate && !res.loading && (
        <EmptyState
          title="No trust evaluation on this dataset yet"
          hint={`${STORY.produced}. ${STORY.next}`}
          action={
            datasetId ? (
              <Button onClick={() => void evaluate()} loading={busy} size="md" gradient="emerald">
                <RotateCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Evaluate trust gate
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate({ to: '/library' })}>Pick a dataset</Button>
            )
          }
        />
      )}

      {gate && (
        <>
          {/* 1 · Executive verdict banner */}
          <Panel
            className={clsx(style.border, style.wash, 'shadow-[0_1px_2px_rgba(20,28,48,.05),0_8px_24px_rgba(20,28,48,.07)]')}
            title="Executive verdict"
            right={
              <div className="flex items-center gap-2">
                <StatusChip status={busy ? 'running' : style.chip}>
                  {busy ? 're-evaluating' : band === 'pass' ? 'trusted' : band === 'review' ? 'review' : 'blocked'}
                </StatusChip>
                <Button size="sm" variant="secondary" onClick={() => void evaluate()} loading={busy}>
                  {!busy && <RotateCw className="h-3.5 w-3.5" />} Re-evaluate
                </Button>
              </div>
            }
          >
            <div className="flex min-w-0 items-start gap-3.5">
              <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-button border bg-panel',
                style.border, style.accent === 'emerald' ? 'text-accent-emerald' : style.accent === 'amber' ? 'text-accent-amber' : 'text-accent-rose')}>
                <VerdictIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={clsx('text-lg font-semibold tracking-tight',
                  style.accent === 'emerald' ? 'text-accent-emerald' : style.accent === 'amber' ? 'text-accent-amber' : 'text-accent-rose')}>
                  {style.label}
                </p>
                {reasoning?.explanation && <p className="mt-0.5 text-sm text-t-mid">{reasoning.explanation}</p>}
                <p className="mt-1 text-xs text-t-lo">{style.advice}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <MetricPill label="trust" value={`${fmt(trustPct, 1)}/100`} />
                  <MetricPill label="verdict" value={gate.verdict ?? '—'} />
                  {gate.workflow_run_id && <MetricPill label="run" value={String(gate.workflow_run_id).slice(0, 8)} />}
                  <span className="font-mono text-[11px] text-t-lo">{gate.created_at ? new Date(gate.created_at).toLocaleString() : 'no timestamp'}</span>
                </div>
              </div>
            </div>
          </Panel>

          {/* 2 · Dominant trust score + the four signals */}
          <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Panel title="Trust score" flush>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4">
                <TrustDonut value={trustPct} tone={toneOf(trustPct)} />
                <p className="text-center text-[11px] leading-snug text-t-lo">
                  Ticks mark the backend thresholds — 60 to review, 80 to pass.
                </p>
                <div className="mt-1 w-full rounded-button border border-border bg-panel-2 px-3 py-2 text-center">
                  <p className="font-mono text-[11px] text-t-mid">
                    Σ of listed contributions <span className="font-semibold text-t-hi">{fmt(contribution, 1)}</span>
                    {fullyWeighted ? ' pts' : ' pts (partial)'}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-t-lo">gate reports {fmt(trustPct, 1)} pts</p>
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-2 gap-3">
              {stat('Prediction confidence', 'prediction_confidence')}
              {stat('Data quality', 'dq_score')}
              {stat('Model reliability', 'model_relevance')}
              {stat('SHAP stability', 'shap_stability')}
            </div>
          </div>

          {/* 3 · Confidence breakdown */}
          <div ref={breakdownRef}>
            <Panel
              title="Confidence breakdown"
              className={clsx('transition-colors', reviewing && 'border-accent-amber/50')}
              right={
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-t-lo">
                  {factors.length} of 4 signals
                </span>
              }
            >
              <div className="space-y-3">
                {factors.map((f) => (
                  <div key={f.key} className="grid grid-cols-[minmax(0,132px)_minmax(0,1fr)_64px] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-t-hi">{f.label}</p>
                      <p className="truncate font-mono text-[10px] text-t-lo">{f.key}</p>
                    </div>
                    <div className="min-w-0">
                      <Bar value={f.value} max={100} tone={barTone(f.value)} className="bg-panel-3" />
                      <p className="mt-1 truncate font-mono text-[10px] text-t-lo">
                        {f.weight === null
                          ? 'weight not published'
                          : `${f.weight.toFixed(2)} × ${fmt(f.value, 1)} = ${fmt(f.weight * f.value, 1)} pts`}
                      </p>
                    </div>
                    <span className={clsx('text-right font-mono text-sm font-semibold',
                      f.value >= 75 ? 'text-accent-emerald' : f.value >= 50 ? 'text-accent-amber' : 'text-accent-rose')}>
                      {fmt(f.value, 1)}%
                    </span>
                  </div>
                ))}
                {!factors.length && <p className="text-xs text-t-lo">This gate reported no numeric factors.</p>}
              </div>

              {Object.keys(weights).length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-t-lo">published weights</span>
                  {Object.entries(weights).map(([k, v]) => {
                    const w = n(v) ?? 0
                    return (
                      <MetricPill
                        key={k}
                        label={humanize(k)}
                        value={`${fmt(Math.abs(w) <= 1 ? w * 100 : w, 0)}%`}
                      />
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* 4 · Model reliability + SHAP stability */}
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title="Model reliability">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight text-t-hi">
                  {signal.model_relevance === null ? '—' : `${fmt(signal.model_relevance, 1)}%`}
                </p>
                <StatusChip status={signal.model_relevance === null ? 'idle' : toneOf(signal.model_relevance) === 'emerald' ? 'ok' : 'warn'}>
                  {signal.model_relevance === null ? 'no model' : toneOf(signal.model_relevance) === 'emerald' ? 'reliable' : 'weak fit'}
                </StatusChip>
              </div>
              <Bar
                className="mt-2.5 bg-panel-3"
                value={signal.model_relevance ?? 0}
                max={100}
                tone={barTone(signal.model_relevance ?? 0)}
              />
              <p className="mt-2 text-xs text-t-lo">R² of the active model, scaled to 0–100 — how much of the target variance it explains.</p>
              <p className="mt-1 font-mono text-[11px] text-t-mid">
                {weights.model_relevance === undefined
                  ? 'no published weight for this signal'
                  : `weight ${Number(weights.model_relevance).toFixed(2)} → ${fmt(Number(weights.model_relevance) * (signal.model_relevance ?? 0), 1)} pts of the trust score`}
              </p>
            </Panel>

            <Panel title="SHAP stability">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight text-t-hi">
                  {signal.shap_stability === null ? '—' : `${fmt(signal.shap_stability, 1)}%`}
                </p>
                <StatusChip status={signal.shap_stability === null ? 'idle' : toneOf(signal.shap_stability) === 'emerald' ? 'ok' : 'warn'}>
                  {signal.shap_stability === null ? 'not computed' : toneOf(signal.shap_stability) === 'emerald' ? 'stable' : 'noisy'}
                </StatusChip>
              </div>
              <Bar
                className="mt-2.5 bg-panel-3"
                value={signal.shap_stability ?? 0}
                max={100}
                tone={barTone(signal.shap_stability ?? 0)}
              />
              <p className="mt-2 text-xs text-t-lo">Consistency of feature attributions — whether the same features keep driving the model.</p>
              <p className="mt-1 font-mono text-[11px] text-t-mid">
                {weights.shap_stability === undefined
                  ? 'no published weight for this signal'
                  : `weight ${Number(weights.shap_stability).toFixed(2)} → ${fmt(Number(weights.shap_stability) * (signal.shap_stability ?? 0), 1)} pts of the trust score`}
              </p>
              {missing.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-t-lo">weight redistributed from</span>
                  {missing.map(m => (
                    <span key={m} className="rounded-button border border-border bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-t-lo">
                      {humanize(m)}
                    </span>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <StoryFlow stageKey={STAGE} activeKey="produced" />

          {/* 5 · Continue / Review — PASS continues, REVIEW continues knowingly, FAIL holds */}
          {band === 'pass' ? (
            <AutoNext to={shapTarget} label="Confidence graded — explaining decisions" />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-4 py-3 shadow-[0_1px_2px_rgba(20,28,48,.05),0_8px_24px_rgba(20,28,48,.07)]">
              <div className="min-w-0">
                <p className="text-sm text-t-hi">
                  {band === 'review'
                    ? 'Gate holds caveats — review the breakdown, or continue knowingly.'
                    : 'Gate did not pass — the decision is held until the weakest signal is strengthened.'}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-t-lo">
                  {band === 'review' ? 'next · SHAP explainability' : 'held · fix the inputs, then re-evaluate'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={openReview}>
                  <AlertTriangle className="h-3.5 w-3.5" /> Review
                </Button>
                {band === 'fail' && datasetId && (
                  <Button size="sm" variant="outline" onClick={() => navigate({ to: `/dq/${datasetId}` })}>
                    Return to Data Quality <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
                {band === 'review' && (
                  <Button size="sm" onClick={continueJourney}>
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ConfidenceGatePage
