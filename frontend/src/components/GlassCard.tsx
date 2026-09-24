import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  padding?: 'sm' | 'md' | 'lg'
}

export function GlassCard({ children, className, hover = true, padding = 'md' }: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: { duration: 0.15 } } : undefined}
      className={clsx(
        'glass-card',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-6',
        padding === 'lg' && 'p-8',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}
