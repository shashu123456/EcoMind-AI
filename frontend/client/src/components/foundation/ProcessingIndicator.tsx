import { Check } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";

export type ProcessingStage =
  | "upload"
  | "storage"
  | "processing"
  | "schema-generation"
  | "ai-analysis"
  | "streaming"
  | "loading"
  | "progress"
  | "completion";

interface ProcessingIndicatorProps {
  /** Concise, task-specific status supplied by the real operation. */
  label: string;
  /** A measured percentage from the real operation; omit for unknown-duration work. */
  progress?: number;
  /** Stage selects a semantic motion/color treatment, not fabricated progress. */
  stage: ProcessingStage;
  className?: string;
}

export function ProcessingIndicator({
  label,
  progress,
  stage,
  className,
}: ProcessingIndicatorProps) {
  const complete = stage === "completion";
  const measuredProgress = typeof progress === "number" && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress))
    : undefined;
  const rootClassName = className
    ? `processing-indicator ${className}`
    : "processing-indicator";

  if (complete) {
    return (
      <div className={rootClassName} data-stage={stage}>
        <div className="processing-indicator__complete" role="status" aria-label={`${label} complete`}>
          <span>{label}</span>
          <AppIcon icon={Check} size="sm" />
        </div>
      </div>
    );
  }

  const progressLabel = measuredProgress === undefined
    ? `${label} in progress`
    : `${label}: ${Math.round(measuredProgress)}%`;

  return (
    <div className={rootClassName} data-stage={stage} aria-busy="true">
      <span className="processing-indicator__label">{label}</span>
      <div
        className="processing-indicator__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={measuredProgress}
        aria-valuetext={progressLabel}
      >
        <span
          className={measuredProgress === undefined
            ? "processing-indicator__fill is-indeterminate"
            : "processing-indicator__fill"}
          style={measuredProgress === undefined ? undefined : { width: `${measuredProgress}%` }}
        />
      </div>
    </div>
  );
}
