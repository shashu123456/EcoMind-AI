import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { runs } from '../lib/api';
import { errorMessage } from '../lib/api/client';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { STAGE_BY_KEY, useJourney, type StageKey } from '../lib/journey';
import type { StageOutputState } from '../lib/stageOutput';
import { Button, Callout, EmptyState, ErrorState, LoadingState } from '../lib/ui';

export interface StageGateProps<T> {
  stage: StageKey;
  state: StageOutputState<T>;
  /**
   * Stage keys that must have run first, shown as the reason the button is
   * disabled. The backend enforces the order anyway (409); naming the
   * blockers here means the user is not left to discover the rule by
   * provoking it.
   */
  blockedBy?: readonly StageKey[];
  children: (output: T, state: StageOutputState<T>) => ReactNode;
}

/**
 * The single opening move of every stage page.
 *
 * Four states, in the order they actually happen: loading, no run yet, the
 * stage has not run, the request failed. Only the fourth is an error worth
 * styling as one — the first three are the ordinary opening of a stage that
 * has simply not been executed, and dressing them as failures would teach
 * users that the product is broken.
 *
 * The run button posts to `execStage`, which is the same endpoint the rest of
 * the product uses, so a stage run from here lands in the same audit trail as
 * one run anywhere else.
 */
export function StageGate<T>({ stage, state, blockedBy = [], children }: StageGateProps<T>) {
  const { runId } = useDatasetScope();
  const markStage = useJourney((s) => s.markStage);
  const queryClient = useQueryClient();
  const def = STAGE_BY_KEY[stage];
  const blockers = blockedBy;

  const run = useMutation({
    mutationFn: async () => {
      if (!runId) throw new Error('No run is active for this dataset.');
      return runs.execStage(runId, stage);
    },
    onSuccess: async () => {
      markStage(stage, 'done');
      await queryClient.invalidateQueries({ queryKey: ['stage-output', runId] });
    },
  });

  // Prerequisites are the pipeline's business, not the navigation's. The run
  // button stays live whatever is upstream: the backend refuses an out-of-order
  // stage with a specific message, which beats a button that silently does
  // nothing, and it means a reviewer with a partially-run workflow can still
  // fill a gap without hunting for whichever control happens to be enabled.
  const canRun = Boolean(runId) && !run.isPending;
  const runButton = (
    <Button
      variant="primary"
      loading={run.isPending}
      disabled={!canRun}
      onClick={() => run.mutate()}
    >
      {run.isPending ? `Running ${def.label.toLowerCase()}` : `Run ${def.label.toLowerCase()}`}
    </Button>
  );

  if (state.noRun) {
    return (
      <EmptyState
        title="No run exists for this dataset yet"
        description={`${def.label} is recorded against a run. Start one from the status page and this stage becomes available the moment it finishes.`}
      />
    );
  }

  if (state.loading) {
    return <LoadingState label={`Reading the ${def.label.toLowerCase()} record`} />;
  }

  if (state.failed) {
    return (
      <ErrorState
        title="This stage could not be read"
        message={state.error}
        onRetry={state.refetch}
      />
    );
  }

  if (state.notRun || !state.output) {
    return (
      <div className="space-y-4">
        {blockers.length > 0 ? (
          <Callout tone="info" title="This stage reads from the ones before it">
            {def.label} is built on{' '}
            {blockers.map((key) => STAGE_BY_KEY[key].label.toLowerCase()).join(' and ')}. Those have
            not run for this dataset yet, so running this now will be refused by the pipeline until
            they have. Nothing is lost by looking at this page in the meantime -- you are seeing an
            empty stage, and it will say so rather than showing you zeros that look like findings.
          </Callout>
        ) : null}
        <EmptyState
          title={`${def.label} has not been run for this dataset`}
          description={def.purpose}
          action={runButton}
        />
        {run.isError ? (
          <Callout tone="critical" title="The stage did not complete">
            {errorMessage(run.error, `${def.label} failed.`)}
          </Callout>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {run.isError ? (
        <Callout tone="critical" title="The stage did not complete">
          {errorMessage(run.error, `${def.label} failed.`)}
        </Callout>
      ) : null}
      {children(state.output, state)}
    </>
  );
}
