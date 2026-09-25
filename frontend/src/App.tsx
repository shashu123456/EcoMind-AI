import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { AppShell } from './components/AppShell'
import { WORKFLOW, MILESTONES, startWorkflowPolling, useJourney } from './lib/journey'
import { PageRipple, firePageRipple } from './lib/kit'
import { ToastPane, toast } from './lib/toast'
import { playStageDone, playJourneyDone, soundEnabled } from './lib/sound'

export function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const statuses = useJourney(s => s.stageStatuses)
  const prevStatuses = useRef<string>('')

  useEffect(() => {
    const sig = JSON.stringify(statuses)
    if (sig === prevStatuses.current) return
    const before = prevStatuses.current ? JSON.parse(prevStatuses.current) as Record<string, string> : {}
    prevStatuses.current = sig
    if (!before || Object.keys(before).length === 0) return
    const freshlyDone = WORKFLOW.filter(s => statuses[s.key] === 'done' && before[s.key] !== 'done')
    if (!freshlyDone.length) return
    freshlyDone.forEach(s => {
      if (soundEnabled()) playStageDone()
      const ms = MILESTONES.find(m => m.stages.includes(s.key))
      toast(`${s.label} complete`, `${ms?.short ?? 'pipeline'} stage passed`, 'done')
    })
    if (WORKFLOW.every(s => statuses[s.key] === 'done')) {
      if (soundEnabled()) playJourneyDone()
      toast('Journey complete', 'All 15 stages passed', 'done')
    }
  }, [statuses])

  useEffect(() => {
    if (!localStorage.getItem('ecomind_token')) {
      navigate({ to: '/login' })
      return
    }
    const stop = startWorkflowPolling()
    return () => stop()
  }, [])

  useEffect(() => {
    firePageRipple({ x: window.innerWidth / 2, y: window.innerHeight * 0.35 })
  }, [location.pathname])

  return (
    <AppShell>
      <PageRipple />
      <ToastPane />
      <AnimatePresence mode="popLayout">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="min-h-full"
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </AppShell>
  )
}