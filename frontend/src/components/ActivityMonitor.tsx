import { useMemo, useState } from 'react'
import { PulseDot } from '../lib/kit'
import {
  ACTIVITY_CATEGORIES,
  fmtRows,
  fmtTime,
  useActivityStore,
  type ActivityCategory,
} from '../lib/activity'
import { cn } from '../lib/cn'

const STATUS_STYLE: Record<string, { dot: string; rail: string; text: string }> = {
  ok: { dot: 'bg-accent-emerald', rail: 'bg-accent-emerald/45', text: 'ok' },
  running: { dot: 'bg-primary-500', rail: 'bg-primary-500/45', text: 'run' },
  warn: { dot: 'bg-accent-amber', rail: 'bg-accent-amber/45', text: 'warn' },
  idle: { dot: 'bg-gray-400', rail: 'bg-transparent', text: 'info' },
}

export function ActivityMonitor() {
  const events = useActivityStore((s) => s.events)
  const [filter, setFilter] = useState<ActivityCategory | 'All'>('All')

  const shown = useMemo(
    () => (filter === 'All' ? events : events.filter((e) => e.category === filter)),
    [events, filter],
  )

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border bg-panel/60 backdrop-blur-md xl:flex">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <PulseDot color="bg-accent-emerald" ping="bg-accent-emerald/50" />
          <h2 className="truncate text-[13px] font-semibold tracking-tight text-t-hi">
            Activity
          </h2>
        </div>
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-t-lo">
          live
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-3 py-1.5">
        {(['All', ...ACTIVITY_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              'rounded-button px-2 py-1 text-[11px] font-medium transition-colors',
              filter === c
                ? 'bg-panel3 text-t-hi'
                : 'text-t-lo hover:text-t-hi',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {shown.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 px-4 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-dashed border-border" />
            <p className="text-[11px] leading-relaxed text-t-lo">
              No activity for this filter yet. Events appear as the platform runs.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {shown.map((ev) => {
              const status = STATUS_STYLE[ev.status] ?? STATUS_STYLE.idle
              const hasRows = ev.rows !== '—'
              const hasDur = ev.duration !== '—'
              return (
                <li
                  key={ev.id}
                  className="relative flex gap-2.5 px-2 py-2 transition-colors hover:bg-panel2/60"
                >
                  <span className={cn('absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full', status.rail)} />
                  <code className="w-[52px] shrink-0 pt-px font-mono text-[10px] leading-[1.5] tabular-nums text-t-lo">
                    {fmtTime(ev.at)}
                  </code>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', status.dot)} />
                      <span className="truncate font-mono text-[9.5px] font-medium uppercase tracking-wider text-t-lo">
                        {ev.stage}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] leading-snug text-t-hi" title={ev.description}>
                      {ev.description}
                    </p>
                    {(hasRows || hasDur) && (
                      <p className="mt-0.5 font-mono text-[10px] tabular-nums text-t-lo">
                        {hasRows && <>{fmtRows(ev.rows)} rows</>}
                        {hasRows && hasDur && ' · '}
                        {hasDur && <>{ev.duration}</>}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}