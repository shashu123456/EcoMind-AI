import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight, Database, ShieldCheck, Gauge, AlertTriangle,
  Trophy, TrendingUp, Coins, Cloud, Sparkles, Play, Activity, Radio, Cpu, Zap, Star,
} from 'lucide-react'
import { datasets, ai, workflows } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useJourney, WORKFLOW, CORE_WORKFLOW, stagePath, runJourneyToCompletion, MILESTONES, milestoneProgress, progressStats } from '../lib/journey'
import { AnimatedNumber, Particles, Reveal, Gauge as TrustGauge, B, Skeleton, firePageRipple, RippleButton } from '../lib/kit'
import { AnnotatedText, MatrixRain, SplitFlapDisplay } from '../lib/interactive'
import { STAGE_ICONS, STAGE_COLORS } from '../components/ProcessRail'
import { EcoMindLogo } from '../lib/logo'
import clsx from 'clsx'

/* ── Electric current background: flowing data-flow lines, no images ── */
const CURRENT_LINES = [
  { d: 'M0,320 C160,240 320,420 520,330 S 880,190 1080,290 S 1400,420 1600,300', delay: 0 },
  { d: 'M0,120 C200,200 360,80 560,180 S 900,340 1100,240 S 1450,110 1600,170', delay: 1.2 },
  { d: 'M0,520 C180,440 340,560 560,480 S 900,360 1120,470 S 1500,540 1600,460', delay: 2.1 },
]

function ElectricHero() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_75%_10%,rgba(74,159,216,0.16),transparent_60%),radial-gradient(700px_420px_at_15%_110%,rgba(76,95,213,0.2),transparent_60%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-70" viewBox="0 0 1600 600" preserveAspectRatio="none" fill="none">
        <defs>
          <linearGradient id="ecurrent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4C5FD5" stopOpacity="0" />
            <stop offset="30%" stopColor="#4A9FD8" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#5B6FE0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
          </linearGradient>
        </defs>
        {CURRENT_LINES.map((c, i) => (
          <g key={i}>
            <path d={c.d} stroke="url(#ecurrent)" strokeWidth="1.6" />
            <motion.circle
              r="3"
              fill="#7dd3fc"
              style={{ filter: 'drop-shadow(0 0 6px #4A9FD8)' }}
              animate={{ offsetDistance: '0%', offsetPath: c.d }}
              initial={{ offsetDistance: '0%' }}
              transition={{
                offsetDistance: { duration: 9 + i * 2, repeat: Infinity, ease: 'linear', delay: c.delay },
              }}
            />
          </g>
        ))}
      </svg>
      {/* floating electric nodes */}
      {[12, 34, 58, 79, 91, 44, 67].map((left, i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ left: `${left}%`, top: `${(i * 17 + 9) % 90}%`, background: i % 2 ? '#22C55E' : '#7dd3fc', boxShadow: `0 0 8px ${i % 2 ? '#22C55E' : '#7dd3fc'}` }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.3, 0.8] }}
          transition={{ duration: 3 + i, repeat: Infinity, delay: i * 0.4 }}
        />
      ))}
    </div>
  )
}

/* ── Live stage flow monitor: the full pipeline lighting up
     in real time as the auto journey advances (not just a counter). ── */
