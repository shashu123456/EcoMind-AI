import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ArrowRight, GitBranch, Sparkles, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { explanations, models, predictions, type ExplainResult, type GlobalExplain } from '../lib/api'
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
  QualityRating,
} from '../lib/stagekit'
import { beatForStage, storyForStage } from '../lib/story'

/* ── Stage identity ─────────────────────────────────────────────── */
const STAGE = 'shap'
const BEAT = beatForStage(STAGE)
const STORY = storyForStage(STAGE)

type Method = 'tree' | 'kernel'
const METHODS: Method[] = ['tree', 'kernel']
const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

/* The client types global_importance as a number[] parallel to feature_names,
   but the backend publishes {feature: mean |SHAP|} (plus expected_value and the
   explainer method). Accept both shapes and normalize to rows. */
type GlobalView = GlobalExplain & { expected_value?: number | null; method?: string | null }

interface GlobalRow {
  name: string
  value: number
}

interface LocalRow {
  name: string
  shap: number
  inputValue: number | null
}

function globalRows(g: GlobalView | null): GlobalRow[] {
  if (!g) return []
  const names = Array.isArray(g.feature_names) ? g.feature_names.filter(Boolean) : []
  const gi = g.global_importance as unknown
  if (Array.isArray(gi)) {
    return names.map((name, i) => ({ name, value: n(gi[i]) ?? 0 }))
  }
  if (gi && typeof gi === 'object') {
    const rec = gi as Record<string, unknown>
    const byName: GlobalRow[] = []
    for (const name of names) {
      const v = n(rec[name])
      if (v !== null) byName.push({ name, value: v })
    }
    /* include any keys the names list missed so nothing is dropped */
    for (const [k, v] of Object.entries(rec)) {
      if (n(v) !== null && !byName.some(r => r.name === k)) byName.push({ name: k, value: n(v) as number })
    }
    return byName
  }
  return []
}

function localRows(local: ExplainResult | null): LocalRow[] {
  const raw = (local?.top_features ?? null) as unknown
  if (!raw) return []
  if (Array.isArray(raw)) {
    return (raw as any[])
      .map(r => ({
        name: String(r.feature ?? r.name ?? ''),
        shap: n(r.shap ?? r.value) ?? 0,
        inputValue: n(r.input ?? r.input_value),
      }))
      .filter(r => r.name)
  }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([name, v]) => ({ name, shap: n(v) ?? 0, inputValue: null as number | null }))
      .sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap))
  }
  return []
}

function stabilityMeta(stab: number | null): { label: string; status: 'ok' | 'warn' } {
  if (stab === null) return { label: 'not computed', status: 'warn' }
  return stab >= 75
    ? { label: 'stable', status: 'ok' }
    : { label: 'noisy', status: 'warn' }
}

export function SHAPExplainabilityPage() {
  const params = useRouteParams()
  const routeModel = params.modelId
  const navigate = useNavigate()
  const { datasetId, runId, setActive, markCompleted } = useJourney()

  const placeholder = !routeModel || routeModel === '$modelId' || routeModel === 'auto'
  const [resolved, setResolved] = useState<string | null>(placeholder ? null : routeModel)
  const [method, setMethod] = useState<Method>('tree')

  /* ── Global importance (GET /explanations/{model}/global) ──────── */
  const globalRes = useApi<GlobalView | null>(async () => {
    let id = resolved
    if (!id) {
      const ml = await models.list()
      const mine = (ml.models || []).filter(m => m.id && (!datasetId || !m.dataset_id || m.dataset_id === datasetId))
      if (!mine.length) return null
      id = mine[0].id
      setResolved(id)
    }
    return (await explanations.global(id, 15)) as GlobalView
  }, [resolved, datasetId])

  const g = globalRes.data
  const rows = useMemo<GlobalRow[]>(() => globalRows(g), [g])
  const maxImp = useMemo(() => Math.max(1e-9, ...rows.map(r => Math.abs(r.value))), [rows])

  /* ── Latest prediction id (needed for a local explanation) ─────── */
  const predRes = useApi<string | null>(async () => {
    if (!resolved) return null
    // the client types this payload as chart points; the wire rows carry `id`.
    const payload = await predictions.list(resolved) as any
    const list: { id?: string }[] = Array.isArray(payload?.predictions) ? payload.predictions : []
    return list[0]?.id ?? null
  }, [resolved])
  const predictionId = predRes.data ?? null

  /* ── Local explanation (POST /explanations/{prediction}/explain) ─ */
  const localRes = useApi<ExplainResult | null>(
    () => (predictionId ? explanations.explain(predictionId, { method }) : Promise.resolve(null)),
    [predictionId, method],
  )
  const local = localRes.data
  const localR = useMemo<LocalRow[]>(() => localRows(local), [local])
  const maxShap = useMemo(() => Math.max(1e-9, ...localR.map(r => Math.abs(r.shap))), [localR])

  const stab = n(g?.stability_index)
  const stabMeta = stabilityMeta(stab)
  const baseValue = n(g?.base_value)
  const expectedValue = n(g?.expected_value)
  const computeMs = n(g?.computation_time_ms)

  const busy = globalRes.loading || predRes.loading || localRes.loading
  const hasGlobal = rows.length > 0
  const awaiting = !g && !globalRes.loading && !globalRes.error
  const noModel = awaiting && !resolved

  /* A landed global explanation means the stage is done. */
  useEffect(() => {
    if (!hasGlobal) return
    markCompleted(STAGE)
    setActive(datasetId ?? undefined, runId ?? undefined, resolved ?? undefined)
  }, [hasGlobal, datasetId, runId, resolved, markCompleted, setActive])

  const topFeature = rows[0]
  const top2Share = rows.length >= 2
    ? ((rows[0].value + rows[1].value) / Math.max(1e-9, rows.reduce((a, r) => a + Math.abs(r.value), 0))) * 100
    : 0

  const methodPicker = (
    <div className="inline-flex rounded-button border border-border bg-panel2 p-0.5">
      {METHODS.map(m => (
        <button
          key={m}
          type="button"
          disabled={localRes.loading}
          onClick={() => setMethod(m)}
          title={`Local explainer method — ${m}`}
          className={clsx(
            'rounded-button px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:opacity-50',
            method === m ? 'bg-primary-500 text-white' : 'text-t-lo hover:text-t-hi',
          )}
        >
          {m}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {/* Level 1 — one sentence */}
      <StageHeader
        beat={BEAT.beat}
        chapter={BEAT.chapter}
        title="Why the model decided"
        tagline="Ranks which inputs drove the model's behaviour — for the whole portfolio and for the latest prediction."
        icon={<GitBranch className="h-5 w-5" />}
        right={
          <>
            {g ? <DoneChip text="Explanations ready" /> : <StatusChip status="idle">not computed</StatusChip>}
            {methodPicker}
          </>
        }
      />

      {globalRes.error && <ErrorBox message={globalRes.error} onRetry={globalRes.refetch} />}
      {localRes.error && (
        <div className="flex items-center gap-2 rounded-card border border-accent-rose/30 bg-accent-rose/10 px-3.5 py-2.5 text-xs text-accent-rose">
          <XCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">local explanation failed — {localRes.error}</span>
          <Button size="xs" variant="outline" onClick={() => void localRes.refetch()} loading={localRes.loading}>Retry</Button>
        </div>
      )}

      {globalRes.loading && !g && <LoadingState label="Computing global SHAP…" />}

      {noModel && (
        <EmptyState
          title="No trained model to explain"
          hint="Global SHAP decomposes a trained model. Train one in the Prediction Engine, then attributions appear here."
          action={
            <Button
              size="md"
              onClick={() => navigate({ to: datasetId ? `/prediction/${datasetId}` : '/library' })}
            >
              Open prediction engine <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />
      )}

      {awaiting && !noModel && !globalRes.error && (
        <EmptyState
          title="No explanation stored for this model yet"
          hint={`${STORY.produced}. ${STORY.next}`}
          action={<Button size="md" onClick={() => void globalRes.refetch()} loading={globalRes.loading}><Sparkles className="h-4 w-4" /> Compute global SHAP</Button>}
        />
      )}

      {g && (
        <>
          {/* Level 2 — the one hero: global importance ranking */}
          <Hero>
            <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
              <SectionLabel>What drives the model</SectionLabel>
              <span className="font-mono text-[10px] text-t-lo">{rows.length} features · mean |SHAP|</span>
            </div>
            <div className="max-h-[460px] overflow-y-auto p-5">
              {rows.length === 0 ? (
                <EmptyState title="No global importance returned" hint="This payload carried no feature contributions." />
              ) : (
                <div className="space-y-2.5">
                  {rows.map((r, i) => (
                    <div key={r.name} title={`${r.name} · mean |SHAP| ${fmt(r.value, 5)}`}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={clsx('w-5 shrink-0 text-right font-mono text-[10px]', i < 3 ? 'font-semibold text-primary-500' : 'text-t-lo/60')}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="truncate font-mono text-xs text-t-mid">{r.name}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs font-semibold text-t-hi">{fmt(r.value, 4)}</span>
                      </div>
                      <Bar value={Math.abs(r.value)} max={maxImp} tone="primary" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Hero>

          {/* verdict line */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-card border border-border bg-panel px-5 py-4">
            <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-t-hi">
              {topFeature
                ? `"${topFeature.name}" is the model's dominant input, and the top two features carry ${fmt(top2Share, 0)}% of its total attention.`
                : 'The model returned no feature contributions to rank.'}
            </p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
              <div>
                <SectionLabel>Stability</SectionLabel>
                <div className="mt-0.5"><QualityRating score={stab ?? 0} label="" /></div>
              </div>
              <div>
                <SectionLabel>Model</SectionLabel>
                <div className="mt-0.5 font-mono text-sm font-semibold text-t-hi">{resolved ? resolved.slice(0, 8) : '—'}</div>
              </div>
            </div>
          </div>

          {/* Level 3 — local waterfall, narrative, numbers: hidden until asked */}
          <div className="shrink-0 space-y-2">
            <Advanced
              label="Latest prediction, explained"
              hint={localR.length ? `${localR.length} contributions` : predictionId ? 'available' : 'run a prediction first'}
              defaultOpen={false}
            >
              {!predictionId && !predRes.loading ? (
                <EmptyState
                  title="No prediction recorded for this model"
                  hint="A local explanation decomposes one stored prediction. Run the Prediction Engine first."
                  action={
                    <Button size="sm" variant="secondary" onClick={() => navigate({ to: datasetId ? `/prediction/${datasetId}` : '/library' })}>
                      Open prediction engine <ArrowRight className="h-4 w-4" />
                    </Button>
                  }
                />
              ) : predRes.loading || (localRes.loading && !local) ? (
                <LoadingState label={`Explaining the latest prediction with the ${method} explainer…`} />
              ) : localR.length === 0 ? (
                <EmptyState title="No feature contributions in this explanation" hint="Recompute, or run a fresh prediction to get a decomposable row." />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel>pushes prediction up →</SectionLabel>
                    <SectionLabel>← pushes prediction down</SectionLabel>
                  </div>
                  {localR.map(r => {
                    const positive = r.shap >= 0
                    const width = `${(Math.abs(r.shap) / maxShap) * 50}%`
                    const signed = `${positive ? '+' : '−'}${fmt(Math.abs(r.shap), 4)}`
                    const input = r.inputValue === null ? '—' : fmt(r.inputValue, 3)
                    return (
                      <div
                        key={`${method}-${r.name}`}
                        title={`${r.name} — SHAP ${signed} · input value ${input}`}
                        className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_96px] items-center gap-2.5"
                      >
                        <div className="min-w-0 text-right">
                          <p className="truncate text-xs font-medium text-t-hi">{r.name}</p>
                          <p className="truncate font-mono text-[10px] text-t-lo">input {input}</p>
                        </div>
                        <div className="relative h-2.5 overflow-hidden rounded-button bg-panel3">
                          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
                          <motion.div
                            className={clsx(
                              'absolute top-0 h-full',
                              positive ? 'left-1/2 rounded-r-full bg-accent-emerald' : 'right-1/2 rounded-l-full bg-accent-rose',
                            )}
                            initial={{ width: '0%' }}
                            animate={{ width }}
                            transition={{ duration: 0.5, ease: EASE }}
                          />
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={clsx('font-mono text-xs font-semibold', positive ? 'text-accent-emerald' : 'text-accent-rose')}>
                            {signed}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {local?.narrative && (
                <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed text-t-mid">{local.narrative}</p>
              )}
            </Advanced>

            <Advanced label="Explainer numbers" hint={computeMs !== null ? `${fmt(computeMs, 1)} ms compute` : undefined}>
              <div className="flex flex-wrap items-center gap-1.5">
                <MetricPill label="stability" value={stab === null ? '—' : `${fmt(stab, 1)}%`} />
                <MetricPill label="base value" value={baseValue === null ? '—' : fmt(baseValue, 3)} />
                <MetricPill label="expected value" value={expectedValue === null ? '—' : fmt(expectedValue, 3)} />
                <MetricPill label="compute" value={computeMs === null ? '—' : `${fmt(computeMs, 1)} ms`} />
                <MetricPill label="method" value={g.method ?? method} />
              </div>
            </Advanced>
          </div>

          {hasGlobal && !predRes.loading && !localRes.loading && (
            <AutoNext
              to={datasetId ? `/anomalies/${datasetId}` : '/library'}
              label="Explanations ready — screening for anomalies"
            />
          )}
        </>
      )}
    </div>
  )
}

export default SHAPExplainabilityPage
