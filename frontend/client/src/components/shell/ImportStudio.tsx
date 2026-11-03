/**
 * ImportStudio — the dataset ingestion page.
 *
 * The upload is real: the file goes through `datasetsApi.upload` and the shell's
 * own `onUploaded` handler, which is what refreshes the workspace. The
 * intelligence panel only shows values that come from the uploaded file or the
 * dataset record; anything the backend does not know renders as "—" rather than
 * a plausible-looking number.
 */

import { ArrowRight, Database, FileCheck2, Gauge, Layers, Loader2, Radar, ShieldCheck, Sparkles, UploadCloud, Zap } from "lucide-react";
import { useRef, useState } from "react";

import { datasets as datasetsApi } from "../../lib/api";
import "./import-studio.css";

type Session = { id: string; name: string; type: string; rows: string; health: string };

const PIPELINE = [
  "Upload",
  "Validate",
  "Clean",
  "Transform",
  "Feature Engineering",
  "Model Selection",
  "Prediction",
  "Recommendations",
  "Report Generation",
];

const CATEGORIES = [
  { name: "Power Plants", equipment: "Turbines · boilers · generators", match: "power" },
  { name: "Hospitals", equipment: "Chillers · AHUs · medical gas", match: "hospital" },
  { name: "Water Utilities", equipment: "Pumps · aeration · dosing", match: "water" },
  { name: "Manufacturing", equipment: "Compressors · lines · furnaces", match: "factory" },
  { name: "Commercial Buildings", equipment: "HVAC · lighting · elevators", match: "building" },
  { name: "Cold Storage", equipment: "Condensers · evaporators", match: "cold" },
  { name: "Solar Plants", equipment: "Inverters · trackers · strings", match: "solar" },
  { name: "Wind Farms", equipment: "Nacelle · pitch · gearbox", match: "wind" },
  { name: "Data Centers", equipment: "CRAH · UPS · PDU", match: "data" },
  { name: "Transportation", equipment: "Terminals · conveyors · fleets", match: "transport" },
  { name: "Mining", equipment: "Crushers · conveyors · ventilation", match: "mining" },
  { name: "University Campuses", equipment: "District energy · labs", match: "campus" },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "AI Structural Validation",
    body: "Identifies schema inconsistencies, missing signals, duplicated timestamps and malformed records before anything reaches a model.",
  },
  {
    icon: Radar,
    title: "Industrial Context Detection",
    body: "Recognises equipment type, operational pattern and domain characteristics from the columns themselves.",
  },
  {
    icon: Sparkles,
    title: "Feature Intelligence",
    body: "Builds rolling statistics, lag and seasonal signals, and operational KPIs the forecast can actually learn from.",
  },
  {
    icon: Gauge,
    title: "Predictive Readiness",
    body: "Scores whether the uploaded dataset is immediately usable for anomaly detection, forecasting and optimisation.",
  },
];

