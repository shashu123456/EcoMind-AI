import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Cpu, Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { auth } from '../lib/api'
import { cn } from '../lib/interactive'
import { RippleTransition } from '../lib/interactive'
import { EcoMindLogo } from '../lib/logo'

const DEFAULT_EMAIL = 'admin@ecomind.ai'
const DEFAULT_PASSWORD = 'admin123'

const LOGIN_BACKDROP = [
  'https://images.unsplash.com/photo-1473773508845-0fa24386e380?auto=format&fit=crop&q=80&w=1800',
] as const

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
      <div className="absolute inset-0">
        <RippleTransition
          images={LOGIN_BACKDROP}
          autoPlay
          autoPlayInterval={6000}
          autoPlayOrigin="random"
          borderRadius={0}
          className="absolute inset-0"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/30" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="glass-panel screws relative w-full max-w-md p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EcoMindLogo size={44} />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">EcoMind AI</h1>
              <p className="text-xs text-gray-400">Adaptive Explainable Energy Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('led', busy ? 'led-alert animate-pulse' : 'led-online')} />
            <span className={cn('font-mono text-[10px] uppercase tracking-[0.18em]', busy ? 'text-gray-400' : 'text-green-400')}>
              {busy ? 'handshake…' : 'system on'}
            </span>
          </div>
        </div>

        <form onSubmit={signIn} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-widest">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              className="input-well mt-1 w-full px-3 py-2.5 rounded-button bg-white/[0.04] text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-widest">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="input-well mt-1 w-full px-3 py-2.5 rounded-button bg-white/[0.04] text-sm focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-accent-rose bg-accent-rose/10 border border-accent-rose/20 rounded-button px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="phys-key w-full py-2.5 rounded-button bg-primary-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 flex items-start gap-2 text-[11px] text-gray-500 leading-relaxed">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-accent-emerald shrink-0" />
          Offline &amp; self-contained. Default account <span className="text-gray-400 font-mono">admin@ecomind.ai / admin123</span> — files never leave this machine.
        </p>
      </motion.div>
    </div>
  )
}

export default LoginPage