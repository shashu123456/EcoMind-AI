import { STAGE_BY_KEY, WORKFLOW } from './journey'

/* ── The 13-beat product story ─────────────────────────────────────
   Every stage of the pipeline speaks one beat of a single narrative:
   raw energy records become a confident, explainable decision.
   Maps WORKFLOW stages (15 incl. utility) onto the 13 beats.       */

export interface StoryBeat {
  beat: number
  title: string
  chapter: string
}

export const STORY_BEATS: StoryBeat[] = [
  { beat: 1, chapter: 'Raw Data', title: 'Bring your energy records in' },
  { beat: 2, chapter: 'Data Understanding', title: 'The machine reads every field' },
  { beat: 3, chapter: 'Data Quality', title: 'Cleaning, one row at a time' },
  { beat: 4, chapter: 'Transformation', title: 'Raw becomes processed' },
  { beat: 5, chapter: 'Feature Preparation', title: 'Energy signals, engineered' },
  { beat: 6, chapter: 'Prediction', title: 'Models learn head-to-head' },
  { beat: 7, chapter: 'Confidence Evaluation', title: 'Trust before decisions' },
  { beat: 8, chapter: 'Explainability', title: 'Why the model decided' },
  { beat: 9, chapter: 'Anomaly Detection', title: 'Signals that break the trend' },
  { beat: 10, chapter: 'Benchmarking', title: 'Your portfolio, ranked' },
  { beat: 11, chapter: 'Recommendations', title: 'Evidence-backed actions' },
  { beat: 12, chapter: 'Executive Intelligence', title: 'The whole story in one view' },
  { beat: 13, chapter: 'Report', title: 'Audit-ready deliverables' },
]

/* Beats consumed by each stage. Utility stages map onto the nearest beat. */
const BEAT_BY_STAGE: Record<string, number> = {
  library: 1, import: 1, schema_discovery: 2, dq_engine: 3, transformation: 4,
  feature_engineering: 5, prediction: 6, confidence_gate: 7, shap: 8, anomaly: 9,
  benchmarking: 10, recommendation: 11, executive_center: 12, report: 13,
  history_registry: 13,
}

export function beatForStage(key: string): StoryBeat {
  const beat = BEAT_BY_STAGE[key] ?? 1
  return STORY_BEATS[beat - 1] ?? STORY_BEATS[0]
}

/* ── The Stage Story — 5 questions, answered per stage ─────────────
   Every screen ends with a real summary:
   1. What entered?  2. What happened?  3. What was produced?
   4. Why does it matter?  5. What happens next?                     */

export interface StageStory {
  stageKey: string
  entered: string
  happened: string
  produced: string
  matters: string
  next: string
}

