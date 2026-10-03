/** Product mark. Deliberately a wordmark and a bar glyph, not a logo system. */
export function Mark({ word = true }: { word?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
        <rect width="20" height="20" rx="5" fill="var(--brand)" />
        <rect x="5" y="11" width="2.5" height="4" rx="1" fill="var(--brand-ink)" />
        <rect x="8.75" y="8" width="2.5" height="7" rx="1" fill="var(--brand-ink)" opacity="0.8" />
        <rect x="12.5" y="5" width="2.5" height="10" rx="1" fill="var(--brand-ink)" opacity="0.6" />
      </svg>
      {word && (
        <span className="text-md font-semibold tracking-tight text-neutral-800">EcoMind</span>
      )}
    </span>
  );
}