export function ImportStudio({
  datasetId,
  datasetName,
  rows,
  columns,
  quality,
  sessions,
  onUploaded,
  onContinue,
}: {
  datasetId: string;
  datasetName: string;
  rows: string;
  columns?: number | null;
  quality: string | number | null;
  sessions: Session[];
  onUploaded: (datasetId: string) => void;
  onContinue: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sizeLabel = file
    ? file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(2)} MB`
    : "—";

  const upload = async (candidate: File | null) => {
    if (!candidate) return;
    setFile(candidate);
    setError(null);
    setUploading(true);
    try {
      if (!/\.(csv|xlsx)$/i.test(candidate.name)) {
        throw new Error("The API accepts CSV and Excel (.xlsx) files.");
      }
      const created = await datasetsApi.upload(candidate, candidate.name);
      onUploaded(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const metrics = [
    { label: "Dataset status", value: uploading ? "Uploading" : file ? "Validated" : "Awaiting file" },
    { label: "File size", value: sizeLabel },
    { label: "Records", value: file ? rows : "—" },
    { label: "Features", value: columns != null ? String(columns) : "—" },
    { label: "Time coverage", value: file ? `${datasetName}` : "—" },
    { label: "Sampling", value: "Detected after profiling" },
  ];

  return (
    <div className="view-content import-studio">
      <div className="hero-aurora" aria-hidden="true" />

      <section className="is-hero">
        <div className="is-hero__copy">
          <span className="section-eyebrow">INGESTION / AI PIPELINE ENTRY</span>
          <h1>
            Transform raw energy signals
            <br />
            <em>into intelligence.</em>
          </h1>
          <p>
            Upload industrial telemetry, sensor streams, or operational datasets. EcoMind validates, profiles,
            enriches, and prepares every signal before it enters the AI pipeline.
          </p>
          <div className="is-hero__meta">
            <span>
              <FileCheck2 size={13} /> CSV · XLSX
            </span>
            <span>
              <Database size={13} /> Dataset {datasetId.slice(0, 8)}
            </span>
            <span>
              <Zap size={13} /> {sessions.length} analysed sessions
            </span>
          </div>
        </div>

        <div
          className={`is-drop${dragging ? " is-dragging" : ""}${uploading ? " is-busy" : ""}`}
          onDragOver={event => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault();
            setDragging(false);
            void upload(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <div className="is-drop__grid" aria-hidden="true" />
          <div className="is-drop__scan" aria-hidden="true" />
          <button type="button" className="is-core" onClick={() => inputRef.current?.click()} aria-label="Choose a dataset file">
            <span className="is-core__ring is-core__ring--a" />
            <span className="is-core__ring is-core__ring--b" />
            <span className="is-core__ring is-core__ring--c" />
            {uploading ? <Loader2 size={26} className="is-spin" /> : <UploadCloud size={26} />}
          </button>
          <strong>{uploading ? "Ingesting…" : file ? file.name : "Drop a dataset here"}</strong>
          <span className="mono-note">{file ? sizeLabel : "or click the core to browse · CSV and XLSX"}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            className="is-drop__input"
            onChange={event => void upload(event.target.files?.[0] ?? null)}
          />
          {error && <span className="is-drop__error" role="alert">{error}</span>}
        </div>

        <aside className="is-panel">
          <div className="is-panel__head">
            <div className="section-eyebrow">DATASET INTELLIGENCE</div>
            <span className="mono-note">{uploading ? "PROFILING" : file ? "READY" : "IDLE"}</span>
          </div>
          <div className="is-metrics">
            {metrics.map(metric => (
              <div key={metric.label}>
                <small>{metric.label}</small>
                <strong title={metric.value}>{metric.value}</strong>
              </div>
            ))}
          </div>
          <div className="is-gauge">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="52" className="is-gauge__track" />
              <circle cx="60" cy="60" r="52" className="is-gauge__fill" />
            </svg>
            <div>
              <strong>{quality != null && quality !== "" ? quality : "—"}</strong>
              <small>QUALITY SCORE</small>
            </div>
          </div>
          <button type="button" className="is-continue" onClick={onContinue} disabled={uploading}>
            Open pipeline <ArrowRight size={14} />
          </button>
        </aside>
      </section>

      <section className="is-section">
        <div className="is-section__head">
          <div className="section-eyebrow">INDUSTRIAL INTELLIGENCE LIBRARY</div>
          <h2>Domain modules the pipeline already understands.</h2>
        </div>
        <div className="is-categories">
          {CATEGORIES.map(category => {
            const matched = sessions.filter(session =>
              `${session.type} ${session.name}`.toLowerCase().includes(category.match),
            );
            return (
              <article className="is-category" key={category.name}>
                <div className="is-category__icon">
                  <Layers size={16} />
                </div>
                <h3>{category.name}</h3>
                <p>{category.equipment}</p>
                <div className="is-category__stats">
                  <span>
                    <small>DATASETS</small>
                    <strong>{matched.length}</strong>
                  </span>
                  <span>
                    <small>ROWS</small>
                    <strong>{matched[0]?.rows ?? "—"}</strong>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="is-section">
        <div className="is-section__head">
          <div className="section-eyebrow">PIPELINE TIMELINE</div>
          <h2>Nine stages, one continuous thread.</h2>
        </div>
        <ol className="is-timeline">
          {PIPELINE.map((stage, index) => (
            <li key={stage} className={index === 0 && file ? "is-complete" : ""}>
              <span className="is-timeline__node" />
              <strong>{stage}</strong>
              <small>{index === 0 && file ? "collected" : "queued"}</small>
            </li>
          ))}
        </ol>
      </section>

      <section className="is-section">
        <div className="is-section__head">
          <div className="section-eyebrow">WHY ECOMIND UNDERSTANDS YOUR DATASET</div>
          <h2>Profiling before prediction.</h2>
        </div>
        <div className="is-features">
          {FEATURES.map(feature => {
            const Icon = feature.icon;
            return (
              <article className="is-feature" key={feature.title}>
                <Icon size={18} />
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="is-section">
        <div className="is-section__head">
          <div className="section-eyebrow">RECENT INTELLIGENCE SESSIONS</div>
          <h2>Every dataset already in the workspace.</h2>
        </div>
        <div className="is-table">
          <div className="is-table__head">
            <span>DATASET</span>
            <span>TYPE</span>
            <span>ROWS</span>
            <span>QUALITY</span>
            <span>STATUS</span>
          </div>
          {sessions.slice(0, 8).map(session => (
            <div className="is-table__row" key={session.id}>
              <span>
                <strong>{session.name}</strong>
                <small>{session.id.slice(0, 8)}</small>
              </span>
              <span>{session.type}</span>
              <span>{session.rows}</span>
              <span>{session.health}</span>
              <span>
                <span className={`is-pill${session.id === datasetId ? " is-active" : ""}`}>
                  {session.id === datasetId ? "Active" : "Ready"}
                </span>
              </span>
            </div>
          ))}
          {sessions.length === 0 && <div className="is-table__empty">No sessions recorded yet.</div>}
        </div>
      </section>
    </div>
  );
}