export const STAGE_STORIES: StageStory[] = [
  {
    stageKey: 'library',
    entered: 'Nothing yet — the pipeline waits for a dataset.',
    happened: 'The catalog of available energy datasets was loaded.',
    produced: 'A selection of datasets with size, shape and provenance.',
    matters: 'Choosing the right input decides everything downstream.',
    next: 'Pick a dataset and move to Import.',
  },
  {
    stageKey: 'import',
    entered: 'A CSV / Excel energy dataset selected from the library.',
    happened: 'Rows were streamed into the engine and indexed.',
    produced: 'A registered dataset with row/column counts and metadata.',
    matters: 'Captures the raw material the whole analysis will use.',
    next: 'Accept the import and run Schema Discovery.',
  },
  {
    stageKey: 'schema_discovery',
    entered: 'A registered dataset of raw energy readings.',
    happened: 'Every field was profiled — types, roles, nulls, samples.',
    produced: 'A typed column structure with a confidence level per field.',
    matters: 'Correct field meaning drives quality and features later.',
    next: 'Confirm the columns and enter the Data Quality Engine.',
  },
  {
    stageKey: 'dq_engine',
    entered: 'A typed dataset passing through schema discovery.',
    happened: 'Each row was checked across the quality dimensions.',
    produced: 'A quality report with an overall score and per-dimension scores.',
    matters: 'Poor quality would poison the models — this is the gate.',
    next: 'Pass quality checks and transform the dataset.',
  },
  {
    stageKey: 'transformation',
    entered: 'A dataset that passed quality checks.',
    happened: 'Raw values were repaired, normalized and enriched.',
    produced: 'A processed dataset with a transformation log.',
    matters: 'Processed data is what models actually train on.',
    next: 'Engineer features from the processed dataset.',
  },
  {
    stageKey: 'feature_engineering',
    entered: 'A processed, quality-cleaned dataset.',
    happened: 'The engine generated explainable energy features.',
    produced: 'A feature set with expressions and semantic labels.',
    matters: 'Good features let models see the energy patterns.',
    next: 'Train models on the engineered features.',
  },
  {
    stageKey: 'prediction',
    entered: 'Engineered features from the processed dataset.',
    happened: 'Candidate algorithms were trained and evaluated head-to-head.',
    produced: 'Trained models with real performance metrics.',
    matters: 'Model choice defines forecast quality.',
    next: 'Run the Confidence Gate before trusting any model.',
  },
  {
    stageKey: 'confidence_gate',
    entered: 'One or more trained models with metrics.',
    happened: 'An explainable trust score was computed for the decision.',
    produced: 'A confidence evaluation with gate verdict.',
    matters: 'Decisions must only proceed when trust is earned.',
    next: 'Open Prediction Explanation to see the model’s reasons.',
  },
  {
    stageKey: 'shap',
    entered: 'A model that passed the confidence gate.',
    happened: 'Each prediction was traced back to the inputs that drove it.',
    produced: 'A ranked explanation of which inputs drove the outcome.',
    matters: 'Explainability is what separates a black box from a decision.',
    next: 'Detect anomalies that the model may have missed.',
  },
  {
    stageKey: 'anomaly',
    entered: 'The processed dataset and model context.',
    happened: 'The timeline was scanned for abnormal energy events.',
    produced: 'Severity-ranked anomalies with evidence.',
    matters: 'Anomalies are where losses hide.',
    next: 'Benchmark results against the portfolio.',
  },
  {
    stageKey: 'benchmarking',
    entered: 'The model results and dataset context.',
    happened: 'Performance was ranked and compared.',
    produced: 'A benchmark table with percentile standing.',
    matters: 'Context turns metrics into a meaningful verdict.',
    next: 'Generate evidence-backed recommendations.',
  },
  {
    stageKey: 'recommendation',
    entered: 'Benchmark results and anomaly findings.',
    happened: 'The AI consultant synthesized actions with evidence.',
    produced: 'Ranked recommendations with supporting evidence.',
    matters: 'Analysis must end in action, not just insight.',
    next: 'Consolidate everything for the Executive briefing.',
  },
  {
    stageKey: 'executive_center',
    entered: 'All stage results from the full pipeline.',
    happened: 'The whole analysis was consolidated into one briefing.',
    produced: 'A single decision-ready summary of the journey.',
    matters: 'Leadership needs the complete picture to act.',
    next: 'Generate audit-ready reports.',
  },
  {
    stageKey: 'report',
    entered: 'The completed analysis and all stage artifacts.',
    happened: 'Deliverables were assembled with full traceability.',
    produced: 'PDF / HTML / CSV audit-ready reports.',
    matters: 'Results only matter if they can be shared and defended.',
    next: 'Review the History & Model Registry.',
  },
  {
    stageKey: 'history_registry',
    entered: 'Past runs, models and verdicts.',
    happened: 'The registry was indexed for reopening and comparison.',
    produced: 'A searchable history of everything built.',
    matters: 'Every decision stays reproducible.',
    next: 'Reopen any past run, or start a new journey.',
  },
]

export function storyForStage(key: string): StageStory {
  return STAGE_STORIES.find(s => s.stageKey === key) ?? STAGE_STORIES[0]
}

/* All active pipeline stages, in order (utility excluded from the
   progress count but still navigable). */
export const STORY_STAGES = WORKFLOW.map(s => s.key)
export const STORY_LABEL = (key: string) => STAGE_BY_KEY[key]?.label ?? 'Mission Control'
export { STAGE_BY_KEY }