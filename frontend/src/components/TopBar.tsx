import { useLocation, useNavigate } from '@tanstack/react-router'
import { Bell, LogOut, Settings, User, Zap, Footprints, Moon, Sun, Cpu, Home, Check, AlertTriangle, ArrowUpRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { WORKFLOW, MILESTONES, useJourney } from '../lib/journey'
import { useTheme } from '../lib/theme'

import { health, type HealthPayload } from '../lib/api'
import { firePageRipple } from '../lib/kit'
import { EcoMindLockup } from '../lib/logo'

function stageForPath(pathname: string) {
  const base = '/' + (pathname.split('/')[1] || '')
  return WORKFLOW.find(s => s.path.split('$')[0] === base || s.path === base)
}

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { datasetId, runId, modelId } = useJourney()
  const mode = useJourney(s => s.mode)
  const stage = stageForPath(location.pathname)
  const title = stage?.label || 'Mission Control'
  const milestone = stage ? MILESTONES.find(m => m.stages.includes(stage.key)) : null
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [menuRefOpen, setMenuRefOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const [backend, setBackend] = useState<HealthPayload | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  const [seen, setSeen] = useState<Record<string, boolean>>({})
  const lastStatuses = useRef<string>('')
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

  const openStageStatuses = useJourney(s => s.stageStatuses)
  useEffect(() => {
    const sig = JSON.stringify(openStageStatuses)
    if (sig === lastStatuses.current) return
    lastStatuses.current = sig
    const fresh = Object.entries(openStageStatuses)
      .filter(([, st]) => st === 'done' || st === 'locked')
      .filter(([k]) => !seen[k])
    if (fresh.length) {
      setSeen(s => ({ ...s, ...Object.fromEntries(fresh.map(([k]) => [k, true])) }))
    }
  }, [openStageStatuses, seen])

  useEffect(() => {
    if (!menuRefOpen) return
    function onDocClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setMenuRefOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuRefOpen])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (!open) return
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function signOut() {
    localStorage.removeItem('ecomind_token')
    localStorage.removeItem('ecomind_user')
    navigate({ to: '/login' })
  }

  function goHome(ripple = true) {
    if (ripple) firePageRipple({ x: window.innerWidth / 2, y: 40 })
    navigate({ to: '/dashboard' } as any)
  }

  const doneCount = WORKFLOW.filter(s => openStageStatuses[s.key] === 'done').length
  const lockedStages = WORKFLOW.filter(s => openStageStatuses[s.key] === 'locked')

  const notifications = [
    ...Object.entries(openStageStatuses)
      .filter(([, st]) => st === 'done')
      .map(([k]) => ({ id: `done-${k}`, kind: 'done' as const, stage: WORKFLOW.find(s => s.key === k) })),
    ...lockedStages.map(s => ({ id: `locked-${s.key}`, kind: 'locked' as const, stage: s })),
  ].filter(n => n.stage)

  const unseenCount = notifications.filter(n => n.stage && !seen[n.stage.key]).length

  const chips = [
    { label: 'ds', value: datasetId ? datasetId.slice(0, 8) : null, cls: 'text-[#4A9FD8]' },
    { label: 'run', value: runId ? runId.slice(0, 8) : null, cls: 'text-primary-400' },
    { label: 'model', value: modelId ? modelId.slice(0, 8) : null, cls: 'text-[#5B6FE0]' },
  ].filter(c => c.value)

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-surface/60 px-4 backdrop-blur-md">
      {/* brand + active-stage light follows the rail */}
      <div className="flex min-w-0 items-center gap-3">
        <EcoMindLockup size={24} sub={''} className="shrink-0" />
        <span className="h-6 w-px bg-white/[0.08]" />
        <button
          onClick={() => goHome(true)}
          title="Back to the front page"
          className="group flex items-center gap-1.5 rounded-button border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 transition-colors hover:border-primary-500/40 hover:bg-primary-500/10"
        >
          <Home className="h-3.5 w-3.5 text-primary-400 transition-transform group-hover:-translate-y-0.5" />
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-gray-300 sm:inline">front</span>
        </button>
        <div className="flex items-center gap-2">
          <div className={clsx('relative flex h-8 w-8 items-center justify-center rounded-glass border',
            stage ? 'border-primary-500/40 bg-primary-500/10 shadow-[0_0_14px_rgba(76,95,213,0.35)]' : 'border-white/[0.06] bg-white/[0.03]')}>
            {stage ? <ArrowUpRight className="h-4 w-4 text-primary-300" /> : <Settings className="h-4 w-4 text-gray-400" />}
            {openStageStatuses[stage?.key || ''] === 'active' && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-accent-emerald" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-gray-100">{title}</h1>
            {stage && (
              <p className="truncate font-mono text-[10px] uppercase tracking-widest text-gray-500">
                {milestone?.short} › stage {stage.index}/15 {stage.key === 'shap' ? '· needs dataset' : stage.requires === 'dataset' ? '· needs dataset' : stage.requires === 'run' ? '· needs run' : stage.requires === 'model' ? '· needs model' : ''}
              </p>
            )}
          </div>
        </div>
        {stage && (
          <div className="flex items-center gap-1">
            {WORKFLOW.filter(s => s.index < stage.index && openStageStatuses[s.key] === 'done').map(s => (
              <span key={s.key} className="h-1 w-4 rounded-full bg-accent-emerald/70 shadow-[0_0_6px_rgba(74,194,154,0.5)]" />
            ))}
            <span className="h-1 w-4 animate-pulse rounded-full bg-primary-400 shadow-[0_0_8px_rgba(76,95,213,0.6)]" />
            <span className="h-1 w-4 rounded-full bg-white/[0.08]" />
          </div>
        )}
        <span className="hidden items-center gap-2 md:flex">
          {chips.map(c => (
            <span key={c.label} className={clsx('rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] tracking-wider', c.cls)}>
              {c.label}.{c.value}
            </span>
          ))}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
              <Cpu className="h-3 w-3 text-primary-400" />
              {Math.round(backend.system.cpu_percent)}%
            </span>
          )}
          {backendDown && <span className="font-mono text-[10px] tracking-wider text-accent-rose">offline</span>}
        </button>
        <button onClick={toggleTheme} title="Toggle theme" className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-white/[0.03]">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* execution mode — sits beside dark mode, the only place it lives */}
        <div className="hidden items-center gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5 md:flex">
          <button
            onClick={() => useJourney.getState().setMode('auto')}
            className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest transition-all',
              mode === 'auto' ? 'bg-gradient-to-r from-primary-500 to-accent-cyan text-white shadow-[0_0_10px_rgba(76,95,213,0.45)]' : 'text-gray-400 hover:text-gray-200')}
          >
            <Zap className="h-3 w-3" /> auto
          </button>
          <button
            onClick={() => useJourney.getState().setMode('manual')}
            className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest transition-all',
              mode === 'manual' ? 'bg-gradient-to-r from-accent-amber to-primary-500 text-white shadow-[0_0_10px_rgba(216,166,72,0.45)]' : 'text-gray-400 hover:text-gray-200')}
          >
            <Footprints className="h-3 w-3" /> step
          </button>
        </div>

        {/* notifications */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            title="Stage notifications"
            className={clsx('relative p-1.5 transition-colors rounded-lg hover:bg-white/[0.03]', open ? 'text-primary-300' : 'text-gray-400 hover:text-gray-200')}
          >
            <Bell className="w-4 h-4" />
            {notifications.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary-500 text-[8px] font-bold text-white shadow-[0_0_8px_rgba(76,95,213,0.6)]">
                {unseenCount}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 top-9 z-[130] w-80 rounded-glass border border-white/[0.08] bg-surface-light/95 p-3 shadow-glass backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-gray-400">journey pulse</p>
                <span className="font-mono text-[10px] text-gray-500">{doneCount}/{WORKFLOW.length} done</span>
              </div>
              {notifications.length === 0 ? (
                <p className="py-3 text-center text-xs text-gray-500">No completed stages yet. Run the journey to see progress here.</p>
              ) : (
                <div className="max-h-72 space-y-1.5 overflow-y-auto">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={clsx('flex items-center gap-2 rounded-button border px-3 py-2',
                        n.kind === 'done' ? 'border-accent-emerald/20 bg-accent-emerald/[0.06]' : 'border-accent-rose/20 bg-accent-rose/[0.06]')}
                    >
                      {n.kind === 'done'
                        ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-emerald" />
                        : <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-accent-rose" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-gray-200">{n.stage?.label}</p>
                        <p className={clsx('font-mono text-[10px] uppercase tracking-widest', n.kind === 'done' ? 'text-accent-emerald' : 'text-accent-rose')}>
                          {n.kind === 'done' ? 'stage completed' : 'stage errored — check history'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* settings */}
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setMenuRefOpen(o => !o)}
            aria-expanded={menuRefOpen}
            className={clsx('p-1.5 rounded-lg transition-colors', menuRefOpen ? 'text-primary-300 bg-white/[0.04]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]')}
          >
            <Settings className="w-4 h-4" />
          </button>
          {menuRefOpen && (
            <div className="absolute right-0 top-9 z-[130] w-72 rounded-glass border border-white/[0.08] bg-surface-light/95 p-4 shadow-glass backdrop-blur-xl">
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
                <p className="text-xs leading-3 text-gray-400">Terminals follow the theme — dark monitors in dark mode, light ink consoles in light mode.</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary-400" />
                  <p className="text-xs text-gray-300">Pipeline run</p>
                </div>
                <p className="text-xs leading-3 text-gray-400">Use the toggle next to dark mode to switch between automated and step-by-step runs.</p>
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <p className="text-xs leading-3 text-gray-400">Tip: any data table has a CSV export button for a clean copy.</p>
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