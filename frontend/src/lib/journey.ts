import { create } from 'zustand';

/**
 * The journey: 10 stages across 2 phases.
 *
 * This file is the single source of truth for what exists in the product. The
 * router, the phase navigation, the shell, the API layer and the backend
 * stage registry all derive from it — so a stage cannot exist in the UI and
 * be missing from the pipeline, or vice versa.
 */

export type StageKey =
  | 'library'
  | 'import'
  | 'schema'
  | 'quality'
  | 'transformation'
  | 'model_selection'
  | 'anomaly'
  | 'forecast'
  | 'recommendation'
  | 'report';

export type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'skipped';

export type Phase = 'preparation' | 'decision';

export interface StageDef {
  key: StageKey;
  index: number;
  label: string;
  short: string;
  phase: Phase;
  /** One line describing what the user learns here. Shown in navigation. */
  purpose: string;
  /** Path template. `$datasetId` is the only parameter in this product. */
  path: string;
  /** True when the stage cannot be reached until a prerequisite stage is done. */
  gated: boolean;
  /** The headline question this page answers. Rendered as the page hero. */
  answers: string;
  /**
   * Set when this stage's surface is a tab of another stage's page rather than
   * a page of its own. The action plan is the Action plan tab of the report:
   * the recommendation still runs and still gates the report, it just has no
   * separate URL to navigate away to.
   */
  tab?: 'action-plan';
}

// --- Phases ---------------------------------------------------------------

export const PHASES: { key: Phase; label: string; purpose: string }[] = [
  {
    key: 'preparation',
    label: 'Preparation',
    purpose: 'Establish that the data can be trusted before any conclusion is drawn from it.',
  },
  {
    key: 'decision',
    label: 'Decision',
    purpose: 'Turn trustworthy data into actions: what is wrong, what is coming, what to do.',
  },
];

// --- Stages ---------------------------------------------------------------

/**
 * `satisfies` rather than a type annotation: an annotation would widen every
 * `path` back to `string`, and the router needs the literals to type-check
 * links. `satisfies` validates the same shape while keeping them narrow.
 */
export const STAGES = [
  {
    key: 'library',
    index: 0,
    label: 'Dataset Library',
    short: 'Library',
    phase: 'preparation',
    purpose: 'Choose one energy dataset to analyse.',
    path: '/library',
    gated: false,
    answers: 'Are we working with the right dataset, and is it complete?',
  },
  {
    key: 'import',
    index: 1,
    label: 'Import',
    short: 'Import',
    phase: 'preparation',
    purpose: 'Bring readings into the platform without losing their provenance.',
    path: '/import/$datasetId',
    gated: true,
    answers: 'Did the data arrive intact and in the right shape?',
  },
  {
    key: 'schema',
    index: 2,
    label: 'Schema Discovery',
    short: 'Schema',
    phase: 'preparation',
    purpose: 'Detect structure and surface schema issues for review.',
    path: '/schema/$datasetId',
    gated: true,
    answers: 'Do we understand what each column represents?',
  },
  {
    key: 'quality',
    index: 3,
    label: 'Data Quality',
    short: 'DQ',
    phase: 'preparation',
    purpose: 'Detect and repair quality issues before training or analytics.',
    path: '/quality/$datasetId',
    gated: true,
    answers: 'Can we trust this data enough to draw conclusions?',
  },
  {
    key: 'transformation',
    index: 4,
    label: 'Transformation',
    short: 'Transform',
    phase: 'preparation',
    purpose: 'Statistically normalise features so models compare on equal footing.',
    path: '/transformation/$datasetId',
    gated: true,
    answers: 'Have we prepared the features without leaking information?',
  },
  {
    key: 'model_selection',
    index: 5,
    label: 'Prediction',
    short: 'Predict',
    phase: 'preparation',
    purpose:
      'Train every candidate model, compare them on real metrics, then auto-select the best one to predict demand.',
    path: '/model-selection/$datasetId',
    gated: true,
    answers: 'Which model predicts this building best?',
  },
  {
    key: 'anomaly',
    index: 6,
    label: 'Anomaly Detection',
    short: 'Anomalies',
    phase: 'decision',
    purpose: 'Find equipment behaviour that deviates from its statistical baseline.',
    path: '/anomalies/$datasetId',
    gated: true,
    answers: 'What is wrong now, and where?',
  },
  {
    key: 'forecast',
    index: 7,
    label: 'Forecast',
    short: 'Forecast',
    phase: 'decision',
    purpose: 'Project demand and cost for 24h, 7d, 30d and 12 months.',
    path: '/forecast/$datasetId',
    gated: true,
    answers: 'What is coming, and how much will it cost?',
  },
  {
    key: 'recommendation',
    index: 8,
    label: 'Action plan',
    short: 'Actions',
    phase: 'decision',
    purpose: 'Turn anomalies and forecasts into concrete maintenance and optimisation actions.',
    // The action plan has no page of its own: it is the Action plan tab of the
    // report, so the reader never has to navigate away from the document that
    // tells them what to do. The stage itself still runs and still gates the
    // report -- only its surface moved.
    path: '/report/$datasetId',
    tab: 'action-plan',
    gated: true,
    answers: 'What should we do, and how much can we save?',
  },
  {
    key: 'report',
    index: 9,
    label: 'Organization Report',
    short: 'Report',
    phase: 'decision',
    purpose: 'Package the evidence into a plain-English enterprise report.',
    path: '/report/$datasetId',
    gated: true,
    answers: 'What do we tell management, and on what evidence?',
  },
] as const satisfies readonly StageDef[];

export const TOTAL_STAGES = STAGES.length;

/**
 * Lookup by key.
 *
 * Written as an explicit destructuring of `STAGES` rather than a
 * `fromEntries` fold so each value keeps its literal type — in particular
 * `path` stays `'/quality/$datasetId'` rather than widening to `string`. The
 * router needs those literals to type its links, and a link that points at a
 * stage is then checked against the same registry that defines it.
 *
 * `satisfies` proves every stage is present; the test suite proves each entry
 * still points at its own stage, so reordering `STAGES` cannot silently swap
 * two pages.
 */
const [
  library,
  importStage,
  schema,
  quality,
  transformation,
  modelSelection,
  anomaly,
  forecast,
  recommendation,
  report,
] = STAGES;

/**
 * Shape of a dataset or run id.
 *
 * Used only to locate a dataset parameter on a workspace route, where no
 * `StageDef` declares one. A run id matches too, which is deliberate: it is why
 * the guard then asks the server whether the id resolves, instead of trusting a
 * regex to tell a dataset from a run.
 */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STAGE_BY_KEY = {
  library,
  import: importStage,
  schema,
  quality,
  transformation,
  model_selection: modelSelection,
  anomaly,
  forecast,
  recommendation,
  report,
} as const;

export const STAGE_BY_INDEX: readonly StageDef[] = STAGES;

/** Stage keys, in pipeline order. The backend stage registry mirrors this. */
export const STAGE_KEYS: readonly StageKey[] = STAGES.map((s) => s.key);

export function stagesForPhase(phase: Phase): readonly StageDef[] {
  return STAGES.filter((s) => s.phase === phase);
}

// --- Status helpers -------------------------------------------------------

export type StageStatuses = Partial<Record<StageKey, StageStatus>>;

const TERMINAL_DONE: StageStatus[] = ['done'];

export function isDone(statuses: StageStatuses, key: StageKey): boolean {
  return TERMINAL_DONE.includes(statuses[key] ?? 'pending');
}

export function phaseStatus(
  statuses: StageStatuses,
  phase: Phase,
): 'not-started' | 'in-progress' | 'complete' | 'blocked' {
  const stages = stagesForPhase(phase);
  const states = stages.map((s) => statuses[s.key] ?? 'pending');
  if (states.every((s) => s === 'done')) return 'complete';
  if (states.some((s) => s === 'failed' || s === 'blocked')) return 'blocked';
  if (states.some((s) => s !== 'pending')) return 'in-progress';
  return 'not-started';
}

export interface PhaseProgress {
  done: number;
  total: number;
  pct: number;
}

export function progressStats(statuses: StageStatuses): PhaseProgress {
  const done = STAGES.filter((s) => isDone(statuses, s.key)).length;
  return { done, total: TOTAL_STAGES, pct: Math.round((done / TOTAL_STAGES) * 100) };
}

export function phaseProgress(statuses: StageStatuses, phase: Phase): PhaseProgress {
  const stages = stagesForPhase(phase);
  const done = stages.filter((s) => isDone(statuses, s.key)).length;
  return { done, total: stages.length, pct: Math.round((done / stages.length) * 100) };
}

/**
 * A stage is reachable when every gated prerequisite before it is done.
 *
 * The decision phase is gated on the whole preparation phase, which is the
 * product's core promise: no recommendation is made from data that was never
 * checked.
 */
export function isReachable(stage: StageDef, statuses: StageStatuses): boolean {
  if (!stage.gated) return true;
  return STAGES.slice(0, stage.index).every((prior) => isDone(statuses, prior.key));
}

export function nextStage(statuses: StageStatuses): StageDef | null {
  return STAGES.find((s) => !isDone(statuses, s.key)) ?? null;
}

export function firstIncomplete(
  stages: readonly StageDef[],
  statuses: StageStatuses,
): StageDef | null {
  return stages.find((s) => !isDone(statuses, s.key)) ?? null;
}

/** Human label for a status. Kept here so the shell and the pages agree. */
export const STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Not started',
  running: 'Running',
  done: 'Complete',
  failed: 'Failed',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

// --- Path helpers ---------------------------------------------------------

/**
 * The URL that opens a stage's output.
 *
 * A stage whose surface is a tab of another page carries that tab in a URL
 * fragment, so every existing link to the action plan -- the status stepper,
 * the run bar's "View output", the continue button on the forecast page --
 * lands on the action plan itself instead of on the report's first tab. One
 * rule in one place, rather than each caller having to remember.
 */
export function stagePath(stage: StageDef, datasetId: string | null): string {
  const path = stage.path.replace('$datasetId', datasetId ?? '');
  return stage.tab ? `${path}#${stage.tab}` : path;
}

/**
 * Match a pathname to a stage.
 *
 * Stage paths are exact and `$datasetId` is the only parameter, so this is a
 * lookup rather than a router concern — which means the shell can tell whether
 * the user is inside the product at all (`/`, `/login`) without touching router
 * internals.
 *
 * Two stages can legitimately share a path, because a stage whose surface is a
 * tab of another page has no URL of its own (the action plan lives inside the
 * report). When that happens the owning stage wins: the browser is on the
 * report, so the report's guard, hero and run bar are the correct ones, and the
 * action plan is reached through the tab rather than through the URL.
 */
export function stageForPath(pathname: string): StageKey | null {
  const actual = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const matches = (s: StageDef) => {
    const expected = s.path.split('/').filter(Boolean);
    return (
      expected.length === actual.length &&
      expected.every((seg, i) => seg.startsWith('$') || seg === actual[i])
    );
  };
  return STAGES.find((s) => !('tab' in s) && matches(s))?.key ?? null;
}

/** The `$datasetId` value carried by a stage path, if the path has one. */
export function datasetIdForPath(pathname: string, stage: StageKey | null): string | null {
  const actual = pathname.replace(/\/+$/, '').split('/').filter(Boolean);

  // A stage declares where its parameter sits, so its position is known rather
  // than guessed.
  if (stage) {
    const expected = STAGE_BY_KEY[stage].path.split('/').filter(Boolean);
    const at = expected.findIndex((seg) => seg.startsWith('$'));
    if (at >= 0) return actual[at] ?? null;
    return null;
  }

  // Workspace routes carry a dataset parameter but are not stages, so there is
  // no declaration to read a position from. Returning null here left
  // /explore, /compare and /datasets rendering their own content while the
  // shell believed no dataset was active -- the top bar read "Select a
  // dataset" and the sidebar showed no progress, so a user landing on a shared
  // workspace link got a page with no context around it.
  //
  // Rather than hard-coding the workspace paths, take the first segment shaped
  // like an id. Anything else on these routes is a literal (`analyses`,
  // `library`), so this cannot mistake one for a dataset.
  return actual.find((seg) => UUID_LIKE.test(seg)) ?? null;
}

/**
 * Analytics-ready: every preparation stage is done.
 *
 * This is the product's core promise made checkable. The analytics workspace
 * stays locked until the data has been imported, understood, repaired,
 * transformed and modelled — so no conclusion is drawn from unchecked data.
 */
export function analyticsReady(statuses: StageStatuses): boolean {
  return stagesForPhase('preparation').every((s) => isDone(statuses, s.key));
}

/** Where "Continue" should send the user from a given stage. */
export function continuePath(
  from: StageKey,
  statuses: StageStatuses,
  datasetId: string | null,
): string | null {
  const idx = STAGE_BY_KEY[from]?.index ?? 0;
  const next = STAGES[idx + 1];
  if (!next) return null;
  if (!isReachable(next, statuses)) return null;
  return stagePath(next, datasetId);
}

/**
 * SSE event → status patch. Pure, and unit-tested, because a dropped event
 * here means a page that never leaves "Running".
 */
export function sseStatusPatch(event: unknown): StageStatuses | null {
  if (!event || typeof event !== 'object') return null;
  const ev = event as { type?: unknown; stage_key?: unknown };
  if (typeof ev.type !== 'string') return null;

  switch (ev.type) {
    case 'stage_started':
      return keyPatch(ev.stage_key, 'running');
    case 'stage_completed':
      return keyPatch(ev.stage_key, 'done');
    case 'stage_failed':
      return keyPatch(ev.stage_key, 'failed');
    case 'stage_blocked':
      return keyPatch(ev.stage_key, 'blocked');
    case 'stage_skipped':
      return keyPatch(ev.stage_key, 'skipped');
    default:
      return null;
  }
}

/**
 * A stage key is only trusted when it is a string that names a real stage.
 *
 * Membership is checked against `STAGE_KEYS` rather than `STAGE_BY_KEY`: the
 * lookup table is a plain object, so `STAGE_BY_KEY['__proto__']` would walk the
 * prototype chain, and a frame carrying `__proto__` as a stage key would write
 * a junk entry into the persisted journey.
 */
function keyPatch(stageKey: unknown, status: StageStatus): StageStatuses | null {
  if (typeof stageKey !== 'string') return null;
  if (!STAGE_KEYS.includes(stageKey as StageKey)) return null;
  return { [stageKey as StageKey]: status };
}

/** Build a full status map from a list of completed stage keys. */
export function statusesFromCompleted(completed: readonly string[]): StageStatuses {
  const set = new Set(completed);
  const out: StageStatuses = {};
  for (const stage of STAGES) {
    if (set.has(stage.key)) out[stage.key] = 'done';
    else out[stage.key] = 'pending';
  }
  return out;
}

// --- Store ----------------------------------------------------------------

const STORAGE_KEY = 'ecomind_journey';

interface PersistedJourney {
  activeDatasetId: string | null;
  runId: string | null;
  selectedModelId: string | null;
  stageStatuses: StageStatuses;
}

interface JourneyState extends PersistedJourney {
  /** Bumped whenever a long-running operation changes, so pages can refetch. */
  revision: number;
  setActive: (next: {
    datasetId?: string | null;
    runId?: string | null;
    modelId?: string | null;
  }) => void;
  markStage: (key: StageKey, status: StageStatus) => void;
  markCompleted: (key: StageKey) => void;
  setStatuses: (statuses: StageStatuses) => void;
  reset: () => void;
}

function loadPersisted(): PersistedJourney {
  const empty: PersistedJourney = {
    activeDatasetId: null,
    runId: null,
    selectedModelId: null,
    stageStatuses: {},
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PersistedJourney>;
    return {
      activeDatasetId: parsed.activeDatasetId ?? null,
      runId: parsed.runId ?? null,
      selectedModelId: parsed.selectedModelId ?? null,
      stageStatuses: parsed.stageStatuses ?? {},
    };
  } catch {
    return empty;
  }
}

function persist(state: PersistedJourney) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeDatasetId: state.activeDatasetId,
        runId: state.runId,
        selectedModelId: state.selectedModelId,
        stageStatuses: state.stageStatuses,
      }),
    );
  } catch {
    /* storage unavailable */
  }
}

/**
 * Four values. The old pipeline tracked 15 stages, a mode flag, a refresh
 * token and an auto-drive controller; all of that was ceremony around a
 * product with one dataset, one run and one model in flight at a time.
 */
export const useJourney = create<JourneyState>((set, get) => ({
  ...loadPersisted(),
  revision: 0,

  setActive: (next) =>
    set((state) => {
      const merged: PersistedJourney = {
        activeDatasetId: next.datasetId !== undefined ? next.datasetId : state.activeDatasetId,
        runId: next.runId !== undefined ? next.runId : state.runId,
        selectedModelId: next.modelId !== undefined ? next.modelId : state.selectedModelId,
        stageStatuses: state.stageStatuses,
      };
      // Switching datasets invalidates the run and the selected model — they
      // belong to the previous dataset and must never be read against a new one.
      if (
        next.datasetId !== undefined &&
        next.datasetId !== state.activeDatasetId &&
        next.runId === undefined
      ) {
        merged.runId = null;
        merged.selectedModelId = null;
        merged.stageStatuses = {};
      }
      persist(merged);
      const changed =
        merged.activeDatasetId !== state.activeDatasetId ||
        merged.runId !== state.runId ||
        merged.selectedModelId !== state.selectedModelId;
      return changed ? { ...merged, revision: state.revision + 1 } : state;
    }),

  markStage: (key, status) =>
    set((state) => {
      if (state.stageStatuses[key] === status) return state;
      const next: PersistedJourney = {
        ...state,
        stageStatuses: { ...state.stageStatuses, [key]: status },
      };
      persist(next);
      return { ...next, revision: state.revision + 1 };
    }),

  markCompleted: (key) => get().markStage(key, 'done'),

  setStatuses: (statuses) =>
    set((state) => {
      const next: PersistedJourney = { ...state, stageStatuses: statuses };
      persist(next);
      return { ...next, revision: state.revision + 1 };
    }),

  reset: () =>
    set((state) => {
      const empty: PersistedJourney = {
        activeDatasetId: null,
        runId: null,
        selectedModelId: null,
        stageStatuses: {},
      };
      persist(empty);
      return { ...empty, revision: state.revision + 1 };
    }),
}));

/** Selectors. Read these rather than destructuring the store. */
export const selectActiveDatasetId = (s: JourneyState) => s.activeDatasetId;
export const selectStageStatuses = (s: JourneyState) => s.stageStatuses;
export const selectRevision = (s: JourneyState) => s.revision;
