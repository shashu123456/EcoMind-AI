import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { AppShell } from './components/AppShell'
import { startWorkflowPolling } from './lib/journey'
import { PageRipple, firePageRipple } from './lib/kit'
import { ToastPane } from './lib/toast'

export function App() {
  const location = useLocation()
  const navigate = useNavigate()

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
