import { create } from 'zustand'
import { datasets, models, streamWorkflow, workflows } from './api'
import { toast } from './toast'

/* ── Workflow definition (single source of truth) ────── */
export type StageStatus = 'done' | 'active' | 'todo' | 'locked'

export interface WorkflowStage {
  key: string
  index: number
  label: string
  short: string
  description: string
  path: string // template with placeholders {datasetId} {runId} {modelId}
  requires: 'dataset' | 'run' | 'model' | 'none'
  inspect?: boolean // pause for user inspection before auto-advance
}

export const WORKFLOW: WorkflowStage[] = [
  { index: 1, key: 'library', label: 'Dataset Library', short: 'Library', description: 'Choose an energy dataset to begin the journey.', path: '/library', requires: 'none' },
  { index: 2, key: 'import', label: 'Import Dataset', short: 'Import', description: 'Stream CSV / Excel rows into EcoMind.', path: '/import/$datasetId', requires: 'dataset' },
  { index: 3, key: 'schema_discovery', label: 'Column Discovery', short: 'Column Discovery', description: 'Detect what each column means — type, role and confidence.', path: '/schema/$datasetId', requires: 'dataset' },
  { index: 4, key: 'dq_engine', label: 'Data Quality Engine', short: 'Quality Engine', description: 'Row-by-row repair across 12 quality rules.', path: '/dq/$datasetId', requires: 'dataset', inspect: true },
  { index: 5, key: 'transformation', label: 'Transformation Viewer', short: 'Transformations', description: 'Raw → Processed with a live transformation log.', path: '/transformations/$datasetId', requires: 'dataset' },
  { index: 6, key: 'feature_engineering', label: 'Feature Preparation', short: 'Features', description: 'Raw columns become machine-learning inputs — each with a reason.', path: '/features/$datasetId', requires: 'dataset' },
  { index: 7, key: 'prediction', label: 'Prediction Engine', short: 'Prediction', description: 'Train models head-to-head — watch them learn.', path: '/prediction/$datasetId', requires: 'dataset', inspect: true },
  { index: 8, key: 'confidence_gate', label: 'AI Confidence Gate', short: 'Trust Gate', description: 'Explainable trust score before decisions are made.', path: '/confidence/$runId', requires: 'run', inspect: true },
  { index: 9, key: 'shap', label: 'Prediction Explanation', short: 'Explanation', description: 'Why did the model decide what it decided?', path: '/shap/$modelId', requires: 'model' },
  { index: 10, key: 'anomaly', label: 'Anomaly Detection', short: 'Anomalies', description: 'Timeline scan for energy anomalies, severity ranked.', path: '/anomalies/$datasetId', requires: 'dataset' },
  { index: 11, key: 'benchmarking', label: 'Benchmarking', short: 'Benchmarks', description: 'Model / portfolio comparison and percentile ranking.', path: '/benchmarks/$datasetId', requires: 'dataset' },
  { index: 12, key: 'recommendation', label: 'Recommendation Engine', short: 'Recommendations', description: 'AI consultant presents evidence-backed actions.', path: '/recommendations/$datasetId', requires: 'dataset' },
  { index: 13, key: 'executive_center', label: 'Executive Intelligence Center', short: 'Executive', description: 'CEO briefing — the whole analysis in one view.', path: '/executive', requires: 'none' },
  { index: 14, key: 'report', label: 'Report Generation', short: 'Reports', description: 'PDF / HTML / CSV audit-ready deliverables.', path: '/reports', requires: 'none' },
  { index: 15, key: 'history_registry', label: 'History & Model Registry', short: 'History', description: 'Reopen any past run, version and verdict.', path: '/history', requires: 'none' },
]

export const STAGE_BY_KEY = Object.fromEntries(WORKFLOW.map(s => [s.key, s]))

/* Report & History are supporting deliverables — they never block the
   analysis pipeline and are NOT counted in the process progress, so the
   core 13-stage journey reaches 100% the moment the decision loop ends. */
export const UTILITY_KEYS = new Set(['report', 'history_registry'])
export const CORE_WORKFLOW: WorkflowStage[] = WORKFLOW.filter(s => !UTILITY_KEYS.has(s.key))
export const PIPELINE_TOTAL = CORE_WORKFLOW.length

