import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-[var(--line)] bg-[var(--surface)]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

interface PanelProps {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({ title, hint, actions, className, bodyClassName, children }: PanelProps) {
  const hasHeader = Boolean(title || actions);
  return (
    <section className={cn('surface overflow-hidden', className)}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-md font-semibold text-neutral-800">{title}</h3>}
            {hint && <p className="prose-muted mt-0.5 text-xs">{hint}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * A titled block inside a page. Used for anything below the hero so the
 * page keeps a single dominant visual and secondary detail stays subordinate.
 */
export function Section({ title, description, actions, className, children }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold text-neutral-800">{title}</h2>}
            {description && <p className="prose-muted mt-0.5 text-sm">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-[var(--line)]', className)} />;
}

/** Inset area for nested evidence inside a card. */
export function Inset({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-md border border-[var(--line)] bg-[var(--surface-inset)] p-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
