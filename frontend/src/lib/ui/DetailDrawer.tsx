import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../cn';
import { useScrollLock } from './Feedback';

/**
 * A right-hand panel for record-level evidence — a specific anomaly, a
 * specific repaired row, a specific schema column. Keeps the parent page's
 * context visible, which is the whole point: users must be able to trace a
 * number back to the row that produced it.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  width = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--overlay)]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Details'}
        className={cn(
          'relative flex h-full flex-col border-l border-[var(--line)] bg-[var(--surface)]',
          'animate-pipeline-reveal',
          width === 'sm' && 'w-full max-w-sm',
          width === 'md' && 'w-full max-w-lg',
          width === 'lg' && 'w-full max-w-2xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-neutral-800">{title}</h2>
            {subtitle && <p className="prose-muted mt-0.5 text-sm">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-neutral-500 transition-colors hover:bg-[var(--surface-2)] hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-3">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

/** A label/value pair for drawer bodies and detail panels. */
export function DetailRow({
  label,
  children,
  mono,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-[var(--line-faint)] py-2 last:border-0">
      <dt className="shrink-0 text-xs text-neutral-600">{label}</dt>
      <dd className={cn('min-w-0 text-right text-sm text-neutral-800', mono && 'num')}>
        {children}
      </dd>
    </div>
  );
}

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('divide-y divide-transparent', className)}>{children}</dl>;
}
