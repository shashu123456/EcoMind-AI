import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Cpu, Loader2, LogIn, ShieldCheck, ArrowRight } from 'lucide-react'
import { auth } from '../lib/api'
import { cn } from '../lib/interactive'
import { EcoMindLogo } from '../lib/logo'
import { WORKFLOW, MILESTONES } from '../lib/journey'
import { STAGE_COLORS } from '../components/ProcessRail'

const DEFAULT_EMAIL = 'admin@ecomind.ai'
const DEFAULT_PASSWORD = 'admin123'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState(DEFAULT_EMAIL)
  const [password, setPassword] = useState(DEFAULT_PASSWORD)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoTried = useRef(false)

  async function signIn(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await auth.login(email, password)
      localStorage.setItem('ecomind_token', (res as any).access_token)
      localStorage.setItem('ecomind_user', JSON.stringify((res as any).user || {}))
      navigate({ to: '/' })
    } catch (err: any) {
      const msg = err?.message || String(err)
      setError(msg.includes('Failed to fetch') || msg.includes('Network')
        ? 'Cannot reach the EcoMind backend at /api/v1. Make sure the launcher started the Backend service.'
        : msg)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (localStorage.getItem('ecomind_token')) {
      navigate({ to: '/' })
      return
    }
    if (!autoTried.current) {
      autoTried.current = true
      const t = setTimeout(() => { signIn() }, 120)
      return () => clearTimeout(t)
    }
  }, [])

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* aurora canvas */}
      <div className="absolute inset-0 bg-[#0B0F17]" aria-hidden>
        <div className="absolute inset-0"
          style={{
            background:
              'radial-gradient(52% 44% at 14% 10%, rgba(76,95,213,0.30), transparent 66%),' +
              'radial-gradient(44% 38% at 88% 8%, rgba(90,214,240,0.22), transparent 68%),' +
              'radial-gradient(46% 40% at 82% 92%, rgba(90,123,213,0.18), transparent 70%),' +
              'radial-gradient(40% 36% at 10% 90%, rgba(52,211,153,0.14), transparent 70%)',
          }}
        />
        <div className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'linear-gradient(rgba(90,214,240,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(90,214,240,0.05) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(80% 80% at 50% 30%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(80% 80% at 50% 30%, black, transparent)',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-r from-sky-400 via-accent-cyan to-accent-emerald opacity-80" />
      </div>

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-glass border border-white/[0.08] bg-white/[0.03] shadow-[0_0_80px_rgba(76,95,213,0.18)] backdrop-blur-xl lg:grid-cols-[1.05fr_1fr]">
        {/* left brand panel */}
        <div className="relative hidden flex-col justify-between gap-8 overflow-hidden border-r border-white/[0.06] p-10 lg:flex">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 50% at 20% 8%, rgba(76,95,213,0.22), transparent 70%),' +
                'radial-gradient(50% 44% at 85% 90%, rgba(52,211,153,0.12), transparent 70%)',
            }}
          />
          <div className="relative flex items-center gap-3">
            <EcoMindLogo size={40} />
            <div>
              <p className="font-display text-base font-semibold tracking-tight">EcoMind AI</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-500">grid intelligence console</p>
            </div>
          </div>

          <div className="relative">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.28em] text-accent-cyan">adaptive · explainable · energy</p>
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">
              Understand every kilowatt,<br />
              <span className="text-accent-cyan">explain every decision.</span>
            </h1>
          </div>

          <div className="relative space-y-2.5">
            {MILESTONES.map((m, i) => {
              const color = STAGE_COLORS[m.stages[0]]
              return (
                <div key={m.short} className="flex items-center gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] font-bold"
                    style={{ borderColor: `${color}66`, background: `${color}1a`, color }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-medium text-gray-300">{m.short}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-gray-600">
                    {m.stages.map(k => WORKFLOW.find(w => w.key === k)?.path.split('/')[1]).join(' · ')}
                  </span>
                  {i < MILESTONES.length - 1 && (
                    <span className="ml-1 h-3 w-px bg-white/[0.12]" />
                  )}
                </div>
              )
            })}
          </div>

          <div className="relative flex items-center justify-between border-t border-white/[0.06] pt-4">
            <p className="font-mono text-[10px] tracking-[0.2em] text-gray-600">15-stage explainable pipeline</p>
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-emerald">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-emerald/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-emerald" />
              </span>
              ready
            </p>
          </div>
        </div>

        {/* right sign-in panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative p-8 sm:p-10"
        >
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-3">
              <EcoMindLogo size={40} />
              <p className="font-display text-base font-semibold tracking-tight">EcoMind AI</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('led', busy ? 'led-alert animate-pulse' : 'led-online')} />
              <span className={cn('font-mono text-[10px] uppercase tracking-[0.18em]', busy ? 'text-gray-400' : 'text-green-400')}>
                {busy ? 'handshake…' : 'system on'}
              </span>
            </div>
          </div>

          <div className="mb-7 hidden items-center justify-between lg:flex">
            <div className="flex items-center gap-2">
              <span className={cn('led', busy ? 'led-alert animate-pulse' : 'led-online')} />
              <span className={cn('font-mono text-[10px] uppercase tracking-[0.18em]', busy ? 'text-gray-400' : 'text-green-400')}>
                {busy ? 'handshake…' : 'system on'}
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">operator access</p>
          </div>

          <p className="mb-1 font-display text-xl font-semibold tracking-tight">Sign in to the console</p>
          <p className="mb-6 flex items-center gap-1.5 text-xs text-gray-500">
            <Cpu className="h-3.5 w-3.5 text-accent-cyan" /> Enter the mission control — your pipeline resumes where it left off.
          </p>

          <form onSubmit={signIn} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="username"
                className="input-well mt-1 w-full rounded-button bg-white/[0.04] px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                className="input-well mt-1 w-full rounded-button bg-white/[0.04] px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>

            {error && (
              <p className="rounded-button border border-accent-rose/20 bg-accent-rose/10 px-3 py-2 text-xs text-accent-rose">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="phys-key flex w-full items-center justify-center gap-2 rounded-button bg-primary-500 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? 'Signing in…' : 'Enter mission control'}
              {!busy && <ArrowRight className="h-3.5 w-3.5 opacity-70" />}
            </button>
          </form>

          <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-gray-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-emerald" />
            Offline &amp; self-contained. Default account{' '}
            <span className="font-mono text-gray-500">admin@ecomind.ai / admin123</span> — files never leave this machine.
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default LoginPage