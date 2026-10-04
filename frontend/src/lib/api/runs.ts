import { getToken, subscribe, request } from './client';
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
/**
 * The run the analytics pages should read.
 *
 * Not simply the newest run. Starting a run creates a row with zero stages
 * completed, and that row is immediately the newest -- so taking `runs[0]`
 * meant that merely *starting* a run replaced a fully completed analysis
 * everywhere, and every stage page then failed against an empty run. Users lost
 * their results by beginning new work.
 *
 * So the newest run that has actually produced stage output wins, and the
 * newest run overall is only used when nothing has run at all. An abandoned
 * run therefore cannot hide real results, and a genuine first run still shows
 * its own progress as it fills in.
 */
export async function latestRunDetail(datasetId: string): Promise<RunDetailResponse | null> {
  const runs = await listRuns({ dataset_id: datasetId });
  if (runs.length === 0) return null;
  const withOutput = runs.find((r) => (r.stages_completed?.length ?? 0) > 0);
  return getRun((withOutput ?? runs[0]).id);
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

export async function advanceRun(runId: string): Promise<StageExecResponse> {
  return request<StageExecResponse>(`/workflows/${runId}/advance`, { method: 'POST' });
}

/**
 * Open the run's SSE stream.
 *
 * The path goes to `subscribe` raw, not through `streamUrl`. `subscribe` builds
 * the URL and attaches the token, so pre-wrapping here produced
 * `/api/v1/api/v1/workflows/.../stream?token=…?token=…` -- a 404 that silently
 * dropped the user onto status polling, and looked like a harmless backend blip.
 */
export function streamRun(
  runId: string,
  onEvent: (event: StreamEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  return subscribe<StreamEvent>(`/workflows/${runId}/stream`, onEvent, onError);
}

/**
 * Download the rendered report PDF.
 *
 * Fetched with the bearer header rather than a token in the query string: a
 * query token ends up in access logs, browser history and any proxy in
 * between. Buffering the document into a blob is the right trade for a report
 * of a few pages, and it lets a failure surface as a real error message
 * instead of a browser tab that silently downloads a 401.
 */
export async function downloadReportPdf(runId: string): Promise<void> {
  const response = await fetch(`/api/v1/workflows/${encodeURIComponent(runId)}/report.pdf`, {
    headers: (() => {
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    })(),
  });

  if (!response.ok) {
    let detail = `Report download failed (HTTP ${response.status})`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === 'string') detail = payload.detail;
    } catch {
      /* keep the generic message when the body is not JSON */
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'EcoMind energy report.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers; a short
  // delay is the standard workaround.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