/* Progress metrics over the core pipeline (reports/history excluded). */
export function progressStats(statuses: Record<string, string>) {
  const done = CORE_WORKFLOW.filter(s => statuses[s.key] === 'done').length
  return { done, total: PIPELINE_TOTAL, pct: PIPELINE_TOTAL ? Math.round((done / PIPELINE_TOTAL) * 100) : 0 }
}

/* ── Milestone grouping (6-milestone rail) ─────────── */
export interface Milestone {
  key: string
  label: string
  short: string
  stages: string[] // WORKFLOW keys
}
export const MILESTONES: Milestone[] = [
  { key: 'intake', label: 'Intake', short: 'Data In', stages: ['library', 'import'] },
  { key: 'understand', label: 'Understand', short: 'Columns + Quality', stages: ['schema_discovery', 'dq_engine'] },
  { key: 'rebuild', label: 'Rebuild', short: 'Prepare', stages: ['transformation', 'feature_engineering'] },
  { key: 'model', label: 'Model', short: 'Predict + Trust', stages: ['prediction', 'confidence_gate'] },
  { key: 'prove', label: 'Prove', short: 'Proof', stages: ['shap', 'anomaly'] },
  { key: 'decide', label: 'Decide', short: 'Decide', stages: ['benchmarking', 'recommendation', 'executive_center'] },
]

/* Stages that run silently in the background in auto mode (visual-only).
   The user is only asked to stop at checkpoints. */
export const PASSTHROUGH_KEYS = new Set(['schema_discovery', 'shap', 'anomaly'])

/* Checkpoints the user actually stops / inspects at. */
export const CHECKPOINT_KEYS = new Set([
  'library', 'import', 'dq_engine', 'transformation', 'feature_engineering',
  'prediction', 'confidence_gate', 'benchmarking', 'recommendation',
  'executive_center', 'report', 'history_registry',
])

export function milestoneOf(key: string): Milestone | null {
  return MILESTONES.find(m => m.stages.includes(key)) || null
}

export function milestoneProgress(statuses: Record<string, string>, milestone: Milestone): { done: number; total: number } {
  const stages = milestone.stages
  const done = stages.filter(k => statuses[k] === 'done').length
  return { done, total: stages.length }
}

/* ── Execution mode: automation vs step-by-step ─────── */
export type JourneyMode = 'auto' | 'manual'
export const MODE_KEY = 'ecomind_mode'

export function initialMode(): JourneyMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'manual' ? 'manual' : 'auto'
  } catch {
    return 'auto'
  }
}

export function stagePath(stage: WorkflowStage, ctx: { datasetId?: string; runId?: string; modelId?: string }): string {
  let p = stage.path
  if (ctx.datasetId) p = p.replace('$datasetId', ctx.datasetId)
  if (ctx.runId) p = p.replace('$runId', ctx.runId)
  if (ctx.modelId) p = p.replace('$modelId', ctx.modelId)
  return p
}

export function nextStage(ctx: { datasetId?: string; runId?: string; modelId?: string; datasetStageKey?: string }): { stage: WorkflowStage | null; path: string | null } {
  let idx = 0
  const cur = ctx.datasetStageKey
  if (cur) {
    const s = STAGE_BY_KEY[cur]
    if (s) idx = s.index
  }
  const next = WORKFLOW[idx] // next after current
  if (!next) return { stage: null, path: null }
  return { stage: next, path: stagePath(next, ctx) }
}

/* ── Journey store ────────────────────────────────────── */
interface JourneyState {
  datasetId: string | null
  runId: string | null
  modelId: string | null
  mode: JourneyMode
  stageStatuses: Record<string, StageStatus>
  refreshToken: number
  poll: () => Promise<void>
  setActive: (dataset?: string | null, run?: string | null, model?: string | null) => void
  setMode: (mode: JourneyMode) => void
  reopenRun: (runId: string) => Promise<{ datasetId: string | null } | void>
  markStage: (key: string, status: StageStatus) => void
  markCompleted: (key: string) => void
  connectSse: (runId: string) => void
  disconnect: () => void
}

let pollTimer: ReturnType<typeof setInterval> | null = null

let sseRunId: string | null = null
let sseSrc: EventSource | null = null
let sseRetry: ReturnType<typeof setTimeout> | null = null

