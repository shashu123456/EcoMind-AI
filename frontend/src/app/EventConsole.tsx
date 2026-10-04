import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react';
import { runs } from '../lib/api';
import type { StreamEvent } from '../lib/api/types';
import { STAGE_BY_KEY, useJourney } from '../lib/journey';

export type ConsoleStatus = 'info' | 'running' | 'done' | 'failed' | 'blocked' | 'skipped';

export interface ConsoleEvent {
  id: number;
  at: number;
  type: string;
  status: ConsoleStatus;
  message: string;
  stage?: string;
  durationMs?: number;
}

interface ConsoleInput {
  type: string;
  status: ConsoleStatus;
  message: string;
  stage?: string;
  durationMs?: number;
  at?: number;
}

interface ConsoleCtx {
  events: ConsoleEvent[];
  push: (event: ConsoleInput) => void;
  clear: () => void;
  open: boolean;
  setOpen: (value: boolean) => void;
}

const ConsoleContext = createContext<ConsoleCtx | null>(null);

const MAX_EVENTS = 200;

const STATUS_COLOR: Record<ConsoleStatus, string> = {
  info: 'var(--ink-faint)',
  running: 'var(--brand)',
  done: 'var(--ok)',
  failed: 'var(--critical)',
  blocked: 'var(--warn)',
  skipped: 'var(--ink-faint)',
};

const STATUS_MARK: Record<ConsoleStatus, string> = {
  info: '·',
  running: '▶',
  done: '✓',
  failed: '✕',
  blocked: '!',
  skipped: '–',
};

function statusFor(type: string): ConsoleStatus {
  switch (type) {
    case 'stage_started':
      return 'running';
    case 'stage_completed':
      return 'done';
    case 'stage_failed':
    case 'run_failed':
      return 'failed';
    case 'stage_blocked':
      return 'blocked';
    case 'stage_skipped':
      return 'skipped';
    default:
      return 'info';
  }
}

function stageLabel(stageKey?: string): string {
  if (!stageKey) return 'run';
  const def = STAGE_BY_KEY[stageKey as keyof typeof STAGE_BY_KEY];
  return def ? def.label : stageKey;
}

function messageFor(type: string, stageKey?: string): string {
  const name = stageLabel(stageKey);
  switch (type) {
    case 'run_started':
      return 'Analysis run started.';
    case 'run_completed':
      return 'Analysis run completed.';
    case 'run_failed':
      return 'Analysis run failed.';
    case 'stage_started':
      return `${name} started.`;
    case 'stage_completed':
      return `${name} completed.`;
    case 'stage_failed':
      return `${name} failed.`;
    case 'stage_blocked':
      return `${name} blocked by an earlier stage.`;
    case 'stage_skipped':
      return `${name} skipped.`;
    case 'heartbeat':
      return 'Waiting for activity…';
    default:
      return `${name}: ${type}`;
  }
}

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * The live console at the foot of the workspace.
 *
 * It streams the real events the backend emits over SSE — which stage started,
 * how long it ran, what it decided — so the platform visibly works in real time
 * instead of leaving the user to guess. It opens itself the moment a run starts
 * and stays chronological (oldest at the top, newest at the bottom) like a
 * terminal tail.
 */
export function EventConsoleProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [open, setOpen] = useState(false);
  const idRef = useRef(0);
  const startsRef = useRef<Record<string, number>>({});
  const runId = useJourney((s) => s.runId);

  const push = useCallback((input: ConsoleInput) => {
    const event: ConsoleEvent = {
      id: (idRef.current += 1),
      at: input.at ?? Date.now(),
      type: input.type,
      status: input.status,
      message: input.message,
      stage: input.stage,
      durationMs: input.durationMs,
    };
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!runId) return;
    const unsubscribe = runs.streamRun(
      runId,
      (event: StreamEvent) => {
        const type = typeof event.type === 'string' ? event.type : 'info';
        const stageKey = typeof event.stage_key === 'string' ? event.stage_key : undefined;
        let durationMs: number | undefined;
        if (stageKey) {
          if (type === 'stage_started') {
            startsRef.current[stageKey] = Date.now();
          } else if (type === 'stage_completed' || type === 'stage_failed') {
            const started = startsRef.current[stageKey];
            if (started) {
              durationMs = Date.now() - started;
              delete startsRef.current[stageKey];
            }
          }
        }
        if (type === 'heartbeat') return;
        if (type === 'run_started' || type === 'stage_started') setOpen(true);
        push({
          type,
          status: statusFor(type),
          stage: stageKey,
          durationMs,
          message:
            typeof event.message === 'string' && event.message
              ? event.message
              : messageFor(type, stageKey),
        });
      },
      (message: unknown) => {
        push({
          type: 'stream_error',
          status: 'info',
          message:
            typeof message === 'string'
              ? message
              : 'Progress stream interrupted — falling back to status polling.',
        });
      },
    );
    return unsubscribe;
  }, [runId, push]);

  const value = useMemo<ConsoleCtx>(
    () => ({ events, push, clear, open, setOpen }),
    [events, push, clear, open],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useEventConsole(): ConsoleCtx {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error('useEventConsole must be used within <EventConsoleProvider>');
  return ctx;
}

/** The console bar itself. Placed by the shell at the foot of the main column. */
export function EventConsole() {
  const { events, open, setOpen, clear } = useEventConsole();
  return <ConsoleBar events={events} open={open} onToggle={() => setOpen(!open)} onClear={clear} />;
}

function ConsoleBar({
  events,
  open,
  onToggle,
  onClear,
}: {
  events: ConsoleEvent[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const latest = events[events.length - 1];
  const running = latest?.status === 'running';
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length, open]);

  return (
    <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface-inset)]">
      <div className="flex h-9 items-center gap-3 px-3.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-2xs font-medium text-neutral-600 transition-colors hover:text-neutral-800"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          )}
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          Live console
          {events.length > 0 && (
            <span className="num rounded-full bg-[var(--surface-2)] px-1.5 text-2xs text-neutral-600">
              {events.length}
            </span>
          )}
        </button>
        {running && (
          <span className="flex items-center gap-1.5 text-2xs font-medium text-[var(--brand)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--brand)]"
            />
            live
          </span>
        )}
        {!open && latest && (
          <span className="num min-w-0 flex-1 truncate text-2xs text-neutral-500">
            <span className="text-neutral-600">{clockTime(latest.at)}</span> · {latest.message}
          </span>
        )}
        <div className="flex-1" />
        {events.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear console"
            className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={scrollRef}
          className="h-56 overflow-y-auto border-t border-[var(--line-faint)] bg-[var(--surface-inset)] px-3.5 py-2"
        >
          {events.length === 0 ? (
            <p className="py-6 text-center text-2xs text-neutral-500">
              <span className="text-neutral-600">$</span> waiting for pipeline activity…
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 font-mono text-[11px] leading-5">
              {events.map((event) => (
                <li key={event.id} className="flex items-baseline gap-2.5">
                  <span className="shrink-0 text-neutral-400">{clockTime(event.at)}</span>
                  <span
                    aria-hidden
                    className="shrink-0 font-semibold"
                    style={{ color: STATUS_COLOR[event.status] }}
                  >
                    {STATUS_MARK[event.status]}
                  </span>
                  <span className="w-24 shrink-0 truncate text-neutral-600 sm:w-36">
                    {stageLabel(event.stage)}
                  </span>
                  <span className="min-w-0 flex-1 text-neutral-800">{event.message}</span>
                  {event.durationMs !== undefined && (
                    <span className="shrink-0 text-neutral-400">
                      {(event.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
