import { Check } from 'lucide-react';
import { cn } from '../cn';
import { stageStatusColor, stageStatusLabel, type StageStatus } from './Badge';

export interface StepperStep {
  /** Stage key, e.g. `data_quality`. */
  key: string;
  label: string;
  status: StageStatus;
  /** Short consequence line, shown only for the active step. */
  outcome?: string;
}

/**
 * A vertical process list for pages where the *order* is the point — Data
 * Quality's 8 stages, Transformation's 5 steps, Prediction's 5 models.
 *
 * The reveal animation is bound to real completion state, so it reports work
 * rather than performing for it.
 */
export function Stepper({
  steps,
  activeIndex,
  className,
  onSelect,
}: {
  steps: readonly StepperStep[];
  /** Which step to render expanded. */
  activeIndex?: number;
  className?: string;
  onSelect?: (index: number) => void;
}) {
  return (
    <ol className={cn('relative space-y-0', className)}>
      {steps.map((step, i) => {
        const color = stageStatusColor(step.status);
        const isActive = i === activeIndex;
        const isLast = i === steps.length - 1;
        const clickable = Boolean(onSelect);
        return (
          <li
            key={step.key}
            className={cn('relative flex gap-3 pb-4 last:pb-0', isActive && 'pipeline-stage')}
          >
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 bottom-0 w-px"
                style={{ backgroundColor: 'var(--line)' }}
              />
            )}
            <span
              aria-hidden
              className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--surface)]"
              style={{ borderColor: color }}
            >
              {step.status === 'done' ? (
                <Check className="h-3 w-3" style={{ color }} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onSelect?.(i) : undefined}
                  className={cn(
                    'text-sm text-left',
                    isActive ? 'font-semibold text-neutral-800' : 'font-medium text-neutral-700',
                    clickable && 'hover:text-brand',
                  )}
                >
                  {step.label}
                </button>
                <span className="text-2xs font-medium" style={{ color }}>
                  {stageStatusLabel(step.status)}
                </span>
              </div>
              {isActive && step.outcome && (
                <p className="prose-muted mt-1 text-xs">{step.outcome}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Horizontal variant for short fixed sequences, e.g. the 5 model candidates. */
export function StepBar({
  steps,
  className,
}: {
  steps: readonly StepperStep[];
  className?: string;
}) {
  return (
    <ol className={cn('flex items-stretch gap-1', className)}>
      {steps.map((step) => {
        const color = stageStatusColor(step.status);
        return (
          <li
            key={step.key}
            className="min-w-0 flex-1 rounded-md border px-2.5 py-2"
            style={{ borderColor: `${color}44`, backgroundColor: `${color}0f` }}
          >
            <p className="truncate text-2xs font-semibold text-neutral-700">{step.label}</p>
            <p className="num mt-0.5 text-2xs font-medium" style={{ color }}>
              {stageStatusLabel(step.status)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export type { StageStatus };
