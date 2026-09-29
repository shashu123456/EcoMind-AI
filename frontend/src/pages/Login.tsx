import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Loader2, LogIn, ShieldCheck, AtSign, Lock } from 'lucide-react'
import { auth } from '../lib/api'
import { EcoMindLogo, EcoMindWordmark } from '../lib/logo'
import { Button } from '../lib/kit'
import { WORKFLOW, MILESTONES } from '../lib/journey'
import { SectionLabel } from '../lib/stagekit'

const shortOf = (key: string) => WORKFLOW.find(w => w.key === key)?.short ?? key

/**
 * Sign-in. The left panel is the product's one-paragraph pitch and the shape
 * of the workflow — so the reader understands EcoMind before they even enter.
 */
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
      setError('Enter both email and password to continue.')
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
        ? 'Cannot reach the EcoMind backend. Start the API service, then try again.'
        : msg)
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full rounded-button border border-border bg-panel2 py-2.5 pl-9 pr-3 text-sm text-t-hi outline-none transition-colors placeholder:text-t-lo focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20'

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="grid w-full max-w-5xl overflow-hidden rounded-card border border-border bg-panel shadow-[var(--shadow-card)] lg:grid-cols-[1.05fr_1fr]"
      >
        {/* ── Left: what EcoMind is and how the work flows ── */}
        <div className="hidden flex-col justify-between gap-9 border-r border-border bg-panel2 p-10 lg:flex">
          <div className="flex items-center gap-3">
            <EcoMindLogo size={40} />
            <div>
              <EcoMindWordmark size={22} />
              <p className="mt-1 text-[12px] text-t-lo">Explainable AI for energy consumption</p>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-semibold leading-snug tracking-tight text-t-hi">
              Turn energy data into decisions you can defend.
            </h1>
            <p className="mt-3 max-w-md text-[13px] leading-6 text-t-mid">
              From raw meter readings to an audit-ready forecast. Every cleaning step, every model and
              every verdict is measured, explained and traceable back to the file it came from.
            </p>
          </div>

          <div>
            <SectionLabel>How the work flows</SectionLabel>
            <ul className="mt-3 space-y-2.5">
              {MILESTONES.map((m, i) => (
                <li key={m.key} className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] text-t-lo">{String(i + 1).padStart(2, '0')}</span>
                  <span className="w-[168px] shrink-0 text-[13px] font-medium text-t-hi">{m.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-t-lo">
                    {m.stages.map(shortOf).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="border-t border-border pt-4 text-[11px] text-t-lo">
            15 recorded stages across 6 milestones · runs entirely on this machine
          </p>
        </div>

        {/* ── Right: the form ── */}
        <div className="p-8 sm:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <EcoMindLogo size={36} />
            <EcoMindWordmark size={20} />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-t-hi">Sign in</h2>
          <p className="mt-1 text-[13px] text-t-lo">
            Your pipeline resumes exactly where you left it.
          </p>

          <form onSubmit={signIn} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                Email
              </label>
              <div className="relative mt-1.5">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t-lo" />
                <input
                  id="login-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="username"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t-lo" />
                <input
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <p className="rounded-button border border-border bg-panel2 px-3 py-2 text-[12px] leading-5 text-accent-rose">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="md" disabled={busy} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 flex items-start gap-2 text-[11px] leading-5 text-t-lo">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-emerald" />
            <span>
              Offline and self-contained — files never leave this machine. Demonstration account{' '}
              <span className="font-mono text-t-mid">admin@ecomind.ai / admin123</span>.
            </span>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginPage
