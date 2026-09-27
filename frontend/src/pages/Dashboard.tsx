import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Zap, Footprints, Database, ArrowRight, Upload, Check } from 'lucide-react'
import { datasets, workflows } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useJourney, WORKFLOW, STAGE_BY_KEY, stagePath, runJourneyToCompletion } from '../lib/journey'
import { Reveal, PulseDot, Skeleton } from '../lib/kit'
import { STAGE_ICONS } from '../components/ProcessRail'
import { STORY_BEATS } from '../lib/story'
import clsx from 'clsx'

const BEAT_STAGE: string[] = [
  'library', 'schema_discovery', 'dq_engine', 'transformation', 'feature_engineering',
  'prediction', 'confidence_gate', 'shap', 'anomaly', 'benchmarking', 'recommendation',
  'executive_center', 'report',
]

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: ds, refetch: refetchDs } = useApi<any>(() => datasets.list() as any, [])
  const { datasetId, runId, mode, setActive } = useJourney()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState<'auto' | 'manual'>(mode)
  const [starting, setStarting] = useState(false)
  const [runningJourney, setRunningJourney] = useState(false)
  const [journeyFailed, setJourneyFailed] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  const list: any[] = ds?.datasets ?? []
  const effectiveId = selectedId ?? datasetId ?? list[0]?.id ?? ''

  function choose(id: string) {
    if (starting || runningJourney) return
    setSelectedId(id)
    setActive(id || null)
  }

  function goToBeat(stageKey: string) {
    const stage = STAGE_BY_KEY[stageKey]
    if (!stage || !effectiveId) return
    const path = stagePath(stage, { datasetId: effectiveId, runId: runId || '' })
    ;(navigate as any)({ to: path })
  }

  async function startAnalysis() {
    if (!effectiveId || starting || runningJourney) return
    setStarting(true)
    setJourneyFailed(null)
    useJourney.getState().setMode(pickMode)
    try {
      const r: any = await workflows.start({ dataset_id: effectiveId })
      const rid: string | undefined = r?.run?.id
      setActive(effectiveId, rid)
      refetchDs()
      if (!rid) { setStarting(false); return }
      if (pickMode === 'manual') {
        const firstStage = (WORKFLOW.find(s => s.requires === 'dataset') || WORKFLOW[0])
        ;(navigate as any)({ to: stagePath(firstStage, { datasetId: effectiveId, runId: rid, modelId: '' }) })
        setStarting(false)
        return
      }
      setRunningJourney(true)
      setStarting(false)
      void runJourneyToCompletion(rid, {
        onStep: (_stage, i) => setStep(i + 1),
        onDone: () => {
          setRunningJourney(false)
          ;(navigate as any)({ to: '/journey-complete' })
        },
        onError: (e: any) => {
          setRunningJourney(false)
          setJourneyFailed(e?.message || 'A stage failed — check the History stage for details')
        },
      })
    } catch (e: any) {
      setStarting(false)
      setJourneyFailed(e?.message || 'Could not start the run — is the backend online?')
    }
  }

  const dt = (iso?: string) => (iso ? iso.slice(0, 10) : '—')

  const ModeCard = ({ value, icon, title, desc, tint }: {
    value: 'auto' | 'manual'; icon: React.ReactNode; title: string; desc: string; tint: 'primary' | 'amber';
  }) => {
    const active = pickMode === value
    return (
      <button
        onClick={() => setPickMode(value)}
        className={clsx(
          'flex w-full items-start gap-3 rounded-button border p-3.5 text-left transition-colors',
          active
            ? tint === 'primary'
              ? 'border-primary-500 bg-primary-500/[0.06]'
              : 'border-accent-amber bg-accent-amber/[0.07]'
            : 'border-border bg-panel2 hover:border-primary-500/40',
        )}
        aria-pressed={active}
      >
        <span className={clsx(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-button',
          active ? 'bg-primary-500 text-white' : 'bg-panel text-t-lo',
          tint === 'amber' && active && 'bg-accent-amber',
        )}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-t-hi">{title}</span>
            {active && <Check className="h-3.5 w-3.5 text-primary-500" />}
          </span>
          <span className="mt-1 block text-xs leading-5 text-t-lo">{desc}</span>
        </span>
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      {/* ── 1 · Intro + Start panel ── */}
      <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-primary-500">
            <PulseDot color="bg-primary-500" ping="bg-primary-500/60" />
            mission control
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-t-hi sm:text-4xl">
            Turn energy data into decisions you can defend.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-t-mid">
            EcoMind runs your dataset through a 13-stage explainable pipeline — every transformation,
            every model, every verdict is shown, proven, and ready for audit. No black boxes.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {WORKFLOW.slice(0, 13).map((s, i) => {
              const Icon = STAGE_ICONS[s.key]
              if (i >= 13) return null
              return (
                <button
                  key={s.key}
                  onClick={() => goToBeat(s.key)}
                  disabled={!effectiveId}
                  title={`${i + 1}. ${s.label}`}
                  className={clsx(
                    'flex h-9 min-w-9 items-center justify-center gap-1 rounded-button border px-2 transition-colors',
                    effectiveId ? 'border-border bg-panel text-t-mid hover:border-primary-500/50 hover:text-primary-500' : 'border-border bg-panel opacity-50',
                  )}
                >
                  <span className="font-mono text-[9px] text-t-lo">{i + 1}</span>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-card border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(20,28,48,.05),0_8px_24px_rgba(20,28,48,.07)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-t-lo">operation mode</p>
          <div className="mt-3 space-y-2.5">
            <ModeCard
              value="auto"
              icon={<Zap className="h-4 w-4" />}
              title="Smart"
              desc="Run the whole workflow automatically. Every stage executes and logs — you audit the evidence after."
              tint="primary"
            />
            <ModeCard
              value="manual"
              icon={<Footprints className="h-4 w-4" />}
              title="Guided"
              desc="Pause at each stage, inspect what happened, and continue when you decide. Built for review-driven work."
              tint="amber"
            />
          </div>
          <button
            onClick={startAnalysis}
            disabled={!effectiveId || starting || runningJourney}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-button bg-primary-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {runningJourney ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Analyzing — beat {step} / 13
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" fill="currentColor" />
                {starting ? 'Starting…' : pickMode === 'manual' ? 'Start guided analysis' : 'Start smart analysis'}
              </>
            )}
          </button>
          {!effectiveId && (
            <Link to="/library" className="mt-3 inline-flex w-full items-center justify-center gap-2 text-xs font-medium text-primary-500 hover:underline">
              <Database className="h-3.5 w-3.5" /> Choose a dataset below, or open the Library
            </Link>
          )}
          {journeyFailed && <p className="mt-3 text-xs leading-5 text-accent-rose">{journeyFailed}</p>}
        </div>
      </div>

      {/* ── 2 · Dataset selection ── */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-t-lo">01 · the data</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-t-hi">Choose your dataset</h2>
          </div>
          <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-mono text-[10px] text-t-lo">
            {list.length} dataset{list.length === 1 ? '' : 's'}
          </span>
        </div>

        {!ds && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-card border border-border bg-panel p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {list.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d: any) => {
              const selected = effectiveId === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => choose(d.id)}
                  className={clsx(
                    'flex flex-col items-start gap-2 rounded-card border bg-panel p-4 text-left transition-colors',
                    selected
                      ? 'border-primary-500 ring-1 ring-primary-500/30'
                      : 'border-border hover:border-primary-500/40',
                  )}
                  aria-pressed={selected}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-button',
                      selected ? 'bg-primary-500 text-white' : 'bg-panel2 text-t-lo',
                    )}>
                      {selected ? <Check className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-t-hi">{d.name}</span>
                    {d.source_type && (
                      <span className="rounded-full border border-border bg-panel3 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-t-lo">{d.source_type}</span>
                    )}
                  </span>
                  <span className="line-clamp-2 w-full text-xs leading-5 text-t-lo">{d.description || 'No description'}</span>
                  <span className="font-mono text-[10px] text-t-mid">
                    {Number(d.row_count || 0).toLocaleString()} rows · {Number(d.column_count || 0)} cols · {dt(d.created_at)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {ds && list.length === 0 && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-panel p-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-button bg-panel2 text-t-lo">
              <Upload className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-t-hi">No datasets yet</p>
            <p className="max-w-sm text-xs leading-5 text-t-lo">
              Import your first energy dataset to begin. EcoMind will guide you from raw data to a
              decision-ready report, stage by stage.
            </p>
            <Link to="/library" className="inline-flex items-center gap-2 rounded-button border border-primary-500/40 bg-primary-500/[0.06] px-4 py-2 text-xs font-semibold text-primary-500 transition-colors hover:bg-primary-500/10">
              <Database className="h-3.5 w-3.5" /> Open the Dataset Library
            </Link>
          </div>
        )}
      </section>

      {/* ── 3 · The 13 beats ── */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-t-lo">02 · the pipeline</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-t-hi">One pipeline, thirteen beats</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-t-mid">
              Raw Data to Report. Every beat is a working stage — watch each one run on the left,
              and read what it did, produced, and why it matters in the summary below.
            </p>
          </div>
        </div>

        <Reveal delay={0.05}>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
            {STORY_BEATS.map((beat, i) => {
              const Icon = STAGE_ICONS[BEAT_STAGE[i]] || Database
              return (
                <button
                  key={beat.beat}
                  onClick={() => goToBeat(BEAT_STAGE[i])}
                  disabled={!effectiveId}
                  title={`${beat.chapter} — ${beat.title}`}
                  className={clsx(
                    'flex flex-col items-start gap-1.5 rounded-button border border-border bg-panel p-2.5 text-left transition-colors',
                    effectiveId ? 'hover:border-primary-500/50' : 'opacity-60',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-panel2 font-mono text-[9px] font-semibold text-t-lo">{beat.beat}</span>
                    <Icon className="h-3.5 w-3.5 text-t-lo" />
                  </span>
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-t-lo">{beat.chapter}</span>
                  <span className="text-[11px] font-semibold leading-tight text-t-mid">{beat.title}</span>
                </button>
              )
            })}
          </div>
        </Reveal>
      </section>

      {/* ── Footer CTA ── */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-card border border-border bg-panel p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-t-hi">Ready to begin?</p>
          <p className="mt-0.5 text-xs leading-5 text-t-lo">
            {pickMode === 'manual'
              ? 'Guided mode pauses at every stage so you can verify the evidence before moving on.'
              : 'Smart mode runs the full pipeline and logs every decision for audit.'}
          </p>
        </div>
        <button
          onClick={startAnalysis}
          disabled={!effectiveId || starting || runningJourney}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-button bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {runningJourney ? 'Running…' : pickMode === 'manual' ? 'Start guided analysis' : 'Start smart analysis'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default DashboardPage