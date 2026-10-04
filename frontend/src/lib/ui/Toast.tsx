import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../cn';

type ToastTone = 'ok' | 'warn' | 'critical' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastCtx {
  push: (tone: ToastTone, title: string, body?: string) => void;
  ok: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
  warn: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

const TONE_STYLE: Record<ToastTone, { color: string; Icon: typeof Info }> = {
  ok: { color: 'var(--ok)', Icon: CheckCircle2 },
  info: { color: 'var(--info)', Icon: Info },
  warn: { color: 'var(--warn)', Icon: AlertTriangle },
  critical: { color: 'var(--critical)', Icon: XCircle },
};

const TTL = 6000;

/**
 * Transient confirmations only. Anything the user must act on belongs in a
 * Callout on the page — a toast that vanishes is not a record of what went
 * wrong with 4,800 repaired rows.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, tone, title, body }]);
      window.setTimeout(() => dismiss(id), TTL);
    },
    [dismiss],
  );

  const value = useMemo<ToastCtx>(
    () => ({
      push,
      ok: (t, b) => push('ok', t, b),
      info: (t, b) => push('info', t, b),
      warn: (t, b) => push('warn', t, b),
      error: (t, b) => push('critical', t, b),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const { color, Icon } = TONE_STYLE[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 shadow-md animate-pipeline-reveal"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-800">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-xs text-neutral-600">{toast.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="shrink-0 text-neutral-500 hover:text-neutral-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

/** A key/value legend. Charts need one when series colour carries meaning. */
export function Legend({
  items,
  className,
  onToggle,
  hidden,
}: {
  items: readonly { label: string; color: string; shape?: 'line' | 'square' }[];
  className?: string;
  onToggle?: (label: string) => void;
  hidden?: readonly string[];
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => {
        const isHidden = hidden?.includes(item.label) ?? false;
        const swatch = (
          <>
            <span
              aria-hidden
              className={cn(
                'shrink-0',
                item.shape === 'square' ? 'h-2.5 w-2.5' : 'h-0.5 w-4 rounded-full',
              )}
              style={{ backgroundColor: item.color }}
            />
            <span className="text-2xs">{item.label}</span>
          </>
        );
        return (
          <li key={item.label} className="flex items-center gap-1.5 text-neutral-700">
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(item.label)}
                className={cn(
                  'flex items-center gap-1.5 rounded transition-opacity hover:opacity-70',
                  isHidden && 'opacity-35',
                )}
                aria-pressed={!isHidden}
              >
                {swatch}
              </button>
            ) : (
              swatch
            )}
          </li>
        );
      })}
    </ul>
  );
}
