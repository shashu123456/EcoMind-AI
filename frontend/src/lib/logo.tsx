import clsx from 'clsx'

/**
 * EcoMind AI — brand mark.
 * Simple, professional, static (no animation): a clean rounded badge with a
 * single gradient energy bolt. Reads crisp at 18px and 64px alike.
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
        <linearGradient id="em-bolt" x1="24" y1="16" x2="40" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A9FBFF" />
          <stop offset="0.5" stopColor="#5AD6F0" />
          <stop offset="1" stopColor="#4C5FD5" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="15" fill="#0E1420" />
      <rect x="2" y="2" width="60" height="60" rx="15" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="1.5" />

      <path d="M34.5 14.5 21.5 34.5 h7.2 l-2.8 15 12-19.5 h-7.4 z" fill="url(#em-bolt)" />
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
          EcoMind <span className="text-primary-400">AI</span>
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