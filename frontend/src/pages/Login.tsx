import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Cpu, Loader2, LogIn, ShieldCheck, ArrowRight, Lock, AtSign } from 'lucide-react'
import { auth } from '../lib/api'
import { cn } from '../lib/interactive'
import { EcoMindLogo, EcoMindWordmark } from '../lib/logo'
import { RippleButton } from '../lib/kit'
import { WORKFLOW, MILESTONES } from '../lib/journey'
import { STAGE_COLORS } from '../components/ProcessRail'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (busy) return
    const cleanEmail = email.trim()
    if (!cleanEmail || !password) {
      setError('Enter both email and password to enter the console.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await auth.login(cleanEmail, password)
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

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* aurora canvas */}
      <div className="absolute inset-0 bg-[#0A0D14]" aria-hidden>
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
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative grid w-full max-w-5xl overflow-hidden rounded-glass border border-white/[0.08] bg-white/[0.03] shadow-[0_8px_24px_rgba(20,28,48,0.12)] backdrop-blur-xl lg:grid-cols-[1.05fr_1fr]"
      >
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
            <EcoMindLogo size={42} />
            <div>
              <EcoMindWordmark size={24} />
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">grid intelligence console</p>
            </div>
          </div>

          <div className="relative">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-cyan">adaptive · explainable · energy</p>
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
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
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
            <p className="font-mono text-[10px] tracking-[0.2em] text-gray-600">13-stage explainable pipeline</p>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-emerald">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-emerald/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-emerald" />
              </span>
              ready
            </p>
          </div>
        </div>

        {/* right sign-in panel */}
        <div className="relative p-8 sm:p-10">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-3">
              <EcoMindLogo size={40} />
              <EcoMindWordmark size={22} />
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('led', busy ? 'led-alert animate-pulse' : 'led-online')} />
              <span className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', busy ? 'text-gray-400' : 'text-green-400')}>
                {busy ? 'handshake…' : 'system on'}
              </span>
            </div>
          </div>

          <div className="mb-7 hidden items-center justify-between lg:flex">
            <div className="flex items-center gap-2">
              <span className={cn('led', busy ? 'led-alert animate-pulse' : 'led-online')} />
              <span className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', busy ? 'text-gray-400' : 'text-green-400')}>
                {busy ? 'handshake…' : 'system on'}
              </span>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">operator access</p>
          </div>

          <p className="mb-1 font-display text-xl font-semibold tracking-tight">Sign in to the console</p>
          <p className="mb-6 flex items-center gap-1.5 text-xs text-gray-500">
            <Cpu className="h-3.5 w-3.5 text-accent-cyan" /> Enter the mission control — your pipeline resumes where it left off.
          </p>

          <form onSubmit={signIn} className="space-y-4" noValidate={false}>
            <div>
              <label htmlFor="login-email" className="text-xs uppercase tracking-widest text-gray-500">Email</label>
              <div className="relative mt-1">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                <input
                  id="login-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="username"
                  className="input-well w-full rounded-button border border-white/[0.08] bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm transition-colors focus:border-primary-500/50 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="text-xs uppercase tracking-widest text-gray-500">Password</label>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                <input
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="input-well w-full rounded-button border border-white/[0.08] bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm transition-colors focus:border-primary-500/50 focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-button border border-accent-rose/20 bg-accent-rose/10 px-3 py-2 text-xs text-accent-rose">
                {error}
              </p>
            )}

            <RippleButton
              type="submit"
              loading={busy}
              disabled={busy}
              className="phys-key w-full rounded-button bg-primary-500 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? 'Signing in…' : 'Enter mission control'}
              {!busy && <ArrowRight className="h-3.5 w-3.5 opacity-70" />}
            </RippleButton>
          </form>

          <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-gray-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-emerald" />
            Offline &amp; self-contained. Demo operator{' '}
            <span className="font-mono text-gray-500">admin@ecomind.ai / admin123</span> — files never leave this machine.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginPage