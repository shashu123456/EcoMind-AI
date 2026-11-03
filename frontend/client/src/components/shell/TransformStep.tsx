import { ChevronDown } from "lucide-react";
import type { LiveTransformField, LiveTransformStep } from "@/lib/workspace";
import { TinyTag } from "./AppShell";

interface TransformEvidenceProps {
  field: LiveTransformField;
}

export function TransformEvidence({ field }: TransformEvidenceProps) {
  const unit =
    field.unitBefore || field.unitAfter
      ? `${field.unitBefore || "—"} → ${field.unitAfter || "—"}`
      : "";

  return (
    <div className={`transform-evidence ${field.changed ? "transform-evidence--changed" : ""}`}>
      <span className="transform-evidence__column">{field.column}</span>
      <code>{field.before}</code>
      <ChevronDown size={12} />
      <code>{field.after}</code>
      <span className="mono-note">{unit}</span>
      <TinyTag tone={field.changed ? "blue" : "neutral"}>
        {field.changed ? "changed" : "kept"}
      </TinyTag>
    </div>
  );
}

interface TransformStepProps {
  step: LiveTransformStep;
  index: number;
  open: boolean;
  onToggle: () => void;
}

export function TransformStep({ step, index, open, onToggle }: TransformStepProps) {
  return (
    <div
      className={`transform-step ${open ? "transform-step--open" : ""}`}
      key={step.key}
    >
      <button
        type="button"
        className="transform-step__head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="transform-step__index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <strong>{step.label}</strong>
          <span>{step.purpose}</span>
        </div>
        <div className="transform-step__meta">
          <TinyTag
            tone={step.status === "done" ? "lime" : "neutral"}
          >
            {step.status || "recorded"}
          </TinyTag>
          <span className="mono-note">
            {step.rowsChanged.toLocaleString("en-IN")} rows
          </span>
          <span className="mono-note">{step.columns.length} columns</span>
        </div>
        <ChevronDown
          size={15}
          className={open ? "transform-step__chevron--open" : ""}
        />
      </button>

      {open ? (
        <div className="transform-step__evidence">
          {step.fields.length > 0 ? (
            step.fields.map((field) => (
              <TransformEvidence key={field.column} field={field} />
            ))
          ) : (
            <p className="mono-note table-empty-note">
              No per-column evidence recorded.
            </p>
          )}
          {step.note ? (
            <p className="transform-step__note">{step.note}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
