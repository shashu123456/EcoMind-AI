import { useQuery } from '@tanstack/react-query';
import { ApiError, errorMessage } from './api/client';
import { runs } from './api';
import type { StageOutputResponse } from './api/types';
import { useDatasetScope } from './ActiveDatasetContext';
import { STAGE_BY_KEY, type StageKey } from './journey';

/**
 * One hook, ten pages, one read path.
 *
 * Every stage page needs the same three things: the run it belongs to, the
 * payload that stage produced, and the truth about whether it has been run at
 * all. There is exactly one endpoint that answers all three —
 * `GET /workflows/{run_id}/stages/{stage_key}` — and it returns the same
 * `output_snapshot` that `exec` wrote when the stage ran. That is deliberate.
 * A page that recomputes its own numbers would eventually disagree with the
 * run it claims to be showing, and a dashboard that disagrees with its own
 * audit trail is worse than no dashboard.
 *
 * 404 is not an error state here. The backend answers it both for a stage key
 * it does not recognise and for a stage that has not been run in this run, and
 * the second case is the ordinary opening move of every page. So it is split
 * out as `notRun` rather than being shown as a failure.
 */

export interface StageTrace<T> extends Omit<StageOutputResponse, 'output'> {
  output: T;
}

export interface StageOutputState<T> {
  /** The run the payload came from, or null when no run is active yet. */
  runId: string | null;
  stageKey: StageKey;
  stageLabel: string;
  /** The stage payload, or null while loading / before the stage has run. */
  output: T | null;
  /** The one-sentence statement the backend made about what it found. */
  decision: string | null;
  status: string | null;
  durationMs: number | null;
  /** No run exists yet — nothing has been started for this dataset. */
  noRun: boolean;
  loading: boolean;
  notRun: boolean;
  failed: boolean;
  error: string | null;
  refetch: () => void;
}

export function useStageOutput<T>(stageKey: StageKey): StageOutputState<T> {
  const { runId } = useDatasetScope();

  const query = useQuery({
    queryKey: ['stage-output', runId, stageKey] as const,
    enabled: Boolean(runId),
    retry: false,
    queryFn: async () => {
      const res = await runs.getStageOutput(runId as string, stageKey);
      return res as StageTrace<T>;
    },
  });

  const notRun = query.isError && query.error instanceof ApiError && query.error.status === 404;

  return {
    runId: runId ?? null,
    stageKey,
    stageLabel: STAGE_BY_KEY[stageKey].label,
    output: (query.data?.output ?? null) as T | null,
    decision: query.data?.decision ?? null,
    status: query.data?.status ?? null,
    durationMs: query.data?.duration_ms ?? null,
    noRun: !runId,
    loading: Boolean(runId) && query.isFetching,
    notRun,
    failed: query.isError && !notRun,
    error: query.isError
      ? errorMessage(query.error, `Could not load the ${STAGE_BY_KEY[stageKey].label} stage.`)
      : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
