import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Download,
  FileJson,
  FileText,
  Gauge,
  Layers3,
  Loader2,
  Search,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import "./model-lab.css";
import type { LiveCompetition, LiveModel, LivePoint } from "@/lib/workspace";

/* ────────────────────────────────────────────────────────────────────────────
 * Model selection dashboard.
 *
 * Ranking, metrics and the winner narrative are the records from the model
 * competition stage. Values that stage did not record (per-epoch history,
 * memory, GPU) are shown as "not recorded" rather than invented.
 * ──────────────────────────────────────────────────────────────────────────── */

type Props = {
  models: LiveModel[];
  competition: LiveCompetition | null;
  selectedModel: string;
  setSelectedModel: (name: string) => void;
  signal: LivePoint[];
  unit: string;
  target: string;
  versions: { version: number; rowCount: number; created: string | null }[];
  datasetName: string;
  rowCount: number | null;
};

const fmt = (n: number | null | undefined, digits = 2): string =>
  n == null || !isFinite(n) ? "—" : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(digits);

function useCounter(value: number, duration = 760): number {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (!isFinite(value)) return;
    const from = fromRef.current;
    if (from === value) {
      setShown(value);
      return;
    }
    let raf = 0;
    let settled = false;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        settled = true;
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    const settle = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      fromRef.current = value;
      setShown(value);
    }, duration + 160);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [value, duration]);
  return shown;
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`ml-tag ml-tag--${tone}`}>{children}</span>;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="ml-kpi">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

const METRIC_META: Record<string, { what: string; why: string }> = {
  accuracy: { what: "Share of held-out readings predicted within tolerance.", why: "It is the quickest read on whether the model is usable at all." },
  mae: { what: "Mean absolute error, in the target's unit.", why: "It is the error an operator would actually feel, read directly." },
  rmse: { what: "Root mean squared error.", why: "It punishes large misses, so it exposes unstable forecasts." },
  mse: { what: "Mean squared error (RMSE²).", why: "It is the loss the competition minimises internally." },
  r2: { what: "Variance explained by the model.", why: "It separates a real fit from a flat mean forecast." },
  mape: { what: "Mean absolute percentage error.", why: "It makes error comparable across datasets of different scale." },
  variance: { what: "Explained variance on the held-out split.", why: "It confirms the fit is not an artefact of a single split." },
  train: { what: "Recorded training duration.", why: "It decides how often the model can be retrained." },
  latency: { what: "Time to produce one prediction.", why: "It decides whether the model can sit inside the live pipeline." },
  speed: { what: "Normalised scoring throughput.", why: "It is the speed term the competition used when ranking." },
};

