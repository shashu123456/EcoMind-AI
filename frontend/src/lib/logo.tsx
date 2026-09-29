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
      className={clsx('select-none', className)}
    >
      <defs>
        <linearGradient id="em-logo-bolt" x1="24" y1="12" x2="44" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8FA0EE" />
          <stop offset="1" stopColor="#4C5FD5" />
        </linearGradient>
      </defs>

      {/* disc — follows panel surface */}
      <circle cx="32" cy="32" r="27.5" fill="var(--panel2, #171A20)" />
      {/* ring — single brand indigo */}
      <circle cx="32" cy="32" r="27.5" stroke="var(--accent, #4C5FD5)" strokeWidth="2" />
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
      <circle cx="32" cy="4.5" r="1.6" fill="#8FA0EE" />
      <circle cx="32" cy="59.5" r="1.6" fill="var(--accent, #4C5FD5)" />
    </svg>
  )
}

/** Logo + wordmark lockup used by navigation bars. */
export function EcoMindLockup({ size = 26, sub = '', className }: { size?: number; sub?: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <EcoMindLogo size={size} />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-[15px] font-bold tracking-tight text-gray-50">
          ecoMind <span className="text-primary-500">AI</span>
        </span>
        {sub && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-gold/70">
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
            ch === '-' ? 'text-accent-cyan/80' : 'bg-[#0E1420] text-gray-50',
          )}
          style={{ width: ch === '-' ? '0.5em' : '0.78em', height: '1em', fontSize: size - 8, letterSpacing: 0 }}
        >
          {ch}
        </span>
      ))}
    </span>
  )
}