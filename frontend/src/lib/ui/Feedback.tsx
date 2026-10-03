import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../cn';

export type CalloutTone = 'neutral' | 'info' | 'ok' | 'warn' | 'critical';

const TONE: Record<CalloutTone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: 'var(--ink-mid)', bg: 'var(--surface-2)', border: 'var(--line)' },
  info: { fg: 'var(--info)', bg: 'var(--info-tint)', border: 'var(--info-line)' },
  ok: { fg: 'var(--ok)', bg: 'var(--ok-tint)', border: 'var(--ok-line)' },
  warn: { fg: 'var(--warn)', bg: 'var(--warn-tint)', border: 'var(--warn-line)' },
  critical: { fg: 'var(--critical)', bg: 'var(--critical-tint)', border: 'var(--critical-line)' },
};

const TONE_LABEL: Record<CalloutTone, string> = {
  neutral: 'Note',
  info: 'Information',
  ok: 'Resolved',
  warn: 'Attention',
  critical: 'Problem',
};

/**
 * A persistent, dismissable explanation. This is where boundary definitions
 * live — DQ vs Transformation, "detected" vs "repaired" — so users stop
 * guessing which page owns what.
 */
export function Callout({
  tone = 'neutral',
  title,
  children,
  onDismiss,
  actions,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children: ReactNode;
  onDismiss?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      role={tone === 'critical' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-md border px-3.5 py-3', className)}
      style={{ backgroundColor: t.bg, borderColor: t.border }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: t.fg }}>
          {title ?? TONE_LABEL[tone]}
        </p>
        <div className="mt-1 text-sm text-neutral-700">{children}</div>
        {actions && <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 text-neutral-500 transition-colors hover:bg-[var(--surface-3)] hover:text-neutral-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Loading placeholder. `lines` reserves the height so the layout doesn't jump. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

export function LoadingState({
  label = 'Loading…',
  lines = 3,
  className,
}: {
  label?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

/**
 * The state a page shows before any work has been run. Must name what is
 * missing and what the user can do — never a bare spinner.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-neutral-500">{icon}</div>}
      <p className="text-md font-semibold text-neutral-800">{title}</p>
      {description && <p className="prose-muted mt-1.5 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline error with a retry affordance. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Callout tone="critical" title={title} className={className}>
      {message}
      {onRetry && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}
    </Callout>
  );
}

/**
 * Locks page scroll while an overlay is open, without the iOS
 * scroll-behind bug that a plain `overflow: hidden` gives you.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [active]);
}