function StageCascade({ statuses, running, now }: { statuses: Record<string, string>; running: boolean; now: number }) {
  const pct = progressStats(statuses).pct
  return (
    <div className="glass-panel relative overflow-hidden p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-sm font-semibold">
            Live pipeline monitor
            {running && (
              <span className="flex items-center gap-1.5 rounded-full border border-accent-amber/30 bg-accent-amber/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-accent-amber">
                <motion.span className="h-1.5 w-1.5 rounded-full bg-accent-amber" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                auto-running
              </span>
            )}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gray-500">
            {running ? `stage ${now}/${WORKFLOW.length} — ${WORKFLOW[now - 1]?.short ?? 'igniting'}` : 'execution flow · every stage watching live'}
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gray-400">
          <span>{Math.round(pct)}%</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 via-accent-cyan to-accent-emerald"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {MILESTONES.map((m, mi) => {
          const prog = milestoneProgress(statuses, m)
          const mColor = STAGE_COLORS[m.stages[0]]
          return (
            <div key={m.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="flex h-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[9px] font-bold"
                  style={{ background: `${mColor}1f`, color: mColor }}
                >
                  {String(mi + 1).padStart(2, '0')}
                </span>
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: mColor }}>
                  {m.short}
                </span>
                <span className="ml-auto font-mono text-[9px] text-gray-600">
                  {prog.done}/{prog.total}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {m.stages.map((key, i) => {
                  const s = WORKFLOW.find(x => x.key === key)!
                  const st = statuses[key] || 'todo'
                  const Icon = STAGE_ICONS[key]
                  const c = STAGE_COLORS[key]
                  const done = st === 'done'
                  const active = running && s.index === now
                  const locked = st === 'locked'
                  return (
                    <div key={key} className="flex items-center">
                      <div
                        className={clsx(
                          'flex min-w-0 items-center gap-1.5 rounded-button border px-2 py-1.5 transition-all',
                          done
                            ? 'border-accent-emerald/40 bg-accent-emerald/10'
                            : active
                              ? 'bg-white/[0.06] shadow-[0_0_18px_rgba(76,95,213,0.25)]'
                              : locked
                                ? 'border-white/[0.05] opacity-45'
                                : 'border-white/[0.07] hover:border-white/[0.12]',
                        )}
                        style={active ? { borderColor: `${c}88` } : undefined}
                      >
                        <span
                          className="flex h-[18px] w-[18px] items-center justify-center rounded-md border font-mono text-[8.5px] font-bold"
                          style={done ? { borderColor: 'rgba(52,211,153,0.5)', color: '#34D399' } : active ? { borderColor: `${c}99`, color: c } : { borderColor: 'rgba(255,255,255,0.1)', color: '#94A3B8' }}
                        >
                          {done ? <CheckMark className="h-2.5 w-2.5" /> : active ? <Icon className="h-2.5 w-2.5" /> : locked ? '!' : s.index}
                        </span>
                        <span className={clsx('truncate text-[10.5px] font-medium', done ? 'text-gray-200' : active ? 'text-gray-100' : 'text-gray-400')}>
                          {s.short}
                        </span>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, opacity: done ? 1 : 0.35 }} />
                      </div>
                      {i < m.stages.length - 1 && (
                        <span className="mx-0.5 text-[10px] text-gray-600">›</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CheckMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5 4.5 9 10 3.5" />
    </svg>
  )
}

function HeroKey({ k, label, color = 'text-gray-400' }: { k: string; label: string; color?: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-button border border-white/[0.1] bg-black/25 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-300">
      <span className={clsx('h-1.5 w-1.5 rounded-full', color, 'animate-pulse-glow')} />
      <span className="text-gray-400/80">{k}</span> {label}
    </span>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
      <motion.circle
        cx="20" cy="20" r={r} fill="none"
        stroke="url(#ringGrad)" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * Math.min(pct, 100)) / 100 }}
        transition={{ duration: 1.1, ease: B }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4C5FD5" />
          <stop offset="50%" stopColor="#4A9FD8" />
          <stop offset="100%" stopColor="#5B6FE0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ── Mission screen: the live energy terminal on the front page ── */
function EnergyScreen({ dsId, runId, dsName, doneCount, pct }: { dsId: string; runId: string; dsName: string; doneCount: number; pct: number }) {
  return (
    <div className="device-bezel relative mx-auto w-full max-w-xl p-3">
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
          <Zap className="h-3.5 w-3.5 text-[#7DD3FC]" /> EcoMind · Power Grid
        </span>
        <span className="flex items-center gap-2">
          <span className="led led-online" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-green-400">GRID LIVE</span>
        </span>
      </div>
      <div className="device-screen relative h-64 overflow-hidden">
        <ElectricHero />
        <div className="absolute inset-0 opacity-[0.5]">
          <MatrixRain variant="cyan" transparent className="h-full w-full" fontSize={14} />
        </div>
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent p-5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#22C55E] animate-pulse-glow" fill="currentColor" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#22C55E]">energy intelligence, live</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
            <AnnotatedText variant="highlight" className="text-white">Every step explained.</AnnotatedText>
          </h1>
          <p className="mt-1 max-w-md text-sm leading-6 text-gray-300">
            A 13-stage explainable pipeline — from raw energy data to decisions you can trust.
          </p>
          {doneCount > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <ProgressRing pct={pct} />
              <div>
                <p className="font-mono text-xs leading-none text-gray-200">{doneCount}/13 stages complete</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-gray-400">trust score ready</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-1 pt-3" title={dsName}>
        <HeroKey k="sys." label="EcoMind-AI · grid online" color="bg-cyan-400" />
        <HeroKey k="run." label={runId ? runId.slice(0, 8) : '—'} color="bg-emerald-400" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: ds, refetch: refetchDs } = useApi<any>(() => datasets.list() as any, [])
  const { setActive, datasetId, stageStatuses, runId, mode } = useJourney()
  const activeId = datasetId || ds?.datasets?.[0]?.id || ''
  const { data: exec, refetch, loading: execLoading } = useApi<any>(
    () => (activeId ? ai.executive(activeId).then(r => r.summary as any) : Promise.resolve(null)),
    [activeId],
  )
  const [starting, setStarting] = useState(false)
  const [runningJourney, setRunningJourney] = useState(false)
  const [journeyFailed, setJourneyFailed] = useState<string | null>(null)
  const [nowStep, setNowStep] = useState(0)

  const dq = exec?.dq_score ?? 0
  const trust = exec?.trust?.trust_score ?? exec?.trust_score ?? exec?.overall_trust ?? 0
  const predConf = exec?.trust?.gate?.prediction_confidence ?? exec?.prediction_confidence ?? 0
  const anomalies = exec?.anomaly_summary?.total ?? exec?.anomaly_total ?? exec?.critical_anomalies ?? 0
  const totals = exec?.totals || exec?.savings || exec?.estimated_savings || {}

  useEffect(() => { setActive(activeId || null) }, [activeId, setActive])

  async function startJourney() {
    if (!activeId || starting || runningJourney) return
    setStarting(true)
    setJourneyFailed(null)
    firePageRipple()
    try {
      const r: any = await workflows.start({ dataset_id: activeId })
      const rid: string | undefined = r?.run?.id
      setActive(activeId, rid)
      refetchDs()
      if (!rid) { setStarting(false); return }
      if (useJourney.getState().mode === 'manual') {
        const firstStage = (WORKFLOW.find(s => s.requires === 'dataset') || WORKFLOW[0])
        navigate({ to: stagePath(firstStage, { datasetId: activeId, runId: rid }) } as any)
        setStarting(false)
        return
      }
      setRunningJourney(true)
      void runJourneyToCompletion(rid, {
        onStep: (_stage, i) => setNowStep(i + 1),
        onDone: () => {
          setRunningJourney(false)
          refetch()
          navigate({ to: '/journey-complete' } as any)
        },
        onError: (e: any) => {
          setRunningJourney(false)
          setJourneyFailed(e?.message || 'A stage failed — check the History stage for details')
          refetch()
        },
      })
    } finally { setStarting(false) }
  }

  function startStepByStep() {
    useJourney.getState().setMode('manual')
    void startJourney()
  }

  function startAutomated() {
    useJourney.getState().setMode('auto')
    if (!activeId) { navigate({ to: '/library' } as any); return }
    firePageRipple()
    navigate({ to: '/automated' } as any)
  }

  const metrics = [
    { label: 'Data Quality', value: typeof dq === 'number' ? dq : (Array.isArray(dq) ? dq[0]?.overall_score : 0), icon: ShieldCheck, color: 'text-accent-emerald', pct: true },
    { label: 'Trust Score', value: trust, icon: Gauge, color: 'text-primary-400', pct: true },
    { label: 'Prediction Confidence', value: predConf, icon: Activity, color: 'text-accent-cyan', pct: true },
    { label: 'Critical Anomalies', value: anomalies, icon: AlertTriangle, color: 'text-accent-rose' },
  ]

  const doneCount = progressStats(stageStatuses).done
  const pct = progressStats(stageStatuses).pct
  const nextPending = WORKFLOW.find(s => stageStatuses[s.key] !== 'done')
  const resumePath = nextPending ? stagePath(nextPending, { datasetId: activeId || '', runId: runId || '' }) : null
  const savings = totals
  const bestModel = exec?.best_model
  const activeName = activeId ? ds?.datasets?.find((d: any) => d.id === activeId)?.name || 'Active dataset' : ''

  const pipeline = useMemo(() => [
    'transform raw energy → clean features',
    'train algorithms head-to-head',
    'gate every prediction on explainable trust',
    'rank anomalies by real severity',
    'advise with evidence, not guesses',
  ], [])

  return (
    <div className="relative space-y-6 overflow-hidden">
      <Particles count={24} />

      {/* ── FRONT PAGE: brand left, electric mission terminal right ── */}
      <Reveal delay={0}>
        <div className="grid items-center gap-8 lg:grid-cols-[1.12fr_1fr]">
          <div>
            {/* brand — left-aligned, electric pulse */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent-emerald/30 bg-accent-emerald/[0.06] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-accent-emerald">
              <Cpu className="h-3.5 w-3.5 animate-pulse-glow" />
              adaptive · explainable · energy intelligence
            </motion.div>
            <div className="flex items-end gap-4">
              <EcoMindLogo size={54} />
              <div className="min-w-0">
                <h1 className="font-chunky text-[52px] leading-[0.95] text-gray-100 sm:text-6xl">
                  EcoMind{' '}
                  <span className="bg-gradient-to-r from-accent-emerald via-accent-gold to-accent-cyan bg-clip-text text-transparent">AI</span>
                </h1>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-gray-400">
                  environmental intelligence engine{' '}
                  <span className="font-semibold text-accent-gold">· live</span>
                </p>
              </div>
            </div>
            <motion.div
              className="mt-4 flex items-center gap-1"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-[3px] rounded-full bg-gradient-to-r from-primary-500 via-[#4A9FD8] to-[#22C55E]" style={{ width: `${34 + i * 10}px` }} />
              ))}
              <Zap className="ml-1 h-4 w-4 text-accent-cyan" />
            </motion.div>

            <p className="mt-5 max-w-lg text-[15px] leading-7 text-gray-200">
              EcoMind runs your energy data through a{' '}
              <AnnotatedText variant="wavy" className="font-semibold text-accent-emerald">13-stage explainable pipeline</AnnotatedText>{' '}
              — every transformation, every model, every verdict is{' '}
              <AnnotatedText variant="highlight" className="font-semibold text-accent-gold">shown</AnnotatedText>,{' '}
              <AnnotatedText variant="underline" className="font-semibold text-accent-cyan">proven</AnnotatedText>, and ready for audit.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <RippleButton
                onClick={startJourney}
                loading={starting || runningJourney}
                disabled={!activeId}
                className="group relative inline-flex items-center justify-center gap-2 overflow-visible rounded-button bg-gradient-to-r from-accent-emerald to-accent-gold h-11 px-6 text-sm font-bold uppercase tracking-wider text-[#08120E] shadow-[0_0_26px_rgba(16,138,95,0.45)] transition-all hover:shadow-[0_0_40px_rgba(216,166,72,0.6)] disabled:opacity-50"
              >
                <Zap className="h-4 w-4 group-hover:animate-pulse" fill="currentColor" />
                {starting ? 'Igniting engine…' : runningJourney ? 'Running journey…' : 'Run the full process'}
              </RippleButton>
              <button
                onClick={startStepByStep}
                disabled={!activeId || starting || runningJourney}
                className="inline-flex items-center justify-center gap-2 rounded-button border border-accent-gold/40 bg-accent-gold/10 h-11 px-5 text-sm font-semibold text-accent-gold transition-colors hover:bg-accent-gold/20 disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Step-by-step
              </button>
              <Link
                to="/library"
                className="inline-flex items-center justify-center gap-2 rounded-button border border-accent-emerald/40 bg-accent-emerald/10 h-11 px-5 text-sm font-semibold text-accent-emerald transition-colors hover:border-accent-emerald/60 hover:bg-accent-emerald/20"
              >
                <Database className="h-4 w-4" /> Open Library
              </Link>
              <Link
                to="/scorecard"
                className="inline-flex items-center justify-center gap-2 rounded-button border border-accent-violet/30 bg-accent-violet/10 h-11 px-5 text-sm font-semibold text-accent-violet transition-colors hover:bg-accent-violet/20"
              >
                <Star className="h-4 w-4" /> Presentability
              </Link>
              {resumePath && doneCount > 0 && doneCount < WORKFLOW.length && (
                <button
                  onClick={() => { (navigate as any)({ to: resumePath }) }}
                  className="inline-flex items-center gap-2 rounded-button border border-accent-rose/40 bg-accent-rose/10 h-11 px-5 text-sm font-semibold text-accent-rose transition-colors hover:bg-accent-rose/20"
                >
                  <ArrowRight className="h-4 w-4" /> Resume
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={startAutomated}
                disabled={!activeId}
                className="inline-flex items-center gap-1.5 rounded-button border border-white/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-accent-emerald/40 hover:bg-accent-emerald/10 hover:text-accent-emerald disabled:opacity-50"
              >
                <Radio className="h-3 w-3" /> {mode === 'auto' ? 'Automated board · selected' : 'Automated single-screen board'}
              </button>
            </div>
            {journeyFailed && (
              <p className="mt-3 text-xs text-accent-rose">{journeyFailed}</p>
            )}
          </div>

          <Reveal delay={0.1}>
            <EnergyScreen
              dsId={activeId}
              runId={runId || ''}
              dsName={activeName || 'no dataset'}
              doneCount={doneCount}
              pct={pct}
            />
          </Reveal>
        </div>
      </Reveal>

      {/* pipeline strip — well-lit, not hidden */}
      <Reveal delay={0.12}>
        <div className="glass-card grid gap-2 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          {pipeline.map((step, i) => (
            <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }}
              className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary-500/40 bg-primary-500/15 font-mono text-[10px] text-primary-300">{i + 1}</span>
              <span className="text-xs leading-5 text-gray-300">{step}</span>
            </motion.div>
          ))}
        </div>
      </Reveal>

      {/* Race lights strip */}
      <Reveal delay={0.14}>
        <div className="glass-panel relative flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-glass bg-primary-500/15">
              <Radio className="h-5 w-5 text-primary-400 animate-pulse-glow" />
            </span>
            <div>
              <p className="font-display text-sm font-semibold">{activeName || 'No dataset yet'}</p>
              <p className="text-xs text-gray-400">
                {runningJourney ? (
                  <span className="flex items-center gap-1.5 text-accent-amber">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-amber" />
                    Automation live · stage {nowStep}/{WORKFLOW.length} — {WORKFLOW[nowStep - 1]?.label ?? 'igniting'}
                  </span>
                ) : journeyFailed ? (
                  <span className="text-accent-rose">Journey stopped — {journeyFailed}</span>
                ) : (
                  <>{mode === 'manual' ? 'step-by-step mode' : 'automated mode'} · {doneCount}/13 completed</>
                )}
              </p>
            </div>
            <div className="ml-1 hidden md:block" title={`session · ${activeName || 'no dataset'}`}>
              <SplitFlapDisplay
                text="ECOMIND-AI"
                columns={11}
                size="sm"
                accentColor="#22c55e"
                showIndicators={false}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RippleButton
              onClick={startJourney}
              loading={starting || runningJourney}
              disabled={!activeId}
              className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(76,95,213,0.3)] transition-all hover:shadow-[0_0_30px_rgba(76,95,213,0.5)] disabled:opacity-50"
            >
              {starting || runningJourney ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {starting ? 'Igniting engine…' : runningJourney ? 'Running journey…' : `Run the full journey (${mode === 'manual' ? 'step' : 'auto'})`}
            </RippleButton>
          </div>
        </div>
      </Reveal>

      {/* Every process, a hero section */}
      <Reveal delay={0.16}>
        <div className="glass-panel p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-accent-cyan">
                <Cpu className="h-3.5 w-3.5" /> the engine · stage by stage
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-gray-100">Every process, explained.</h2>
            </div>
            <p className="max-w-sm text-xs leading-5 text-gray-400">
              {CORE_WORKFLOW.length} explainable stages — click any journey to watch each step prove itself against the live backend.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {CORE_WORKFLOW.map((st, i) => {
              const Icon = STAGE_ICONS[st.key]
              const color = STAGE_COLORS[st.key]
              return (
                <motion.div
                  key={st.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.035 }}
                  className="group rounded-card border border-white/[0.06] bg-black/20 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary-500/40 hover:bg-primary-500/[0.06] hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-bold"
                      style={{ borderColor: `${color}55`, color, background: `${color}14` }}
                    >
                      {i + 1}
                    </span>
                    <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                    <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-gray-200">{st.short}</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-400">{st.description}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-gray-600 transition-colors group-hover:text-primary-400">
                    <span className="h-1 w-1 rounded-full" style={{ background: color }} />
                    stage {st.index} of {WORKFLOW.length}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </Reveal>

      {/* Live pipeline cascade — the full process visibly advancing */}
      {(runningJourney || doneCount > 0) && (
        <Reveal delay={0.15}>
          <StageCascade statuses={stageStatuses} running={runningJourney} now={nowStep} />
        </Reveal>
      )}

      {/* Empty state */}
      {!exec && !execLoading && (
        <Reveal delay={0.16}>
          <div className="glass-panel relative flex flex-col items-center gap-3 overflow-hidden px-6 py-10 text-center">
            <div className="absolute inset-0 opacity-[0.12]">
              <MatrixRain variant="cyan" transparent className="h-full w-full" fontSize={15} />
            </div>
            <div className="relative flex flex-col items-center gap-3">
              <div className="relative flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-accent-emerald/70" />
              <Zap className="absolute -left-9 h-5 w-5 animate-pulse-glow text-accent-gold/70" fill="currentColor" />
              <Activity className="absolute -right-9 h-5 w-5 text-accent-cyan/70" />
              <Cpu className="absolute bottom-1 left-1/2 h-4 w-4 -translate-x-1/2 text-primary-400/60" />
            </div>
              <p className="font-display text-lg font-semibold text-gray-200">Nothing to show on this dataset yet</p>
              <p className="max-w-xl text-sm leading-relaxed text-gray-400">
                EcoMind generates the Mission Control briefing only after the full 13-stage explainable
                pipeline completes. Run the journey now — every decision it makes becomes visible here —
                or pick a completed run from the Library.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <RippleButton
                  onClick={startJourney}
                  loading={starting || runningJourney}
                  disabled={!activeId}
                  className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(76,95,213,0.3)] transition-all hover:shadow-[0_0_30px_rgba(76,95,213,0.5)] disabled:opacity-50"
                >
                  {starting || runningJourney ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {starting ? 'Igniting engine…' : runningJourney ? 'Running journey…' : 'Run the full journey'}
                </RippleButton>
                <Link to="/library" className="inline-flex items-center justify-center gap-2 rounded-button border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/[0.04]">
                  <Database className="h-4 w-4" /> Open Library
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {/* Trust gauge + narrative */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal delay={0.2} className="lg:col-span-1">
          <div className="glass-card flex h-full flex-col items-center justify-center p-6">
            {execLoading ? (
              <Skeleton style={{ width: 200, height: 200 }} className="rounded-full" />
            ) : (
              <TrustGauge value={typeof trust === 'number' ? trust / 100 : 0} label="Overall AI Trust" size={200} />
            )}
            <p className="mt-2 text-center text-xs text-gray-400">
              {trust >= 80 ? 'High trust — decisions ready for business use.' : trust >= 60 ? 'Moderate trust — review caveats before acting.' : 'Low trust — improve data quality first.'}
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.25} className="lg:col-span-2">
          <div className="grid h-full grid-cols-2 gap-4">
            {execLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <motion.div key={i} className="glass-card relative overflow-hidden p-5">
                    <Skeleton className="h-5 w-5" />
                    <Skeleton className="mt-3 h-3 w-24" />
                    <Skeleton className="mt-2 h-8 w-16" />
                  </motion.div>
                ))
              : metrics.map((m, i) => (
                  <motion.div key={m.label} whileHover={{ y: -3 }}
                    className="glass-card relative overflow-hidden p-5">
                    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.02]" />
                    <m.icon className={clsx('h-5 w-5', m.color)} />
                    <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-gray-400">{m.label}</p>
                    <p className="mt-1 font-display text-3xl font-bold text-gray-100">
                      <AnimatedNumber value={m.value} decimals={(m as any).pct ? 1 : 0} suffix={(m as any).pct ? '%' : ''} />
                    </p>
                  </motion.div>
                ))}
          </div>
        </Reveal>
      </div>

      {/* CEO briefing */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal delay={0.3}>
          <div className="glass-card h-full p-6">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent-emerald" />
              <h3 className="font-display text-sm font-semibold">Business Impact</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-button bg-white/[0.03] p-4">
                <span className="flex items-center gap-2 text-sm text-gray-400"><Coins className="h-4 w-4 text-accent-amber" /> Est. cost exposure</span>
                <span className="font-mono text-sm font-semibold text-accent-emerald">${Number(savings.cost || savings.cost_estimate || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between rounded-button bg-white/[0.03] p-4">
                <span className="flex items-center gap-2 text-sm text-gray-400"><Cloud className="h-4 w-4 text-accent-cyan" /> CO₂ footprint</span>
                <span className="font-mono text-sm font-semibold text-accent-cyan">{Number(savings.co2_kg || savings.co2 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</span>
              </div>
              <div className="flex items-center justify-between rounded-button bg-white/[0.03] p-4">
                <span className="flex items-center gap-2 text-sm text-gray-400"><Database className="h-4 w-4 text-primary-400" /> Forecast demand</span>
                <span className="font-mono text-sm font-semibold text-gray-100">{Number(savings.forecast_kwh || savings.kwh || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh</span>
              </div>
              <div className="flex items-center justify-between rounded-button bg-white/[0.03] p-4">
                <span className="flex items-center gap-2 text-sm text-gray-400"><Trophy className="h-4 w-4 text-accent-violet" /> Best model</span>
                <span className="font-mono text-sm font-semibold text-accent-violet">{bestModel ? (typeof bestModel === 'string' ? bestModel : bestModel.name || bestModel.algorithm) : '—'}</span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.35}>
          <div className="glass-card h-full p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-400" />
              <h3 className="font-display text-sm font-semibold">Executive Narrative</h3>
            </div>
            <p className="text-sm leading-relaxed text-gray-400">
              {exec?.headline || exec?.summary || 'Begin your journey: select a dataset and run the full 13-stage explainable pipeline. EcoMind will show you every decision it makes.'}
            </p>
            {exec?.overview && <p className="mt-3 text-sm leading-relaxed text-gray-400">{exec.overview}</p>}
            {exec?.key_findings?.length ? (
              <div className="mt-4 space-y-1.5">
                {exec.key_findings.slice(0, 3).map((f: string, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.12 }}
                    className="flex items-start gap-2 text-xs text-gray-400">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-emerald" /> {f}
                  </motion.div>
                ))}
              </div>
            ) : null}
            <Link to="/executive" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary-400 hover:text-primary-300">
              Open full Intelligent Center <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Live map of the journey */}
      <Reveal delay={0.4}>
        <div className="glass-panel flex flex-wrap items-center gap-2 p-5">
          <p className="mr-2 font-mono text-xs uppercase tracking-[0.2em] text-gray-400">journey map</p>
          <AnimatePresence>
            {WORKFLOW.map((s, i) => {
              const st = stageStatuses[s.key] || 'todo'
              return (
                <motion.div key={s.key} className="flex items-center gap-2">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    title={`${i + 1}. ${s.label} — ${st}`}
                    className={clsx(
                      'flex h-7 min-w-7 items-center justify-center rounded-button border px-1.5 text-xs font-mono transition-all',
                      st === 'done' && 'border-accent-emerald/40 bg-accent-emerald/10 text-accent-emerald shadow-[0_0_10px_rgba(74,194,154,0.25)]',
                      st === 'active' && 'border-primary-500/50 bg-primary-500/15 text-primary-400 shadow-[0_0_14px_rgba(76,95,213,0.45)]',
                      st === 'todo' && 'border-white/[0.08] bg-white/[0.02] text-gray-600',
                    )}
                  >
                    {i + 1}
                  </motion.div>
                  {i < WORKFLOW.length - 1 && <span className="h-px w-2 bg-white/[0.08]" />}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </Reveal>
    </div>
  )
}

export default DashboardPage