import clsx from 'clsx'

/**
 * EcoMind AI — brand mark.
 * A unique energy-intelligence chip: a hexagon wafer with circuit traces and
 * a single gradient lightning bolt at its core. Reads crisp at 18px and 64px
 * alike, and adapts to both themes (the wafer follows the panel surface).
 */
export function EcoMindLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-3 -3 70 70"
      fill="none"
      role="img"
      aria-label="EcoMind AI logo"
      className={clsx('select-none drop-shadow-[0_0_10px_rgba(90,214,240,0.25)]', className)}
    >
      <defs>
        <linearGradient id="em-logo" x1="12" y1="4" x2="52" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A9FBFF" />
          <stop offset="0.45" stopColor="#5AD6F0" />
          <stop offset="1" stopColor="#4C5FD5" />
        </linearGradient>
      </defs>

      {/* hexagon wafer */}
      <path
        d="M32 3 L57 17.5 V46.5 L32 61 L7 46.5 V17.5 Z"
        fill="var(--panel2, #171A20)"
        stroke="url(#em-logo)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* circuit traces on the four corner pads */}
      <path
        d="M17 24 V16 h6 M41 16 h6 V24 M47 40 V48 h-6 M23 48 h-6 V40"
        stroke="#5AD6F0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <circle cx="17" cy="24" r="2.4" fill="#A9FBFF" />
      <circle cx="47" cy="40" r="2.4" fill="#A9FBFF" />
      {/* energy bolt */}
      <path d="M35.5 14 22 35 h7.8 l-3.2 15.5 14-21.5 h-8.6 z" fill="url(#em-logo)" />
      {/* inner hairline echo */}
      <path
        d="M32 8 52.5 19.5 V44.5 L32 56 11.5 44.5 V19.5 Z"
        stroke="var(--color-border, rgba(255,255,255,0.08))"
        strokeWidth="1"
        strokeLinejoin="round"
      />
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
          ecoMind <span className="text-primary-400">AI</span>
        </span>
        {sub && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-gray-500">
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