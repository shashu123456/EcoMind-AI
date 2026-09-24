import { useLocation, useNavigate } from '@tanstack/react-router'
import { Bell, LogOut, Settings, User, Zap, Footprints, Moon, Sun, Cpu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { WORKFLOW } from '../lib/journey'
import { useJourney } from '../lib/journey'
import { useTheme } from '../lib/theme'
import { ExecutionModeToggle } from './ExecutionMode'
import { health, type HealthPayload } from '../lib/api'

function stageForPath(pathname: string) {
  const base = '/' + (pathname.split('/')[1] || '')
  return WORKFLOW.find(s => s.path.split('$')[0] === base || s.path === base)
}

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { datasetId, runId, modelId } = useJourney()
  const mode = useJourney(s => s.mode)
  const { theme, toggleTheme } = useTheme()
  const stage = stageForPath(location.pathname)
  const title = stage?.label || 'Mission Control'
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [backend, setBackend] = useState<HealthPayload | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  let user: any = null
  try { user = JSON.parse(localStorage.getItem('ecomind_user') || 'null') } catch { /* ignore */ }

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const h = await health.check()
        if (!alive) return
        setBackend(h)
        setBackendDown(false)
      } catch {
        if (!alive) return
        setBackend(null)
        setBackendDown(true)
      }
      timer = setTimeout(poll, 5000)
    }
    poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function signOut() {
    localStorage.removeItem('ecomind_token')
    localStorage.removeItem('ecomind_user')
    navigate({ to: '/login' })
  }

  const chips = [
    { label: 'ds', value: datasetId ? datasetId.slice(0, 8) : null, cls: 'text-[#4A9FD8]' },
    { label: 'run', value: runId ? runId.slice(0, 8) : null, cls: 'text-primary-400' },
    { label: 'model', value: modelId ? modelId.slice(0, 8) : null, cls: 'text-[#5B6FE0]' },
  ].filter(c => c.value)

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-surface/50 px-4 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-4">
        <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-gray-100">{title}</h1>
        <span className="hidden items-center gap-2 md:flex">
          {chips.map(c => (
            <span key={c.label} className={clsx('rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] tracking-wider', c.cls)}>
              {c.label}.{c.value}
            </span>
          ))}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={() => {
            setBackend(null)
            setBackendDown(false)
            health.check().then(h => { setBackend(h); setBackendDown(false) }).catch(() => setBackendDown(true))
          }}
          title={
            backendDown
              ? 'Backend unreachable — reconnect to continue'
              : backend
                ? `Backend online · CPU ${backend.system?.cpu_percent ?? '—'}% · Mem ${backend.system?.memory_percent ?? '—'}% · API worker ${backend.system?.python_cpu_percent ?? '—'}%`
                : 'Checking backend…'
          }
          className="group flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 transition-colors hover:bg-white/[0.06]"
        >
          <span className={clsx('relative flex h-2 w-2')}>
            {!backend && !backendDown && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60" />
            )}
            <span className={clsx('relative inline-flex h-2 w-2 rounded-full',
              backendDown ? 'bg-accent-rose' : backend ? 'bg-emerald-400' : 'bg-amber-400')} />
          </span>
          {backend && backend.system && (
            <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-gray-300">
              <Cpu className="w-3 h-3 text-primary-400" />
              {Math.round(backend.system.cpu_percent)}%
            </span>
          )}
          {backendDown && <span className="font-mono text-[10px] tracking-wider text-accent-rose">offline</span>}
        </button>
        <button onClick={toggleTheme} title="Toggle theme" className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-white/[0.03]">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-white/[0.03]">
          <Bell className="w-4 h-4" />
        </button>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className={clsx('p-1.5 rounded-lg transition-colors', open ? 'text-primary-300 bg-white/[0.04]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]')}
          >
            <Settings className="w-4 h-4" />
          </button>
          {open && (
            <div className="absolute right-0 top-9 z-50 w-72 rounded-glass border border-white/[0.08] bg-surface-light/95 p-4 shadow-glass backdrop-blur-xl">
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gray-400">System settings</p>

              <div className="mb-4 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {theme === 'dark' ? <Moon className="h-3.5 w-3.5 text-primary-400" /> : <Sun className="h-3.5 w-3.5 text-accent-gold" />}
                    <p className="text-xs text-gray-300">Appearance</p>
                  </div>
                  <button onClick={toggleTheme}
                    className={clsx('rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors',
                      theme === 'dark'
                        ? 'border-primary-500/40 bg-primary-500/10 text-primary-300'
                        : 'border-white/[0.1] bg-white/[0.03] text-gray-400')}>
                    {theme === 'dark' ? 'Dark' : 'Light'} mode
                  </button>
                </div>
                <p className="text-xs leading-3 text-gray-400">Terminals always stay dark for signal clarity.</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {mode === 'auto' ? <Zap className="h-3.5 w-3.5 text-primary-400" /> : <Footprints className="h-3.5 w-3.5 text-accent-gold" />}
                  <p className="text-xs text-gray-300">Execution mode</p>
                </div>
                <ExecutionModeToggle compact />
                <p className="text-xs leading-3 text-gray-400">
                  Automated runs the pipeline end-to-end; step-by-step walks each stage with your confirmation.
                </p>
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <p className="text-xs leading-3 text-gray-400">Tip: any data table has an CSV export button for a clean copy.</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500/20">
            <User className="w-3.5 h-3.5 text-primary-400" />
          </div>
          {user?.email && <span className="hidden text-xs text-gray-400 lg:block">{user.email}</span>}
        </div>
        <button onClick={signOut} title="Sign out" className="p-1.5 text-gray-400 hover:text-accent-rose transition-colors rounded-lg hover:bg-white/[0.03]">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}