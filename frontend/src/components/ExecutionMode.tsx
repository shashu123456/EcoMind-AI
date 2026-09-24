import { Zap, Footprints } from 'lucide-react'
import clsx from 'clsx'
import { useJourney, JourneyMode } from '../lib/journey'
import { motion } from 'framer-motion'

const OPTIONS: { key: JourneyMode; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: 'auto', label: 'Automated', icon: Zap, hint: 'Full pipeline runs hands-off and auto-advances stage to stage.' },
  { key: 'manual', label: 'Step-by-step', icon: Footprints, hint: 'Every stage waits for your review — you decide when to continue.' },
]

export function ExecutionModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useJourney()
  return (
    <div className="w-full">
      {!compact && (
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">execution mode</p>
      )}
      <div className="grid grid-cols-2 gap-1.5 rounded-button bg-white/[0.04] p-1">
        {OPTIONS.map((o) => {
          const Icon = o.icon
          const active = mode === o.key
          return (
            <motion.button
              key={o.key}
              onClick={() => setMode(o.key)}
              whileTap={{ scale: 0.97 }}
              title={o.hint}
              className={clsx(
                'inline-flex items-center justify-center gap-1.5 rounded-button px-2 py-1.5 text-xs font-medium transition-all',
                active
                  ? 'bg-gradient-to-r from-primary-500 to-accent-cyan text-white shadow-[0_0_16px_rgba(76,95,213,0.4)]'
                  : 'text-gray-400 hover:text-gray-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label}
            </motion.button>
          )
        })}
      </div>
      <p className={clsx('mt-1.5 leading-3 text-[11px]', compact && 'hidden', mode === 'manual' ? 'text-accent-gold/80' : 'text-gray-400')}>
        {OPTIONS.find(o => o.key === mode)?.hint}
      </p>
    </div>
  )
}