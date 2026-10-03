import { useId, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '../cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}

/**
 * A small set of mutually exclusive views. This is a *view* switch, not a
 * filter — filters go in FilterBar.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={opt.disabled}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-[5px] font-medium transition-colors disabled:opacity-40',
              size === 'sm' ? 'px-2 py-1 text-2xs' : 'px-2.5 py-1 text-xs',
              active
                ? 'bg-[var(--surface)] text-neutral-800 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-700',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * A native select. A custom listbox buys nothing here and costs keyboard
 * accessibility, focus management and screen-reader behaviour.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  label,
  hint,
  className,
  disabled,
}: {
  value: string | null;
  onChange: (next: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-neutral-700">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-9 w-full appearance-none rounded-md border border-[var(--line-strong)] bg-[var(--surface)]',
            'pl-3 pr-8 text-sm text-neutral-800 transition-colors',
            'hover:border-[var(--ink-faint)] focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-tint-strong)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-neutral-500',
          )}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled} title={opt.hint}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
          aria-hidden
        />
      </div>
      {hint && <p className="mt-1 text-2xs text-neutral-600">{hint}</p>}
    </div>
  );
}

export interface FilterBarProps {
  children?: ReactNode;
  /** Active filters, rendered as removable chips. */
  active?: readonly { key: string; label: string; onClear: () => void }[];
  onClearAll?: () => void;
  results?: ReactNode;
  className?: string;
}

/**
 * The scoping row for a page: which building, which floor, which time window.
 * Active filters stay visible as chips so a user always knows the slice of
 * data they are looking at.
 */
export function FilterBar({ children, active, onClearAll, results, className }: FilterBarProps) {
  const hasChips = Boolean(active?.length);
  return (
    <div className={cn('surface flex flex-col gap-2.5 px-3.5 py-3', className)}>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      {(hasChips || results || onClearAll) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line-faint)] pt-2.5">
          {hasChips &&
            active!.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onClear}
                className="group inline-flex items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-2 py-0.5 text-2xs text-neutral-700 transition-colors hover:border-[var(--ink-faint)] hover:text-neutral-800"
              >
                <span className="text-neutral-600">{chip.label.split(':')[0]}</span>
                <span className="font-medium">
                  {chip.label.split(':').slice(1).join(':').trim()}
                </span>
                <X className="h-3 w-3 opacity-50 group-hover:opacity-100" aria-hidden />
              </button>
            ))}
          {onClearAll && hasChips && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-2xs font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-700"
            >
              Clear all
            </button>
          )}
          {results && <span className="num ml-auto text-2xs text-neutral-600">{results}</span>}
        </div>
      )}
    </div>
  );
}

/** A labelled checkbox. */
export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 text-sm text-neutral-700',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-[var(--line-strong)] text-brand accent-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-tint-strong)]"
      />
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-2xs text-neutral-600">{hint}</span>}
      </span>
    </label>
  );
}

/** A labelled text input. Used wherever a page asks the user to type a value. */
export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  error,
  autoComplete,
  required,
  disabled,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'email' | 'password' | 'number' | 'search';
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const describedBy = hint || error ? `${id}-help` : undefined;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full rounded-md border bg-[var(--surface)] pl-3 pr-3 text-sm text-neutral-800',
          'transition-colors placeholder:text-[var(--ink-faint)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--brand-tint-strong)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-[var(--critical)] focus:border-[var(--critical)]'
            : 'border-[var(--line-strong)] hover:border-[var(--ink-faint)] focus:border-brand',
        )}
      />
      {(hint || error) && (
        <p
          id={describedBy}
          className={cn('mt-1 text-2xs', error ? 'text-critical' : 'text-neutral-600')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Tabs for switching between sibling views of the same data. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  tabs: readonly { value: T; label: ReactNode; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex items-end gap-1 border-b border-[var(--line)]', className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative -mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand text-neutral-800'
                : 'border-transparent text-neutral-600 hover:border-[var(--line-strong)] hover:text-neutral-700',
            )}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className="num ml-1.5 text-2xs text-neutral-600">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
