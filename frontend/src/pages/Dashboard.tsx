import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight, Database, ShieldCheck, Gauge, AlertTriangle,
  Trophy, TrendingUp, Coins, Cloud, Sparkles, Play, Activity, Radio, Cpu, Zap, CircuitBoard, X, Star,
} from 'lucide-react'
import { datasets, ai, workflows } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useJourney, WORKFLOW, stagePath, runJourneyToCompletion } from '../lib/journey'
import { AnimatedNumber, Particles, Reveal, Gauge as TrustGauge, B, firePageRipple } from '../lib/kit'
import { AnnotatedText, MatrixRain, SplitFlapDisplay } from '../lib/interactive'
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

/* ── Mission screen: energy data-flow panel on the right ── */
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
            A 17-stage explainable pipeline — from raw energy data to decisions you can trust.
          </p>
          {doneCount > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <ProgressRing pct={pct} />
              <div>
                <p className="font-mono text-xs leading-none text-gray-200">{doneCount}/17 stages complete</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-gray-400">trust score ready</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-1 pt-3">
        <HeroKey k="ds." label={dsName} color="bg-cyan-400" />
        <HeroKey k="run." label={runId ? runId.slice(0, 8) : '—'} color="bg-emerald-400" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: ds, refetch: refetchDs } = useApi<any>(() => datasets.list() as any, [])
  const { setActive, datasetId, stageStatuses, runId } = useJourney()
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

  const metrics = [
    { label: 'Data Quality', value: typeof dq === 'number' ? dq : (Array.isArray(dq) ? dq[0]?.overall_score : 0), icon: ShieldCheck, color: 'text-accent-emerald', pct: true },
    { label: 'Trust Score', value: trust, icon: Gauge, color: 'text-primary-400', pct: true },
    { label: 'Prediction Confidence', value: predConf, icon: Activity, color: 'text-accent-cyan', pct: true },
    { label: 'Critical Anomalies', value: anomalies, icon: AlertTriangle, color: 'text-accent-rose' },
  ]

  const doneCount = WORKFLOW.filter(s => stageStatuses[s.key] === 'done').length
  const pct = (doneCount / WORKFLOW.length) * 100
  const nextPending = WORKFLOW.find(s => stageStatuses[s.key] !== 'done')
  const resumePath = nextPending ? stagePath(nextPending, { datasetId: activeId || '', runId: runId || '' }) : null
  const savings = totals
  const bestModel = exec?.best_model

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

      {/* ── FRONT PAGE: brand left, electric mission screen right ── */}
      <Reveal delay={0}>
        <div className="grid items-center gap-8 lg:grid-cols-[1.12fr_1fr]">
          <div>
            {/* brand — left-aligned, electric pulse */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-[#7DD3FC]">
              <Cpu className="h-3.5 w-3.5 animate-pulse-glow" />
              <span>adaptive · explainable · energy intelligence</span>
            </motion.div>
            <div className="flex items-center gap-3">
              <EcoMindLogo size={46} />
              <h1 className="font-display text-5xl font-black tracking-tight text-white sm:text-6xl">
                ECO<span className="text-[#7DD3FC]">MIND</span>
                <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-[#22C55E] shadow-[0_0_14px_#22C55E]" />
              </h1>
            </div>
            <motion.div
              className="mt-4 flex items-center gap-1"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-[3px] rounded-full bg-gradient-to-r from-primary-500 via-[#4A9FD8] to-[#22C55E]" style={{ width: `${34 + i * 10}px` }} />
              ))}
              <Zap className="ml-1 h-4 w-4 text-[#7DD3FC]" />
            </motion.div>

            <p className="mt-5 max-w-lg text-sm leading-7 text-gray-300">
              EcoMind runs your energy data through a <span className="font-semibold text-gray-100">15-stage explainable pipeline</span> —
              every transformation, every model, every verdict is shown, proven, and ready for audit.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={startJourney}
                disabled={!activeId || starting || runningJourney}
                className="group relative inline-flex items-center justify-center gap-2 overflow-visible rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-6 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_26px_rgba(76,95,213,0.45)] transition-all hover:shadow-[0_0_40px_rgba(76,95,213,0.7)] disabled:opacity-50"
              >
                <Zap className="h-4 w-4 group-hover:animate-pulse" fill="currentColor" />
                {starting ? 'Igniting engine…' : runningJourney ? 'Running journey…' : 'Run the full process'}
              </button>
              <Link
                to="/library"
                className="inline-flex items-center justify-center gap-2 rounded-button border border-white/[0.1] bg-black/20 px-5 py-3 text-sm font-semibold text-gray-200 transition-colors hover:border-primary-500/40 hover:bg-primary-500/10"
              >
                <Database className="h-4 w-4" /> Open Library
              </Link>
              <Link
                to="/scorecard"
                className="inline-flex items-center justify-center gap-2 rounded-button border border-accent-violet/30 bg-accent-violet/10 px-5 py-3 text-sm font-semibold text-accent-violet transition-colors hover:bg-accent-violet/20"
              >
                <Star className="h-4 w-4" /> Presentability
              </Link>
              {resumePath && doneCount > 0 && doneCount < WORKFLOW.length && (
                <button
                  onClick={() => { (navigate as any)({ to: resumePath }) }}
                  className="inline-flex items-center gap-2 rounded-button border border-accent-gold/40 bg-accent-gold/10 px-5 py-3 text-sm font-semibold text-accent-gold transition-colors hover:bg-accent-gold/20"
                >
                  <ArrowRight className="h-4 w-4" /> Resume
                </button>
              )}
            </div>
            {journeyFailed && (
              <p className="mt-3 text-xs text-accent-rose">{journeyFailed}</p>
            )}
          </div>

          <Reveal delay={0.1}>
            <EnergyScreen
              dsId={activeId}
              runId={runId || ''}
              dsName={activeId ? ds?.datasets?.find((d: any) => d.id === activeId)?.name || 'Active dataset' : 'no dataset'}
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
        <div className="glass-panel screws relative flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-glass bg-primary-500/15">
              <Radio className="h-5 w-5 text-primary-400 animate-pulse-glow" />
            </span>
            <div>
              <p className="font-display text-sm font-semibold">{activeId ? ds?.datasets?.find((d: any) => d.id === activeId)?.name || 'Active dataset' : 'No dataset yet'}</p>
              <p className="text-xs text-gray-400">
                {runningJourney ? (
                  <span className="flex items-center gap-1.5 text-accent-amber">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-amber" />
                    Automation live · stage {nowStep}/{WORKFLOW.length} — {WORKFLOW[nowStep - 1]?.label ?? 'igniting'}
                  </span>
                ) : journeyFailed ? (
                  <span className="text-accent-rose">Journey stopped — {journeyFailed}</span>
                ) : (
                  <>17-stage explainable workflow · {doneCount} completed</>
                )}
              </p>
            </div>
            <div className="ml-1 hidden md:block">
              <SplitFlapDisplay
                text={(activeId ? ds?.datasets?.find((d: any) => d.id === activeId)?.name || 'EcoMind' : 'WAITING').toUpperCase().slice(0, 11)}
                columns={11}
                size="sm"
                accentColor="#22c55e"
                showIndicators={false}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startJourney}
              disabled={!activeId || starting || runningJourney}
              className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(76,95,213,0.3)] transition-all hover:shadow-[0_0_30px_rgba(76,95,213,0.5)] disabled:opacity-50"
            >
              {starting || runningJourney ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {starting ? 'Igniting engine…' : runningJourney ? 'Running journey…' : 'Run the full journey'}
            </button>
          </div>
        </div>
      </Reveal>

      {/* Empty state */}
      {!exec && !execLoading && (
        <Reveal delay={0.16}>
          <div className="glass-panel relative flex flex-col items-center gap-3 overflow-hidden px-6 py-10 text-center">
            <div className="absolute inset-0 opacity-[0.12]">
              <MatrixRain variant="cyan" transparent className="h-full w-full" fontSize={15} />
            </div>
            <div className="relative flex flex-col items-center gap-3">
              <Sparkles className="h-8 w-8 text-primary-400/70" />
              <p className="font-display text-lg font-semibold text-gray-200">Nothing to show on this dataset yet</p>
              <p className="max-w-xl text-sm leading-relaxed text-gray-400">
                EcoMind generates the Mission Control briefing only after the full 15-stage explainable
                pipeline completes. Run the journey now — every decision it makes becomes visible here —
                or pick a completed run from the Library.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={startJourney}
                  disabled={!activeId || starting || runningJourney}
                  className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(76,95,213,0.3)] transition-all hover:shadow-[0_0_30px_rgba(76,95,213,0.5)] disabled:opacity-50"
                >
                  {starting || runningJourney ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {starting ? 'Igniting engine…' : runningJourney ? 'Running journey…' : 'Run the full journey'}
                </button>
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
            <TrustGauge value={typeof trust === 'number' ? trust / 100 : 0} label="Overall AI Trust" size={200} />
            <p className="mt-2 text-center text-xs text-gray-400">
              {trust >= 80 ? 'High trust — decisions ready for business use.' : trust >= 60 ? 'Moderate trust — review caveats before acting.' : 'Low trust — improve data quality first.'}
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.25} className="lg:col-span-2">
          <div className="grid h-full grid-cols-2 gap-4">
            {metrics.map((m, i) => (
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
              {exec?.headline || exec?.summary || 'Begin your journey: select a dataset and run the full 17-stage explainable pipeline. EcoMind will show you every decision it makes.'}
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