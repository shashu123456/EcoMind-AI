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

const STATUS_STYLE: Record<string, { dot: string; text: string }> = {
  ok: { dot: 'bg-accent-emerald', text: 'ok' },
  running: { dot: 'bg-primary-500', text: 'run' },
  warn: { dot: 'bg-accent-gold', text: 'warn' },
  idle: { dot: 'bg-gray-400', text: 'idle' },
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
            Enterprise Activity Monitor
          </h2>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-t-lo">
          live
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1 border-b border-border px-3 py-2">
        {(['All', ...ACTIVITY_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              'rounded-button px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors',
              filter === c
                ? 'bg-primary-500 text-white'
                : 'text-t-lo hover:bg-panel3 hover:text-t-hi',
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
          <ul className="flex flex-col gap-1.5">
            {shown.map((ev) => {
              const status = STATUS_STYLE[ev.status] ?? STATUS_STYLE.idle
              return (
                <li
                  key={ev.id}
                  className="rounded-card border border-border bg-panel px-3 py-2 transition-colors hover:bg-panel2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-[10px] text-t-lo">{fmtTime(ev.at)}</code>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-t-lo">
                        {ev.stage}
                      </span>
                      <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                      <span className="font-mono text-[9px] text-t-lo">{status.text}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-t-hi">{ev.description}</p>
                  <div className="mt-1.5 flex items-center gap-3 border-t border-border/60 pt-1.5 font-mono text-[10px] text-t-lo">
                    <span>
                      rows <span className="text-t-hi">{fmtRows(ev.rows)}</span>
                    </span>
                    <span>
                      dur <span className="text-t-hi">{ev.duration}</span>
                    </span>
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