/* SSE event → stage-status patch (pure; unit-tested) */
export function sseStatusPatch(ev: any): { statuses?: Record<string, StageStatus>; bump?: boolean; close?: boolean } | null {
  if (!ev || typeof ev !== 'object' || typeof ev.type !== 'string') return null
  switch (ev.type) {
    case 'stage_started':
      return ev.stage_key ? { statuses: { [ev.stage_key]: 'active' } } : { bump: true }
    case 'stage_completed':
      return ev.stage_key ? { statuses: { [ev.stage_key]: 'done' } } : { bump: true }
    case 'stage_failed':
      return ev.stage_key ? { statuses: { [ev.stage_key]: 'locked' } } : { bump: true }
    case 'run_completed': {
      const done = Array.isArray(ev.stages_completed) ? new Set(ev.stages_completed) : null
      return {
        statuses: done
          ? Object.fromEntries(WORKFLOW.map(w => [w.key, done.has(w.key) ? 'done' : 'todo']))
          : {},
        close: true,
      }
    }
    case 'run_failed':
      return { bump: true, close: true }
    default:
      return { bump: true }
  }
}

export const useJourney = create<JourneyState>((set, get) => {
  const bump = (statuses: Record<string, StageStatus>) => set(state => ({
    stageStatuses: { ...state.stageStatuses, ...statuses },
    refreshToken: state.refreshToken + 1,
  }))

  const closeSse = () => {
    if (sseRetry) { clearTimeout(sseRetry); sseRetry = null }
    if (sseSrc) { sseSrc.close(); sseSrc = null }
  }

  const openSse = (runId: string) => {
    try {
      if (sseSrc) { sseSrc.close(); sseSrc = null }
      sseSrc = streamWorkflow(runId, (ev: any) => {
        const patch = sseStatusPatch(ev)
        if (!patch) return
        if (patch.statuses) bump(patch.statuses)
        else if (patch.bump) bump({})
        if (patch.close) closeSse()
      }, () => {
        if (sseSrc) { sseSrc.close(); sseSrc = null }
        if (!sseRetry && sseRunId) {
          sseRetry = setTimeout(() => {
            sseRetry = null
            const cur = get()
            if (sseRunId && cur.runId === sseRunId) openSse(sseRunId)
          }, 4000)
        }
      })
    } catch {
      sseSrc = null
    }
  }

  return {
  datasetId: null,
  runId: null,
  modelId: null,
  mode: initialMode(),
  stageStatuses: {},
  refreshToken: 0,

  setMode: (mode) => {
    try { localStorage.setItem(MODE_KEY, mode) } catch { /* ignore */ }
    set(s => ({ mode, refreshToken: s.refreshToken + 1 }))
  },

  markStage: (key, status) => {
    set(s => (s.stageStatuses[key] === status ? s : { stageStatuses: { ...s.stageStatuses, [key]: status } }))
  },

  markCompleted: (key) => {
    set(s => (s.stageStatuses[key] === 'done' ? s : { stageStatuses: { ...s.stageStatuses, [key]: 'done' } }))
  },

  setActive: (dataset, run, model) => {
    set(s => {
      const datasetId = dataset !== undefined ? dataset : s.datasetId
      const runId = run !== undefined ? run : s.runId
      const modelId = model !== undefined ? model : s.modelId
      if (datasetId === s.datasetId && runId === s.runId && modelId === s.modelId) return s
      return { datasetId, runId, modelId }
    })
  },

  reopenRun: async (runId) => {
    try {
      const det: any = await workflows.get(runId)
      const run = det?.run || {}
      const dsId: string | null = run.dataset_id || null
      const completed: string[] = run.stages_completed || []
      const curIdx = typeof run.current_stage === 'number' ? run.current_stage : -1
      const statuses: Record<string, StageStatus> = {}
      WORKFLOW.forEach((st, i) => {
        if (completed.includes(st.key)) statuses[st.key] = 'done'
        else if (i === curIdx) statuses[st.key] = 'active'
        else statuses[st.key] = 'todo'
      })
      let modelId: string | null = null
      const cfgModel = run.config?.model_id || run.config?.best_model_id
      if (cfgModel) {
        modelId = cfgModel
      } else {
        const ml: any = await models.list()
        const mine = (ml?.models || []).filter((m: any) => m.id && (!m.dataset_id || m.dataset_id === dsId))
        if (mine.length) modelId = mine[0].id
      }
      const prev = get()
      const changed =
        prev.datasetId !== dsId ||
        prev.runId !== runId ||
        prev.modelId !== modelId ||
        WORKFLOW.some(st => prev.stageStatuses[st.key] !== statuses[st.key])
      if (changed) {
        set({ datasetId: dsId, runId, modelId, stageStatuses: statuses, refreshToken: prev.refreshToken + 1 })
      }
      if (run.status === 'running') get().connectSse(runId)
      else get().disconnect()
      return { datasetId: dsId }
    } catch {
      return
    }
  },

  connectSse: (runId) => {
    if (sseSrc && sseRunId === runId) return
    closeSse()
    sseRunId = runId
    openSse(runId)
  },

  disconnect: () => {
    closeSse()
    sseRunId = null
  },

  poll: async () => {
    try {
      // If we don't know a dataset yet, prefer the one with the most advanced run
      // (completed first) so the default context always has real data to show.
      let ctx: JourneyState = get()
      if (!ctx.datasetId) {
        const dl = await datasets.list()
        if (!dl.datasets.length) return
        let best = dl.datasets[0]
        let bestScore = -1
        for (const d of dl.datasets) {
          try {
            const wr = await workflows.list(d.id) as any
            const runs = wr?.runs || []
            const top = runs[0]
            const done = (top?.stages_completed || []).length
            const score = (top?.status === 'completed' ? 10000 : top?.status === 'running' ? 5000 : 0) + done
            if (score > bestScore) { bestScore = score; best = d }
          } catch { /* skip */ }
        }
        set({ datasetId: best.id })
        ctx = get()
      }
      const res = await workflows.list(ctx.datasetId || undefined) as any
      const runs = res?.runs || []
      const run = runs.find((r: any) => r.status === 'running') || runs[0]
      if (!run) { get().disconnect(); return }
      const completed = run.stages_completed || []
      const statuses: Record<string, StageStatus> = {}
      WORKFLOW.forEach((st, i) => {
        if (completed.includes(st.key)) statuses[st.key] = 'done'
        else if (run.current_stage === i) statuses[st.key] = 'active'
        else statuses[st.key] = 'todo'
      })
      const prev = get()
      const changed =
        prev.runId !== run.id ||
        WORKFLOW.some(st => prev.stageStatuses[st.key] !== statuses[st.key])
      if (changed) {
        set({ runId: run.id, stageStatuses: statuses, refreshToken: prev.refreshToken + 1 })
      }
      if (run.status === 'running') get().connectSse(run.id)
      else get().disconnect()
    } catch {
      /* ignore */
    }
  },
  }
})

