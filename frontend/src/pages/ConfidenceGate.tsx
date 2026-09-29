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
  Hero,
  LoadingState,
  MetricPill,
  SectionLabel,
  StageHeader,
  StatusChip,
  Advanced,
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
  text: string
  advice: string
}> = {
  pass: {
    label: 'Trusted — decision released',
    Icon: CheckCircle2, chip: 'ok', accent: 'emerald',
    border: 'border-accent-emerald/40', text: 'text-accent-emerald',
    advice: 'Every signal cleared its threshold. The model may act on this dataset.',
  },
  review: {
    label: 'Trusted with caveats',
    Icon: AlertTriangle, chip: 'warn', accent: 'amber',
    border: 'border-accent-amber/40', text: 'text-accent-amber',
    advice: 'At least one signal is soft or missing. Read the breakdown before continuing.',
  },
  fail: {
    label: 'Not trusted — hold the decision',
    Icon: XCircle, chip: 'warn', accent: 'rose',
    border: 'border-accent-rose/40', text: 'text-accent-rose',
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
  const SIZE = 190
  const STROKE = 14
  const R = (SIZE - STROKE) / 2 - 4
  const C = 2 * Math.PI * R
  const cx = SIZE / 2
  const cy = SIZE / 2
  const frac = Math.max(0, Math.min(1, value / 100))
  const stroke = tone === 'emerald' ? 'var(--color-accent-emerald)' : tone === 'amber' ? 'var(--color-accent-amber)' : tone === 'rose' ? 'var(--color-accent-rose)' : 'var(--t-lo)'
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0" role="img" aria-label={`Trust score ${fmt(value, 1)} of 100`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--panel3)" strokeWidth={STROKE} />
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
            stroke="var(--color-border-hover)" strokeWidth={2} strokeLinecap="round"
          />
        )
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-t-hi font-mono" style={{ fontSize: 38, fontWeight: 600 }}>
        {fmt(value, 1)}
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" className="fill-t-lo font-mono" style={{ fontSize: 11 }}>% of 100</text>
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
    const wrap = breakdownRef.current
    const details = wrap?.querySelector('details')
    if (details) details.open = true
    wrap?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const present = factors.filter(f => f.value !== null).length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {/* Level 1 — one sentence */}
      <StageHeader
        beat={BEAT.beat}
        chapter={BEAT.chapter}
        title="AI Confidence Gate"
        tagline="Grades how much the pipeline's verdict can be trusted before any decision is made."
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
          {/* Level 2 — the one hero: the trust verdict */}
          <Hero>
            <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
              <SectionLabel>Executive verdict</SectionLabel>
              <Button size="sm" variant="secondary" onClick={() => void evaluate()} loading={busy}>
                {!busy && <RotateCw className="h-3.5 w-3.5" />} Re-evaluate
              </Button>
            </div>
            <div className="flex flex-col items-center gap-6 px-5 py-6 sm:flex-row sm:items-center sm:gap-8">
              <TrustDonut value={trustPct} tone={toneOf(trustPct)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <VerdictIcon className={`h-6 w-6 shrink-0 ${style.text}`} />
                  <p className={`text-xl font-semibold tracking-tight ${style.text}`}>{style.label}</p>
                </div>
                {reasoning?.explanation && <p className="mt-2 text-sm leading-relaxed text-t-mid">{reasoning.explanation}</p>}
                <p className="mt-1.5 text-sm text-t-lo">{style.advice}</p>
                <p className="mt-3 text-[11px] text-t-lo">
                  Ticks mark the decision thresholds — 60 to review, 80 to pass.
                </p>
              </div>
            </div>
          </Hero>

          {/* verdict line */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-card border border-border bg-panel px-5 py-4">
            <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-t-hi">
              {band === 'pass'
                ? `Trust ${fmt(trustPct, 1)}/100 across ${present} of 4 signals — the decision may proceed to explainability.`
                : band === 'review'
                  ? `Trust ${fmt(trustPct, 1)}/100 with caveats — review the soft signals before proceeding.`
                  : `Trust ${fmt(trustPct, 1)}/100 — below the decision threshold; strengthen the weakest signal first.`}
            </p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
              <div>
                <SectionLabel>Verdict</SectionLabel>
                <div className="mt-0.5 font-mono text-sm font-semibold text-t-hi">{gate.verdict ?? '—'}</div>
              </div>
              <div>
                <SectionLabel>Signals</SectionLabel>
                <div className="mt-0.5 text-lg font-semibold tracking-tight text-t-hi">{present} / 4</div>
              </div>
            </div>
          </div>

          {/* Level 3 — how the score was computed: hidden until asked */}
          <div ref={breakdownRef} className="shrink-0 space-y-2">
            <Advanced
              label="Confidence breakdown"
              hint={`${factors.length} factors · Σ contributions ${fmt(contribution, 1)} pts${fullyWeighted ? '' : ' (partial)'}`}
              defaultOpen={band !== 'pass'}
            >
              <div className="space-y-3">
                {factors.map((f) => (
                  <div key={f.key} className="grid grid-cols-[minmax(0,132px)_minmax(0,1fr)_64px] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-t-hi">{f.label}</p>
                      <p className="truncate font-mono text-[10px] text-t-lo">{f.key}</p>
                    </div>
                    <div className="min-w-0">
                      <Bar value={f.value} max={100} tone={barTone(f.value)} />
                      <p className="mt-1 truncate font-mono text-[10px] text-t-lo">
                        {f.hint}
                        {f.weight !== null && ` · ${f.weight.toFixed(2)} × ${fmt(f.value, 1)} = ${fmt(f.weight * f.value, 1)} pts`}
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
                  <SectionLabel>published weights</SectionLabel>
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

              {missing.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <SectionLabel>weight redistributed from</SectionLabel>
                  {missing.map(m => (
                    <MetricPill key={m} label={humanize(m)} value="—" />
                  ))}
                </div>
              )}
            </Advanced>

            <Advanced label="Run metadata" hint={gate.workflow_run_id ? `run ${String(gate.workflow_run_id).slice(0, 8)}` : undefined}>
              <div className="flex flex-wrap items-center gap-1.5">
                <MetricPill label="run" value={gate.workflow_run_id ? String(gate.workflow_run_id).slice(0, 8) : '—'} />
                <MetricPill label="model" value={gate.model_id ? String(gate.model_id).slice(0, 8) : '—'} />
                <MetricPill label="assessed" value={gate.created_at ? new Date(gate.created_at).toLocaleString() : '—'} />
              </div>
            </Advanced>
          </div>

          {/* PASS continues, REVIEW continues knowingly, FAIL holds */}
          {band === 'pass' ? (
            <AutoNext to={shapTarget} label="Confidence graded — explaining decisions" />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-4 py-3 shadow-sm">
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
