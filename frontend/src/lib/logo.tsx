import clsx from 'clsx'

/**
 * EcoMind AI — brand mark.
 * A refined energy-intelligence monogram: a single gradient ring around a thin
 * precision bolt. Reads crisp at 18px and 64px alike, and adapts to both themes
 * (the disc follows the panel surface).
 */
export function EcoMindLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="EcoMind AI logo"
      className={clsx('select-none drop-shadow-[0_0_14px_rgba(61,214,140,0.18)]', className)}
    >
      <defs>
        <linearGradient id="em-logo-ring" x1="10" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#42E695" />
          <stop offset="0.55" stopColor="#5D7FFF" />
          <stop offset="1" stopColor="#E0B558" />
        </linearGradient>
        <linearGradient id="em-logo-bolt" x1="24" y1="12" x2="44" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8BF7B4" />
          <stop offset="1" stopColor="#E0B558" />
        </linearGradient>
      </defs>

      {/* disc — follows panel surface */}
      <circle cx="32" cy="32" r="27.5" fill="var(--panel2, #171A20)" />
      {/* ring — emerald → indigo → gold */}
      <circle cx="32" cy="32" r="27.5" stroke="url(#em-logo-ring)" strokeWidth="2" />
      {/* inner hairline echo */}
      <circle cx="32" cy="32" r="22.5" stroke="var(--color-border, rgba(255,255,255,0.08))" strokeWidth="1" />
      {/* bolt — thin, precise */}
      <path
        d="M35 13 20 35 h7 l-2.5 16 14.5-22 h-8 z"
        fill="url(#em-logo-bolt)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* aperture ticks on the ring */}
      <circle cx="32" cy="4.5" r="1.6" fill="#5D7FFF" />
      <circle cx="32" cy="59.5" r="1.6" fill="#42E695" />
    </svg>
  )
}

/** Logo + wordmark lockup used by navigation bars. */
export function EcoMindLockup({ size = 26, sub = 'adaptive · explainable · energy', className }: { size?: number; sub?: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <EcoMindLogo size={size} />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-[15px] font-bold tracking-tight text-gray-50">
          ecoMind <span className="text-accent-gold">AI</span>
        </span>
        {sub && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent-gold/60">
            {sub}
          </span>
        )}
      </span>
    </span>
  )
}

/** Black-block wordmark "ecomind-ai" — one solid tile per letter, echoing the
    chip logo. Prints ONLY the project words, nothing else. */
export function EcoMindWordmark({ size = 26, className }: { size?: number; className?: string }) {
  const letters = [...'ecomind-ai']
  return (
    <span
      className={clsx('flex items-center gap-[3px] font-display', className)}
      aria-label="ecomind-ai"
    >
      {letters.map((ch, i) => (
        <span
          key={i}
          className={clsx(
            'flex items-center justify-center rounded-[3px] border border-white/15',
            ch === '-' ? 'text-accent-cyan/80' : 'bg-[#0E1420] text-gray-50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_0_14px_rgba(76,95,213,0.18)]',
          )}
          style={{ width: ch === '-' ? '0.5em' : '0.78em', height: '1em', fontSize: size - 8, letterSpacing: 0 }}
        >
          {ch}
        </span>
      ))}
    </span>
  )
}