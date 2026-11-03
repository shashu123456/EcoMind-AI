/**
 * CommandPalette — Ctrl/Cmd+K over the existing navigation.
 *
 * Every entry maps to a real route or to an existing pipeline action; nothing is
 * a placeholder. Datasets are searched by name/id, modules by label and keyword.
 */

import { CornerDownLeft, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import "./command-palette.css";

type Entry = {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  route?: string;
  run?: () => void;
};

const MODULES: Array<{ id: string; label: string; hint: string; keywords?: string }> = [
  { id: "overview", label: "Overview", hint: "Command center", keywords: "home landing dashboard" },
  { id: "library", label: "Data Library", hint: "Datasets", keywords: "datasets files" },
  { id: "import", label: "Import", hint: "Upload a dataset", keywords: "upload csv new dataset" },
  { id: "schema", label: "Schema Discovery", hint: "Column mapping" },
  { id: "quality", label: "Data Quality", hint: "Checks and score" },
  { id: "transform", label: "Transformation", hint: "Feature pipeline" },
  { id: "models", label: "Models", hint: "Train and compare", keywords: "train model ml" },
  { id: "anomalies", label: "Anomaly Detection", hint: "Detected events", keywords: "anomaly detection run" },
  { id: "prediction", label: "Prediction", hint: "Forecasts", keywords: "forecast predict" },
  { id: "recommendations", label: "Recommendations", hint: "Ranked actions", keywords: "actions savings" },
  { id: "reports", label: "Reports", hint: "Generate and export", keywords: "report pdf export" },
  { id: "history", label: "History", hint: "Pipeline runs" },
  { id: "notifications", label: "Notifications", hint: "Alerts" },
  { id: "settings", label: "Settings", hint: "Workspace" },
];

export function CommandPalette({
  datasets,
  onNavigate,
}: {
  datasets: Array<{ id: string; name: string }>;
  onNavigate: (route: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(input|textarea|select)$/i.test(target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(value => !value);
        setQuery("");
        setCursor(0);
      } else if (event.key === "Escape" && open) {
        setOpen(false);
      } else if (!typing && event.key === "/" && !open) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const modules: Entry[] = MODULES.map(module => ({
      id: `module:${module.id}`,
      label: `Go to ${module.label}`,
      hint: module.hint,
      keywords: `${module.label} ${module.keywords ?? ""} ${module.id}`,
      route: module.id,
    }));
    const data: Entry[] = datasets.map(dataset => ({
      id: `dataset:${dataset.id}`,
      label: dataset.name,
      hint: `Dataset · ${dataset.id.slice(0, 8)}`,
      keywords: `${dataset.name} ${dataset.id} dataset`,
      route: "library",
    }));
    return [...modules, ...data];
  }, [datasets]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries.slice(0, 9);
    return entries.filter(entry => entry.keywords.toLowerCase().includes(needle)).slice(0, 9);
  }, [entries, query]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    if (entry.run) entry.run();
    if (entry.route) onNavigate(entry.route);
    setOpen(false);
  };

  return (
    <div className="cp-scrim" role="dialog" aria-modal="true" aria-label="Command palette" onClick={() => setOpen(false)}>
      <div className="cp" onClick={event => event.stopPropagation()}>
        <div className="cp__input">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor(c => Math.min(filtered.length - 1, c + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor(c => Math.max(0, c - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(filtered[cursor]);
              }
            }}
            placeholder="Search modules, datasets, actions…"
            aria-label="Command palette search"
          />
          <button type="button" className="cp__close" onClick={() => setOpen(false)} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="cp__list">
          {filtered.length === 0 && <div className="cp__empty">No match for “{query}”.</div>}
          {filtered.map((entry, index) => (
            <button
              type="button"
              key={entry.id}
              className={`cp__row${index === cursor ? " is-active" : ""}`}
              onMouseEnter={() => setCursor(index)}
              onClick={() => run(entry)}
            >
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.hint}</small>
              </span>
              {index === cursor && <CornerDownLeft size={13} />}
            </button>
          ))}
        </div>
        <div className="cp__foot">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="cp__hint">Ctrl / ⌘ + K</span>
        </div>
      </div>
    </div>
  );
}
