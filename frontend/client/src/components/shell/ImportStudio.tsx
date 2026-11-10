/**
 * ImportStudio — ingestion page.
 *
 * One job: take a CSV/Excel export, post it to `POST /datasets/upload`, and show
 * exactly what the backend returned. No simulated pipeline, no placeholder
 * metrics — if the upload fails the error is shown as recorded.
 */

import { useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";

import { datasets as datasetsApi } from "../../lib/api";
import "./import-studio.css";

type UploadedDataset = {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  domain: string;
};

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function ImportStudio({
  datasetId,
  datasetName,
  rows,
  columns,
  onUploaded,
  onContinue,
}: {
  datasetId: string;
  datasetName: string;
  rows: string;
  columns?: number | null;
  quality?: string | number | null;
  sessions?: Array<{
    id: string;
    name: string;
    type: string;
    rows: string;
    health: string;
    quality?: string | number | null;
    columns?: number | null;
  }>;
  onUploaded: (datasetId: string) => void;
  onContinue: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadedDataset | null>(null);

  const upload = async (candidate: File | null) => {
    if (!candidate) return;
    setFile(candidate);
    setPhase("uploading");
    setError("");
    setResult(null);
    try {
      const res = await datasetsApi.upload(candidate, candidate.name);
      const record = res as unknown as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      if (!id) throw new Error("The API accepted the file but returned no dataset id.");
      const uploaded: UploadedDataset = {
        id,
        name: typeof record.name === "string" ? record.name : candidate.name,
        rowCount: typeof record.row_count === "number" ? record.row_count : 0,
        columnCount: typeof record.column_count === "number" ? record.column_count : 0,
        domain: typeof record.domain === "string" ? record.domain : "detected on ingestion",
      };
      setResult(uploaded);
      setPhase("done");
      onUploaded(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPhase("error");
    }
  };

  const pick = () => inputRef.current?.click();

  return (
    <div className="import-page">
      <section
        className={`blk import-drop ${dragging ? "is-dragging" : ""}`}
        onDragOver={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer?.files?.[0] ?? null);
        }}
      >
        <div className="import-drop__copy">
          <span className="blk-head__eyebrow">DATASET INGESTION</span>
          <h2>Drop a dataset, or choose a file.</h2>
          <p>
            CSV and Excel exports are accepted. The file is stored once, read once, and every later stage works from
            that recorded copy — the upload itself is never edited.
          </p>
          <div className="import-drop__actions">
            <button type="button" className="import-btn import-btn--primary" onClick={pick} disabled={phase === "uploading"}>
              {phase === "uploading" ? <Loader2 size={15} className="import-spin" /> : <UploadCloud size={15} />}
              {phase === "uploading" ? "Uploading…" : "Choose file"}
            </button>
            <button type="button" className="import-btn" onClick={onContinue}>
              Skip to schema <ArrowRight size={14} />
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            hidden
            onChange={event => void upload(event.target.files?.[0] ?? null)}
          />
        </div>

        <div className="import-drop__side">
          <span className="blk-head__eyebrow">CURRENT ACTIVE DATASET</span>
          <strong className="import-drop__name" title={datasetName}>
            {datasetName}
          </strong>
          <div className="blk-tagrow">
            <span className="blk-chip">{rows} rows</span>
            <span className="blk-chip">{columns ?? "—"} fields</span>
            <span className="blk-chip">{datasetId.slice(0, 8)}</span>
          </div>
          <button type="button" className="panel-link" onClick={onContinue}>
            Continue to schema discovery <ArrowRight size={13} />
          </button>
        </div>
      </section>

      <div className="blk-grid blk-grid--2">
        <section className="blk">
          <div className="blk-head">
            <div className="blk-head__copy">
              <span className="blk-head__eyebrow">UPLOAD</span>
              <h2 className="blk-head__title">
                {phase === "idle" ? "No file selected" : file?.name ?? "Uploading"}
              </h2>
              <p className="blk-head__note">
                {phase === "idle"
                  ? "Choose a CSV or Excel file to start ingestion."
                  : phase === "uploading"
                    ? "Posting the file to the ingestion endpoint…"
                    : phase === "error"
                      ? "The API rejected this upload — nothing was stored."
                      : "Stored. The backend returned the dataset below."}
              </p>
            </div>
            {phase === "done" ? <CheckCircle2 size={18} className="import-ok" /> : null}
            {phase === "error" ? <AlertTriangle size={18} className="import-bad" /> : null}
          </div>

          {file ? (
            <div className="import-file">
              <FileSpreadsheet size={16} />
              <span className="import-file__name" title={file.name}>
                {file.name}
              </span>
              <span className="mono-note">{fmtBytes(file.size)}</span>
            </div>
          ) : null}

          {phase === "error" ? <p className="import-error">{error}</p> : null}

          {result ? (
            <div className="blk-rows">
              <div className="blk-row">
                <span>Dataset id</span>
                <strong>{result.id.slice(0, 8)}</strong>
              </div>
              <div className="blk-row">
                <span>Records</span>
                <strong>{result.rowCount.toLocaleString()}</strong>
              </div>
              <div className="blk-row">
                <span>Columns</span>
                <strong>{result.columnCount}</strong>
              </div>
              <div className="blk-row">
                <span>Domain</span>
                <strong>{result.domain}</strong>
              </div>
            </div>
          ) : null}

          {result ? (
            <button type="button" className="import-btn import-btn--primary import-btn--block" onClick={onContinue}>
              Run schema discovery on {result.name.slice(0, 28)}
              <ArrowRight size={14} />
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
