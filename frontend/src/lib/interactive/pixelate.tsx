import { cn } from '@/lib/cn'
import { useMemo } from 'react'
import { motion } from 'framer-motion'

/**
 * PixelatedReveal — a data-flow reveal. Cells that have already "passed" the
 * frontier render as sharp, real content; cells ahead of the frontier render
 * as blurred pixel blocks. As `progress` sweeps 0→1 the frontier moves left to
 * right and each block dissolves into real content.
 *
 * Use wherever a pipeline reads a dataset left-to-right (raw→processed,
 * preview, DQ repair) so the user can SEE what has already been consumed
 * (crisp) versus what hasn't been touched yet (indistinguishable).
 */

const PIXEL_CHARS = ['█', '▓', '▒', '░'] as const

export interface PixelatedRevealProps {
  /** The real, sharp content rendered beneath the pixel layer. */
  children: React.ReactNode
  /** 0..1 fraction of the width that has passed the frontier. */
  progress?: number
  /** Number of pixel cells across the revealed strip. */
  columns?: number
  /** Tailwind color class for the pixel blocks. */
  colorClass?: string
  /** Per-mount noise seed so blocks differ. */
  seed?: number
  /** Height in EM so the block layer matches the text height. */
  heightEm?: number
  className?: string
}

export function PixelatedReveal({
  children,
  progress = 0,
  columns = 10,
  colorClass = 'text-slate-400',
  seed = 7,
  heightEm = 1.2,
  className,
}: PixelatedRevealProps) {
  const clamped = Math.min(1, Math.max(0, progress))
  const visible = clamped >= 1

  const blocks = useMemo(
    () =>
      Array.from({ length: columns }, (_, i) => {
        const rand = ((i + seed) * 2654435761) % 4294967296
        return <span key={i}>{PIXEL_CHARS[rand % 4]}</span>
      }),
    [columns, seed],
  )

  return (
    <span className={cn('relative inline-block whitespace-nowrap', className)}>
      {visible ? (
        children
      ) : (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center gap-[0.18em] overflow-hidden blur-[1.2px] select-none',
              colorClass,
            )}
            style={{ fontSize: '0.9em', lineHeight: 1 }}
          >
            {blocks.map((b, i) => (
              <motion.span
                key={i}
                className="inline-block leading-none"
                animate={{ opacity: i / columns <= clamped ? 0 : 1 }}
                transition={{ ease: 'easeInOut', duration: 0.35 }}
              >
                {b}
              </motion.span>
            ))}
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{ height: `${heightEm}em` }}
          />
          {/* Sharp content clipped to the consumed width. */}
          <span
            className="relative inline-block"
            style={{
              clipPath: `inset(0 ${100 - clamped * 100}% 0 0)`,
            }}
          >
            {children}
          </span>
        </>
      )}
    </span>
  )
}