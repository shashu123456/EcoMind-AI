import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Info, AlertTriangle, Zap } from 'lucide-react'
import clsx from 'clsx'
import { B } from './kit'

let toastId = 0
let subscriber: ((t: Toast) => void) | null = null

export type Toast = { id: number; title: string; detail?: string; kind: 'done' | 'info' | 'error' | 'live' }

export function toast(title: string, detail?: string, kind: Toast['kind'] = 'done') {
  subscriber?.({ id: ++toastId, title, detail, kind })
}

const ICON = {
  done: <Check className="h-3.5 w-3.5 shrink-0 text-[#34D399]" />,
  info: <Info className="h-3.5 w-3.5 shrink-0 text-[#4A9FD8]" />,
  error: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#C2335A]" />,
  live: <Zap className="h-3.5 w-3.5 shrink-0 text-[#D8A648]" />,
}

const BAR = {
  done: 'from-[#34D399]/70',
  info: 'from-[#4A9FD8]/70',
  error: 'from-[#C2335A]/70',
  live: 'from-[#D8A648]/70',
}

export function ToastPane() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    subscriber = t => setToasts(xs => [...xs.slice(-3), t])
    return () => { subscriber = null }
  }, [])

  useEffect(() => {
    if (!toasts.length) return
    const id = window.setTimeout(() => setToasts(xs => xs.slice(1)), 4200)
    return () => window.clearTimeout(id)
  }, [toasts])

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[95] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 32, scale: 0.97 }}
            transition={{ duration: 0.3, ease: B }}
            className={clsx('pointer-events-auto relative overflow-hidden rounded-glass border border-white/[0.09] bg-surface-light/95 p-3 shadow-glass backdrop-blur-xl')}
          >
            <div className={clsx('absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b to-transparent', BAR[t.kind])} />
            <div className="flex items-start gap-2 pl-1.5">
              {ICON[t.kind]}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-100">{t.title}</p>
                {t.detail && <p className="mt-0.5 text-[11px] leading-3 text-gray-400">{t.detail}</p>}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}