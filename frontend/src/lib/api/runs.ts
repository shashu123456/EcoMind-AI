import { streamUrl, subscribe, request } from './client';
import type {
  Run,
  RunDetailResponse,
  RunListResponse,
  StageExecResponse,
  StageOutputResponse,
  StreamEvent,
  TraceListResponse,
} from './types';
import type { StageKey as JourneyStageKey } from '../journey';

/** The ten stage keys the backend registers. A page may only ask for one of these. */
export type BackendStageKey =
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

export async function listRuns(params: { dataset_id?: string } = {}): Promise<Run[]> {
  const search = new URLSearchParams();
  if (params.dataset_id) search.set('dataset_id', params.dataset_id);
  const qs = search.toString();
  const res = await request<RunListResponse>(`/workflows${qs ? `?${qs}` : ''}`);
  return res.runs ?? [];
}

export async function startRun(datasetId: string): Promise<Run> {
  const res = await request<{ run: Run }>('/workflows/start', {
    method: 'POST',
    body: { dataset_id: datasetId },
  });
  return res.run;
}

export async function getRun(runId: string): Promise<RunDetailResponse> {
  return request<RunDetailResponse>(`/workflows/${runId}`);
}

export async function getTraces(runId: string): Promise<TraceListResponse> {
  return request<TraceListResponse>(`/workflows/${runId}/traces`);
}

export async function latestRun(datasetId: string): Promise<Run | null> {
  const runs = await listRuns({ dataset_id: datasetId });
  return runs[0] ?? null;
}

/**
 * The newest run for a dataset together with its traces.
 *
 * The shell needs both: the run tells it which run is current, and the traces
 * are the only record of which stages actually completed. `Run` carries no
 * `stage_statuses` field, so progress has to be reconstructed from the traces
 * rather than from a status map the server does not send.
 */
export async function latestRunDetail(datasetId: string): Promise<RunDetailResponse | null> {
  const runs = await listRuns({ dataset_id: datasetId });
  if (!runs[0]) return null;
  return getRun(runs[0].id);
}

/**
 * One stage's output for one run -- the newest trace of that stage.
 *
 * This is the read every stage page uses. It returns the same `output_snapshot`
 * that `exec` wrote, so a page can never present a number the audit trail does
 * not contain. A stage that has not run in this run 404s, and the page shows
 * "not yet run" rather than inventing a zero.
 */
export async function getStageOutput(
  runId: string,
  stageKey: JourneyStageKey,
): Promise<StageOutputResponse> {
  return request<StageOutputResponse>(`/workflows/${runId}/stages/${stageKey}`);
}

export async function execStage(
  runId: string,
  stageKey: JourneyStageKey,
): Promise<StageExecResponse> {
  return request<StageExecResponse>(`/workflows/${runId}/stages/${stageKey}/exec`, {
    method: 'POST',
  });
}

export async function advanceRun(runId: string): Promise<RunDetailResponse> {
  return request<RunDetailResponse>(`/workflows/${runId}/advance`, { method: 'POST' });
}

export function streamRun(
  runId: string,
  onEvent: (event: StreamEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  return subscribe<StreamEvent>(streamUrl(`/workflows/${runId}/stream`), onEvent, onError);
}
