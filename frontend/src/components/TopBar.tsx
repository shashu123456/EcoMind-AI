import { useLocation, useNavigate } from '@tanstack/react-router'
import { Bell, LogOut, Settings, User, Zap, Footprints, Moon, Sun, Cpu, Home, Check, AlertTriangle, Copy, ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { WORKFLOW, MILESTONES, useJourney, progressStats, PIPELINE_TOTAL, stagePath } from '../lib/journey'
import { useTheme } from '../lib/theme'

import { health, type HealthPayload } from '../lib/api'
import { firePageRipple } from '../lib/kit'
import { EcoMindLockup } from '../lib/logo'

function stageForPath(pathname: string) {
  // Match on the first path segment so parameterized stage templates
  // (/dq/$datasetId) resolve against concrete URLs (/dq/970d…).
  const base = '/' + (pathname.split('/')[1] || '')
  return WORKFLOW.find(s => {
    const root = '/' + (s.path.split('/').filter(Boolean)[0] || '')
    return root === base
  })
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
  // Notifications that existed before this page load count as seen — the
  // badge only surfaces fresh completions from this session.
  const [seen, setSeen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    const statuses = useJourney.getState().stageStatuses
    Object.entries(statuses).forEach(([k, st]) => { if (st === 'done') initial[k] = true })
    return initial
  })
  const [copiedRun, setCopiedRun] = useState(false)
  // Statuses that arrive on the first store hydration are pre-existing —
  // mark them seen so the badge only counts fresh completions this session.
  const hydratedRef = useRef(false)
  let user: any = null
  try { user = JSON.parse(localStorage.getItem('ecomind_user') || 'null') } catch { /* ignore */ }

  function copyRunId() {
    if (!runId) return
    navigator.clipboard?.writeText(runId).catch(() => { /* ignore */ })
    setCopiedRun(true)
    setTimeout(() => setCopiedRun(false), 1600)
  }

  function jumpNext() {
    if (!nextStage) return
    navigate({ to: stagePath(nextStage, { datasetId: datasetId || '', runId: runId || '' }) } as any)
  }

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
  const doneCount = progressStats(openStageStatuses).done
  const lockedStages = WORKFLOW.filter(s => openStageStatuses[s.key] === 'locked')
  const nextStage = stage
    ? WORKFLOW.find(s => !openStageStatuses[s.key] || openStageStatuses[s.key] !== 'done')
    : undefined

  const notifications = [
    ...Object.entries(openStageStatuses)
      .filter(([, st]) => st === 'done')
      .map(([k]) => ({ id: `done-${k}`, kind: 'done' as const, stage: WORKFLOW.find(s => s.key === k) })),
    ...lockedStages.map(s => ({ id: `locked-${s.key}`, kind: 'locked' as const, stage: s })),
  ].filter(n => n.stage)

  const unseenCount = notifications.filter(n => n.stage && !seen[n.stage.key]).length

  useEffect(() => {
    if (hydratedRef.current) return
    if (Object.keys(openStageStatuses).length === 0) return
    hydratedRef.current = true
    // Any status present in the first snapshot predates this session —
    // mark it seen so the badge only counts completions from now on.
    setSeen(s => {
      const next = { ...s }
      Object.keys(openStageStatuses).forEach(k => { next[k] = true })
      return next
    })
  }, [openStageStatuses])

  // mark everything as "seen" only when the popover is actually opened —
  // so the bell badge counts fresh stage completions instead of always showing 0
  useEffect(() => {
    if (!open) return
    setSeen(s => {
      const next = { ...s }
      notifications.forEach(n => { if (n.stage) next[n.stage.key] = true })
      return next
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const chips = [
    { label: 'dataset', value: datasetId ? datasetId.slice(0, 8) : null, title: datasetId ? `Active dataset ${datasetId}` : '' },
    { label: 'run', value: runId ? runId.slice(0, 8) : null, title: runId ? `Active run ${runId}` : '' },
    { label: 'model', value: modelId ? modelId.slice(0, 8) : null, title: modelId ? `Active model ${modelId}` : '' },
  ].filter(c => c.value)

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-panel/80 px-4 backdrop-blur-md">
      {/* brand + active-stage context */}
      <div className="flex min-w-0 items-center gap-3">
        <EcoMindLockup size={24} sub={''} className="shrink-0" />
        <span className="h-6 w-px bg-border" />
        <button
          onClick={() => goHome(true)}
          title="Front page"
          aria-label="Front page"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-button text-t-lo transition-colors hover:bg-panel2 hover:text-t-hi"
        >
          <Home className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className={clsx('relative flex h-8 w-8 items-center justify-center rounded-md border font-mono text-xs font-semibold',
            stage ? 'border-primary-500/30 bg-primary-500/[0.08] text-primary-500' : 'border-border bg-panel2 text-t-lo')}>
            {stage ? stage.index : '—'}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold tracking-tight text-t-hi">{title}</h1>
            {stage && (
              <p className="truncate text-[11px] text-t-lo">
                Stage {stage.index} of {PIPELINE_TOTAL}
                {milestone ? ` · ${milestone.short}` : ''}
              </p>
            )}
          </div>
        </div>
        {stage && (
          <div className="hidden items-center gap-1 xl:flex" aria-hidden>
            {WORKFLOW.map(s => (
              <span
                key={s.key}
                className={clsx('h-1 w-3 rounded-full transition-colors',
                  openStageStatuses[s.key] === 'done'
                    ? 'bg-accent-emerald/70'
                    : s.index === stage.index
                      ? 'bg-primary-500'
                      : 'bg-border')}
              />
            ))}
          </div>
        )}
        <span className="hidden items-center gap-1.5 lg:flex">
          {chips.map(c => (
            <span key={c.label} title={c.title} className="rounded-full bg-panel2 px-2 py-0.5 font-mono text-[11px] tabular-nums text-t-lo">
              {c.label}·{c.value}
            </span>
          ))}
          {runId && (
            <button
              onClick={copyRunId}
              title={copiedRun ? 'Copied!' : 'Copy run id'}
              className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors',
                copiedRun ? 'bg-accent-emerald/10 text-accent-emerald' : 'bg-panel2 text-t-lo hover:text-t-hi')}
            >
              <Copy className="h-3 w-3" /> {copiedRun ? 'copied' : 'copy'}
            </button>
          )}
          {nextStage && nextStage.key !== stage?.key && stage && (
            <button
              onClick={jumpNext}
              disabled={!datasetId}
              title={`Jump to next un-done stage: ${nextStage.label}`}
              className="flex items-center gap-1 rounded-full bg-primary-500/[0.08] px-2 py-0.5 font-mono text-[11px] text-primary-500 transition-colors hover:bg-primary-500/[0.14] disabled:opacity-50"
            >
              <ArrowRight className="h-3 w-3" /> next
            </button>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
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
                ? `Backend online · CPU ${backend.system?.cpu_percent ?? '—'}% · Memory ${backend.system?.memory_percent ?? '—'}%`
                : 'Checking backend…'
          }
          className="flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-panel2"
        >
          <span className={clsx('relative flex h-2 w-2')}>
            {!backend && !backendDown && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-amber/60" />
            )}
            <span className={clsx('relative inline-flex h-2 w-2 rounded-full',
              backendDown ? 'bg-accent-rose' : backend ? 'bg-accent-emerald' : 'bg-accent-amber')} />
          </span>
          {backend && backend.system && (
            <span className="hidden items-center gap-1 font-mono text-[10px] tabular-nums text-t-lo md:flex">
              <Cpu className="h-3 w-3" />
              {Math.round(backend.system.cpu_percent)}%
            </span>
          )}
          {backendDown && <span className="font-mono text-[10px] text-accent-rose">offline</span>}
        </button>
        <button onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme" className="rounded-button p-1.5 text-t-lo transition-colors hover:bg-panel2 hover:text-t-hi">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* execution mode — Smart runs the whole journey, Guided pauses for review */}
        <div className="hidden items-center gap-0.5 rounded-lg bg-panel2 p-0.5 md:flex">
          <button
            onClick={() => useJourney.getState().setMode('auto')}
            title="Smart — run the whole workflow automatically"
            aria-pressed={mode === 'auto'}
            className={clsx('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
              mode === 'auto' ? 'bg-panel text-t-hi shadow-sm' : 'text-t-lo hover:text-t-mid')}
          >
            <Zap className="h-3 w-3" /> Smart
          </button>
          <button
            onClick={() => useJourney.getState().setMode('manual')}
            title="Guided — pause at each stage for review, continue when you decide"
            aria-pressed={mode === 'manual'}
            className={clsx('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
              mode === 'manual' ? 'bg-panel text-t-hi shadow-sm' : 'text-t-lo hover:text-t-mid')}
          >
            <Footprints className="h-3 w-3" /> Guided
          </button>
        </div>

        {/* notifications */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            title="Stage notifications"
            aria-label={`Notifications${unseenCount ? ` — ${unseenCount} unseen` : ''}`}
            aria-expanded={open}
            className={clsx('relative rounded-button p-1.5 transition-colors hover:bg-panel2', open ? 'text-t-hi' : 'text-t-lo hover:text-t-hi')}
          >
            <Bell className="h-4 w-4" />
            {unseenCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary-500 text-[8px] font-bold text-white">
                {unseenCount}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 top-9 z-[300] w-80 rounded-card border border-border bg-panel p-3 shadow-[var(--shadow-floating)]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-semibold text-t-hi">Activity</p>
                <span className="font-mono text-[10px] tabular-nums text-t-lo">{doneCount}/{PIPELINE_TOTAL} stages done</span>
              </div>
              {notifications.length === 0 ? (
                <p className="py-3 text-center text-xs text-t-lo">No completed stages yet. Run the journey to see progress here.</p>
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={clsx('flex items-center gap-2 rounded-button px-2.5 py-2',
                        n.kind === 'done' ? 'bg-accent-emerald/[0.07]' : 'bg-accent-rose/[0.07]')}
                    >
                      {n.kind === 'done'
                        ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-emerald" />
                        : <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-accent-rose" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-t-hi">{n.stage?.label}</p>
                        <p className={clsx('text-[11px]', n.kind === 'done' ? 'text-accent-emerald' : 'text-accent-rose')}>
                          {n.kind === 'done' ? 'Completed' : 'Needs attention'}
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
            aria-label="Settings"
            className={clsx('rounded-button p-1.5 transition-colors hover:bg-panel2', menuRefOpen ? 'text-t-hi' : 'text-t-lo hover:text-t-hi')}
          >
            <Settings className="h-4 w-4" />
          </button>
          {menuRefOpen && (
            <div className="absolute right-0 top-9 z-[300] w-72 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-floating)]">
              <p className="mb-3 text-[12px] font-semibold text-t-hi">Settings</p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {theme === 'dark' ? <Moon className="h-3.5 w-3.5 text-t-mid" /> : <Sun className="h-3.5 w-3.5 text-t-mid" />}
                    <p className="text-xs text-t-mid">Theme</p>
                  </div>
                  <button onClick={toggleTheme}
                    className="rounded-full bg-panel2 px-3 py-1 text-xs font-medium text-t-mid transition-colors hover:text-t-hi">
                    {theme === 'dark' ? 'Dark' : 'Light'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-t-mid" />
                    <p className="text-xs text-t-mid">Execution mode</p>
                  </div>
                  <span className="text-xs font-medium text-t-hi">{mode === 'auto' ? 'Smart' : 'Guided'}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-t-lo">
                  {mode === 'auto'
                    ? 'Smart runs every stage automatically — you audit the evidence after.'
                    : 'Guided pauses at each stage so you can review before continuing.'}
                </p>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[11px] leading-relaxed text-t-lo">Every data table has a CSV export for a clean copy of the underlying records.</p>
              </div>
            </div>
          )}
        </div>
        <div className="ml-1 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500/[0.12]">
            <User className="h-3.5 w-3.5 text-primary-500" />
          </div>
          {user?.email && <span className="hidden text-xs text-t-mid lg:block">{user.email}</span>}
        </div>
        <button onClick={signOut} title="Sign out" aria-label="Sign out" className="rounded-button p-1.5 text-t-lo transition-colors hover:bg-panel2 hover:text-accent-rose">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