export function ModelLab({
  models,
  competition,
  selectedModel,
  setSelectedModel,
  signal,
  unit,
  target,
  versions,
  datasetName,
  rowCount,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [metric, setMetric] = useState("mae");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"rank" | "r2" | "mae" | "time">("rank");
  const [compareWith, setCompareWith] = useState<string[]>([]);
  const [trainStep, setTrainStep] = useState(0);
  const [pipeOpen, setPipeOpen] = useState<string | null>(null);
  const [feature, setFeature] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const comp = competition;
  const winner = models.find(m => m.selected) ?? models[0] ?? null;
  const active = models.find(m => m.name === selectedModel) ?? winner;
  const bestR2 = models.length ? Math.max(...models.map(m => m.r2)) : null;
  const totalTrain = models.reduce((n, m) => n + (m.trainSeconds ?? 0), 0);
  const datasetRows = comp ? comp.trainRows + comp.testRows : rowCount;

  const animModels = useCounter(models.length);
  const animBest = useCounter(bestR2 ?? 0);
  const animTrain = useCounter(totalTrain);
  const animRows = useCounter(datasetRows ?? 0);

  /* Simulated evaluation sequence over the recorded candidates. */
  useEffect(() => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
    setTrainStep(0);
    const seq = models.length + 1;
    for (let i = 0; i < seq; i++) {
      timers.current.push(window.setTimeout(() => setTrainStep(i + 1), 340 * (i + 1)));
    }
    return () => {
      timers.current.forEach(id => window.clearTimeout(id));
      timers.current = [];
    };
  }, [models.length]);

  const ranked = useMemo(() => {
    const base = [...models];
    const q = search.trim().toLowerCase();
    const filtered = q ? base.filter(m => `${m.name} ${m.family ?? ""} ${m.short}`.toLowerCase().includes(q)) : base;
    const sorted = [...filtered];
    if (sortKey === "r2") sorted.sort((a, b) => b.r2 - a.r2);
    else if (sortKey === "mae") sorted.sort((a, b) => a.mae - b.mae);
    else if (sortKey === "time") sorted.sort((a, b) => (a.trainSeconds ?? Infinity) - (b.trainSeconds ?? Infinity));
    return sorted;
  }, [models, search, sortKey]);

  /* Radar dimensions: every axis is a recorded or directly derived number. */
  const radarData = useMemo(() => {
    const maxTime = Math.max(1, ...models.map(m => m.trainSeconds ?? 0));
    return [
      { axis: "Accuracy", kind: "r2" },
      { axis: "Generalisation", kind: "normRmse" },
      { axis: "Speed", kind: "speed" },
      { axis: "Fit", kind: "r2raw" },
      { axis: "Error stability", kind: "stability" },
      { axis: "Training cost", kind: "cost" },
    ].map(d => {
      const row: Record<string, string | number> = { axis: d.axis };
      models.forEach(m => {
        const speed = m.normalised?.speed ?? 1 - (m.trainSeconds ?? 0) / maxTime;
        const stability = m.rmse > 0 ? Math.max(0, 1 - (m.rmse - m.mae) / m.rmse) : 0;
        const cost = 1 - (m.trainSeconds ?? 0) / maxTime;
        const value =
          d.kind === "r2" ? Math.max(0, Math.min(1, m.normalised?.r2 ?? (m.r2 + 1) / 2)) :
          d.kind === "normRmse" ? Math.max(0, Math.min(1, 1 - (m.normalised?.rmse ?? 0))) :
          d.kind === "speed" ? Math.max(0, Math.min(1, speed)) :
          d.kind === "r2raw" ? Math.max(0, Math.min(1, m.r2)) :
          d.kind === "stability" ? stability : cost;
        row[m.short] = Math.round(value * 100);
      });
      return row;
    });
  }, [models]);

  const visible = [active, ...models.filter(m => compareWith.includes(m.name) && m.name !== active?.name)].filter(Boolean) as LiveModel[];

  /* Score breakdown for the selected model, normalised to 100. */
  const breakdown = useMemo(() => {
    if (!active) return [];
    const maxTime = Math.max(1, ...models.map(m => m.trainSeconds ?? 0));
    const maxMae = Math.max(1, ...models.map(m => m.mae));
    const maxRmse = Math.max(1, ...models.map(m => m.rmse));
    return [
      { label: "Accuracy (R²)", value: Math.max(0, Math.min(100, ((active.r2 + 1) / 2) * 100)) },
      { label: "MAE (inverted)", value: 100 - (active.mae / maxMae) * 100 },
      { label: "RMSE (inverted)", value: 100 - (active.rmse / maxRmse) * 100 },
      { label: "Training time (inverted)", value: 100 - ((active.trainSeconds ?? 0) / maxTime) * 100 },
      { label: "Inference speed", value: (active.normalised?.speed ?? 1) * 100 },
      { label: "Overall composite", value: (active.composite ?? active.score ?? 0) * (active.composite != null && active.composite <= 1 ? 100 : 1) },
    ];
  }, [active, models]);

  /* Residuals from the recorded observed vs baseline series. */
  const residuals = useMemo(
    () => signal.map(p => ({ time: p.time, actual: p.energy, predicted: p.baseline, residual: p.energy - p.baseline })).filter(r => isFinite(r.residual)),
    [signal]
  );

  const residualStats = useMemo(() => {
    if (!residuals.length) return null;
    const errs = residuals.map(r => Math.abs(r.residual));
    const sorted = [...errs].sort((a, b) => a - b);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const std = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    const bins = Array.from({ length: 11 }, (_, i) => ({ x: i, n: 0 }));
    errs.forEach(e => {
      const idx = Math.min(10, Math.floor((e / (sorted[sorted.length - 1] || 1)) * 10));
      bins[idx].n += 1;
    });
    return { mean, std, p50: q(0.5), p95: q(0.95), max: sorted[sorted.length - 1], bins };
  }, [residuals]);

  /* Confidence buckets from the residual size against one sigma. */
  const confidence = useMemo(() => {
    if (!residualStats || !residuals.length) return null;
    const buckets = [
      { label: "High", test: (e: number) => e <= residualStats.std, tone: "good" },
      { label: "Medium", test: (e: number) => e > residualStats.std && e <= residualStats.std * 2, tone: "ok" },
      { label: "Low", test: (e: number) => e > residualStats.std * 2, tone: "risk" },
    ];
    return buckets.map(b => {
      const rows = residuals.filter(r => b.test(Math.abs(r.residual)));
      const avg = rows.length ? rows.reduce((a, r) => a + Math.abs(r.residual), 0) / rows.length : 0;
      return { ...b, count: rows.length, avg };
    });
  }, [residuals, residualStats]);

  const pipeline = useMemo(
    () => [
      { key: "data", label: "Dataset", rows: datasetRows, detail: `${datasetName} · ${comp?.features ?? 0} features` },
      { key: "split", label: "Train split", rows: comp?.trainRows ?? null, detail: `${comp?.trainRows ?? "—"} train / ${comp?.testRows ?? "—"} test` },
      { key: "val", label: "Validation", rows: comp?.testRows ?? null, detail: "held-out split, identical for every candidate" },
      { key: "train", label: "Training", rows: comp?.trainRows ?? null, detail: `${models.length} candidates trained on the same rows` },
      { key: "eval", label: "Evaluation", rows: comp?.testRows ?? null, detail: `scored on ${comp?.target ?? (target || "the target")}` },
      { key: "rank", label: "Ranking", rows: models.length, detail: "ranked by MAE first, then stability" },
      { key: "winner", label: "Winner selected", rows: 1, detail: comp?.winner ?? winner?.name ?? "not recorded" },
    ],
    [datasetName, comp, models.length, datasetRows, winner, target]
  );

  const exports = {
    csv: () => {
      const head = "rank,model,family,r2,mae,rmse,mape,train_seconds,composite,selected\n";
      const body = models.map((m, i) => [i + 1, `"${m.name}"`, m.family ?? "", m.r2, m.mae, m.rmse, m.mape ?? "", m.trainSeconds ?? "", m.composite ?? "", m.selected ? "yes" : "no"].join(",")).join("\n");
      download("model-comparison.csv", "text/csv", head + body);
    },
    json: () =>
      download(
        "model-evaluation.json",
        "application/json",
        JSON.stringify({ dataset: datasetName, target, winner: comp?.winner ?? null, nearTie: comp?.nearTie ?? false, margin: comp?.margin ?? null, models, criteria: comp?.criteria ?? [], lost: comp?.lostCriteria ?? [] }, null, 2)
      ),
    pdf: () => {
      const rows = models.map((m, i) => `<tr><td>${i + 1}</td><td>${m.name}</td><td>${m.r2}</td><td>${m.mae}</td><td>${m.rmse}</td><td>${m.trainSeconds ?? "—"}</td></tr>`).join("");
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`<html><head><title>Model evaluation — ${datasetName}</title><style>body{font-family:system-ui;padding:32px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}small{color:#666}</style></head><body><h1>Model evaluation — ${datasetName}</h1><p><small>Winner: ${comp?.winner ?? "—"} · target: ${target} · near tie: ${comp?.nearTie ? "yes" : "no"}</small></p><table><tr><th>#</th><th>Model</th><th>R²</th><th>MAE</th><th>RMSE</th><th>Train (s)</th></tr>${rows}</table><p><small>${comp?.rationale ?? ""}</small></p></body></html>`);
      w.document.close();
      w.print();
    },
  };

  function download(name: string, type: string, content: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const drawerModel = drawer ? models.find(m => m.name === drawer) ?? null : null;
  const timelineData = models.map((m, i) => ({ name: m.short, composite: m.composite ?? m.score ?? m.r2, r2: m.r2, i: i + 1 }));

  return (
    <div className="view-content ml-page">
      {/* Hero --------------------------------------------------------- */}
      <div className="ml-hero">
        <div>
          <div className="ml-live">
            <span className={`ml-live__dot ${comp ? "ml-live__dot--on" : ""}`} />
            <span>{comp ? "COMPETITION RECORDED" : "AWAITING STAGE 06"}</span>
            <span className="ml-live__sep" />
            <span className="mono-note">{datasetName} · {target || "no target recorded"}</span>
          </div>
          <h1>Same data. Clear winner.</h1>
          <p>Every model is trained on identical data. EcoMind automatically selects the most reliable model using multiple evaluation metrics.</p>
          <div className="ml-hero__kpis">
            <Kpi label="MODELS EVALUATED" value={String(Math.round(animModels))} hint={`${models.filter(m => m.selected).length} selected`} />
            <Kpi label="BEST R²" value={bestR2 == null ? "—" : fmt(animBest, 3)} hint="held-out split" />
            <Kpi label="SELECTED ALGORITHM" value={comp?.winner ?? winner?.name ?? "—"} hint={comp?.nearTie ? "near tie" : "on measured results"} />
          </div>
        </div>
        <div className="ml-hero__actions">
          <button type="button" className="ml-btn" onClick={exports.csv}><Download size={13} /> CSV</button>
          <button type="button" className="ml-btn" onClick={exports.json}><FileJson size={13} /> JSON</button>
          <button type="button" className="ml-btn" onClick={exports.pdf}><FileText size={13} /> PDF</button>
          <button type="button" className="ml-btn ml-btn--primary" onClick={() => setDrawer(winner?.name ?? null)} disabled={!winner}>
            <Gauge size={13} /> Inspect winner
          </button>
        </div>
      </div>


      {/* Leaderboard -------------------------------------------------- */}
      <section className="panel ml-board">
        <div className="ml-head">
          <div>
            <span className="section-eyebrow">MODEL LEADERBOARD</span>
            <h2>{models.length} candidates on one split</h2>
          </div>
          <div className="ml-tools">
            <label className="ml-search">
              <Search size={12} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search models" aria-label="Search models" />
              {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear"><X size={11} /></button> : null}
            </label>
            <button type="button" className="ml-btn ml-btn--small" onClick={() => setSortKey(sortKey === "rank" ? "r2" : sortKey === "r2" ? "mae" : sortKey === "mae" ? "time" : "rank")}>
              Sort: {sortKey}
            </button>
          </div>
        </div>

        {!models.length ? <p className="mono-note">No model competition has been recorded for this dataset yet.</p> : null}

        <div className="ml-cards">
          {ranked.map(model => {
            const index = models.findIndex(m => m.name === model.name);
            const isOpen = expanded === model.name;
            return (
              <article key={model.name} className={`ml-card ${model.selected ? "ml-card--winner" : ""} ${selectedModel === model.name ? "ml-card--active" : ""}`} style={{ animationDelay: `${index * 60}ms` }}>
                <button type="button" className="ml-card__head" onClick={() => { setSelectedModel(model.name); setExpanded(isOpen ? null : model.name); }}>
                  <span className={`ml-rank ${model.selected ? "ml-rank--win" : ""}`}>{model.selected ? <Trophy size={12} /> : `0${index + 1}`}</span>
                  <span className="ml-card__name">
                    <strong>{model.name}</strong>
                    <small>{model.family ?? model.short}{model.selected ? " · selected" : ""}</small>
                  </span>
                  <span className="ml-card__metrics">
                    <span><small>R²</small><strong>{fmt(model.r2, 3)}</strong></span>
                    <span><small>MAE</small><strong>{fmt(model.mae)}</strong></span>
                    <span><small>RMSE</small><strong>{fmt(model.rmse)}</strong></span>
                    <span><small>TRAIN</small><strong>{model.trainSeconds != null ? `${fmt(model.trainSeconds, 2)}s` : "—"}</strong></span>
                  </span>
                  {model.selected ? <Tag tone="lime">promoted</Tag> : <ChevronDown size={13} className={isOpen ? "ml-chev ml-chev--open" : "ml-chev"} />}
                </button>

                {isOpen ? (
                  <div className="ml-card__body">
                    <div className="ml-card__grid">
                      <div><small>ALGORITHM</small><span>{model.family ?? model.name}</span></div>
                      <div><small>COMPOSITE SCORE</small><span>{model.composite != null ? fmt(model.composite, 3) : "—"}</span></div>
                      <div><small>TRAINING TIME</small><span>{model.trainSeconds != null ? `${fmt(model.trainSeconds, 3)} s` : "not recorded"}</span></div>
                      <div><small>PREDICTION SPEED</small><span>{model.normalised?.speed != null ? fmt(model.normalised.speed, 3) : "not recorded"}</span></div>
                      <div><small>MEMORY</small><span>not recorded</span></div>
                      <div><small>MAPE</small><span>{model.mape != null ? `${fmt(model.mape, 2)} %` : "not meaningful"}</span></div>
                      <div><small>FEATURES</small><span>{comp?.features ?? "—"}</span></div>
                      <div><small>DATASET</small><span>{datasetName}</span></div>
                    </div>
                    <button type="button" className="ml-btn ml-btn--small" onClick={() => setDrawer(model.name)}>
                      Open details <ArrowRight size={12} />
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>


      {/* Feature importance ----------------------------------------- */}
      <section className="panel ml-feat">
        <div className="ml-head">
          <div>
            <span className="section-eyebrow">FEATURE IMPORTANCE</span>
            <h2>What drove the winning model</h2>
          </div>
          <Tag tone={comp?.weights?.length ? "lime" : "neutral"}>{comp?.weights?.length ? "recorded weights" : "not recorded"}</Tag>
        </div>
        {comp?.weights?.length ? (
          <>
            <div className="ml-feat__bars">
              {comp.weights.map(w => (
                <button type="button" key={w.label} className={`ml-feat__row ${feature === w.label ? "ml-feat__row--on" : ""}`} onClick={() => setFeature(feature === w.label ? null : w.label)}>
                  <span>{w.label}</span>
                  <div className="ml-feat__track"><i style={{ width: `${(w.weight / Math.max(...comp.weights.map(x => x.weight))) * 100}%` }} /></div>
                  <strong>{fmt(w.weight, 3)}</strong>
                </button>
              ))}
            </div>
            {feature ? (
              <div className="ml-feat__detail">
                <strong>{feature}</strong>
                <p className="mono-note">Weight as recorded by the selection stage: {fmt(comp.weights.find(w => w.label === feature)?.weight ?? 0, 4)}. Distribution and correlation matrix are not recorded per feature.</p>
              </div>
            ) : null}
          </>
        ) : <p className="mono-note">The selection stage did not record feature weights for this run.</p>}
      </section>

      {/* Drawer ------------------------------------------------------ */}
      {drawerModel ? (
        <div className="ml-drawer" role="dialog" aria-modal="true" aria-label={`${drawerModel.name} details`}>
          <div className="ml-drawer__panel">
            <div className="ml-drawer__head">
              <div>
                <span className="section-eyebrow">MODEL DETAILS</span>
                <h2>{drawerModel.name}</h2>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label="Close"><X size={15} /></button>
            </div>
            <div className="ml-drawer__body">
              <div className="ml-drawer__grid">
                <span><small>FAMILY</small>{drawerModel.family ?? drawerModel.short}</span>
                <span><small>RANK</small>#{models.findIndex(m => m.name === drawerModel.name) + 1}</span>
                <span><small>R²</small>{fmt(drawerModel.r2, 4)}</span>
                <span><small>MAE</small>{fmt(drawerModel.mae, 3)}</span>
                <span><small>RMSE</small>{fmt(drawerModel.rmse, 3)}</span>
                <span><small>MAPE</small>{drawerModel.mape != null ? `${fmt(drawerModel.mape, 2)}%` : "n/a"}</span>
                <span><small>COMPOSITE</small>{drawerModel.composite != null ? fmt(drawerModel.composite, 3) : "—"}</span>
                <span><small>TRAINING</small>{drawerModel.trainSeconds != null ? `${fmt(drawerModel.trainSeconds, 3)} s` : "not recorded"}</span>
                <span><small>MEMORY</small>not recorded</span>
                <span><small>CPU / GPU</small>not recorded</span>
                <span><small>VERSION</small>{versions.length ? `v${Math.max(...versions.map(v => v.version))}` : "—"}</span>
                <span><small>CREATED</small>{versions.length && versions[0].created ? new Date(versions[0].created).toLocaleString() : "—"}</span>
              </div>
              <div className="ml-drawer__section">
                <span className="section-eyebrow">HYPERPARAMETERS</span>
                <p className="mono-note">The selection stage records the algorithm and its measured scores, not the full hyperparameter set.</p>
              </div>
              <div className="ml-drawer__section">
                <span className="section-eyebrow">TRAINING HISTORY</span>
                <p className="mono-note">{drawerModel.rationale || "No per-epoch history was recorded for this candidate."}</p>
              </div>
              <div className="ml-drawer__section">
                <span className="section-eyebrow">FEATURE IMPORTANCE</span>
                {comp?.weights?.length ? (
                  <div className="ml-drawer__weights">
                    {comp.weights.slice(0, 6).map(w => <span key={w.label}>{w.label} <em>{fmt(w.weight, 3)}</em></span>)}
                  </div>
                ) : <p className="mono-note">No weights recorded.</p>}
              </div>
            </div>
            <div className="ml-drawer__foot">
              <button type="button" className="ml-btn ml-btn--small" onClick={exports.csv}><Download size={12} /> Export CSV</button>
              <button type="button" className="ml-btn ml-btn--small" onClick={() => { setSelectedModel(drawerModel.name); setDrawer(null); }}>
                <BadgeCheck size={12} /> Select this model
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ModelLab;