/* Auto-drive: sequentially execute every stage of an existing run.
   "Run automation" driver — fires one `advance` per stage. Backend stage
   runners derive their inputs from run.dataset_id / best_model, so an empty
   params advance completes the entire 15-stage pipeline. Progress streams
   live to the journey rail via SSE. */
export async function runJourneyToCompletion(
  runId: string,
  hooks?: {
    onStageDone?: (stage: WorkflowStage) => void
    onStep?: (stage: WorkflowStage, index: number) => void
    onDone?: () => void
    onError?: (err: any) => void
  },
): Promise<void> {
  const state = useJourney.getState()
  state.setActive(undefined, runId)
  try { state.connectSse(runId) } catch { /* sse is best-effort */ }
  const STAGE_GAP_MS = 650 // pace the run so the rail & notifications cascade visibly, like step-by-step
  for (let i = 0; i < WORKFLOW.length; i++) {
    const stage = WORKFLOW[i]
    hooks?.onStep?.(stage, i)
    try {
      await workflows.advance(runId)
      state.markCompleted(stage.key)
      hooks?.onStageDone?.(stage)
    } catch (err) {
      try { state.disconnect() } catch { /* noop */ }
      toast(`${stage.label} failed`, String((err as any)?.message ?? err), 'error')
      hooks?.onError?.(err)
      return
    }
    if (i < WORKFLOW.length - 1) {
      await new Promise(r => setTimeout(r, STAGE_GAP_MS))
    }
  }
  try { state.disconnect() } catch { /* noop */ }
  hooks?.onDone?.()
}

export function startWorkflowPolling(intervalMs = 6000) {
  const run = async () => { await useJourney.getState().poll() }
  if (!pollTimer) {
    run()
    pollTimer = setInterval(run, intervalMs)
  }
  return () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    useJourney.getState().disconnect()
  }
}