import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { AppShell } from './components/AppShell'
import { WORKFLOW, MILESTONES, startWorkflowPolling, useJourney } from './lib/journey'
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

  return (
    <AppShell>
      <ToastPane />
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`root:${location.pathname}`}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
          className="flex h-full flex-col"
        >
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="min-h-full flex-1"
          >
            <Outlet />
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  )
}