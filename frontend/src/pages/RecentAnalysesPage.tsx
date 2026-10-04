import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  KpiRow,
  KpiTile,
  LoadingState,
  Section,
  stageStatusColor,
  type StageStatus,
} from '../lib/ui';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { runs } from '../lib/api';
import type { Run } from '../lib/api/types';
import { STAGES, STAGE_BY_KEY, TOTAL_STAGES } from '../lib/journey';
import { ProgressBar } from '../lib/ui';
import { dateTime, int, stamp } from '../lib/format';

/**
 * Recent Analyses — every run this workspace knows about, across every dataset.
 *
 * A stage page shows one run. This shows the shape of all of them, which is the
 * question a reviewer asks second: not "what did this conclude" but "what else
 * has been run, and when". It is ungated for the same reason the rest of the
 * navigation is: history is readable before any of it is complete.
 */

function statusTone(status: string): string {
  if (status === 'completed') return 'var(--ok)';
  if (status === 'failed') return 'var(--critical)';
  if (status === 'running') return 'var(--warn)';
  return 'var(--ink-faint)';
}

export function RecentAnalysesPage() {
  const { datasetId } = useDatasetScope();

  const query = useQuery({
    queryKey: ['runs', 'all'],
    queryFn: async () => {
      // One request per dataset is avoided by asking for the whole workspace:
      // the endpoint accepts an optional dataset filter, and omitting it
      // returns every run the signed-in user can see.
      return runs.listRuns({});
    },
  });

  const all = useMemo(() => (query.data ?? []) as Run[], [query.data]);

  const scoped = useMemo(
    () => (datasetId ? all.filter((r) => r.dataset_id === datasetId) : all),
    [all, datasetId],
  );

  const completed = scoped.filter((r) => r.status === 'completed');
  const running = scoped.filter((r) => r.status === 'running');
  const failed = scoped.filter((r) => r.status === 'failed');

  const stagesTouched = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of scoped) {
      for (const key of run.stages_completed ?? []) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return STAGES.map((s) => ({
      stage: s,
      count: counts.get(s.key) ?? 0,
    })).sort((a, b) => b.count - a.count);
  }, [scoped]);

  const maxStageCount = Math.max(1, ...stagesTouched.map((s) => s.count));

  return (
    <PageFrame
      title="Recent analyses"
      subtitle="Every run in this workspace, and how far each one got."
      conclusion={
        <p className="text-md">
          {int(scoped.length)} runs recorded. A run is immutable history: stages are appended to it,
          never edited, so a figure on an old report still traces to the reading and the code that
          produced it.
        </p>
      }
    >
      {query.isLoading ? (
        <LoadingState label="Reading run history" lines={5} />
      ) : query.isError ? (
        <Callout tone="critical" title="Run history could not be read">
          {(query.error as Error)?.message ?? 'The workflow endpoint did not respond.'}
        </Callout>
      ) : scoped.length === 0 ? (
        <EmptyState
          title="No runs yet"
          description="Start one from the overview page, or from any stage's Run button. Runs appear here as soon as they exist."
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <PageHero
            eyebrow="Runs recorded"
            value={int(scoped.length)}
            verdict={`${int(completed.length)} complete · ${int(running.length)} running · ${int(failed.length)} failed`}
            tone={failed.length > 0 ? 'warn' : 'ok'}
          />

          <KpiRow columns={4}>
            <KpiTile label="Total runs" value={int(scoped.length)} hint="In this workspace" />
            <KpiTile
              label="Completed"
              value={int(completed.length)}
              hint="Every stage finished"
              tone="ok"
            />
            <KpiTile
              label="Running"
              value={int(running.length)}
              hint="In progress now"
              tone="info"
            />
            <KpiTile
              label="Failed"
              value={int(failed.length)}
              hint="Stopped before the end"
              tone={failed.length > 0 ? 'critical' : undefined}
            />
          </KpiRow>

          <Section
            title="How often each stage has produced output"
            description="A stage that has never run on any dataset is the one place worth looking before trusting a pipeline end to end."
          >
            <div className="flex flex-col gap-2">
              {stagesTouched.map(({ stage, count }) => (
                <div key={stage.key} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs text-[var(--ink-low)]">
                    {stage.short}
                  </span>
                  <div className="min-w-0 flex-1">
                    <ProgressBar
                      value={count / maxStageCount}
                      tone={count > 0 ? 'ok' : 'warn'}
                      label={`${stage.label}: ${count} of ${scoped.length} runs`}
                    />
                  </div>
                  <span className="num w-16 shrink-0 text-right text-xs">{count}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Every run, most recent first"
            description="Select a run to open its report."
          >
            <div className="flex flex-col gap-2">
              {scoped.map((run) => {
                const done = run.stages_completed.length;
                const pctDone = done / TOTAL_STAGES;
                const isCurrent = datasetId === run.dataset_id;
                return (
                  <div
                    key={run.id}
                    className="surface flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color={statusTone(run.status)}>{run.status}</Badge>
                        {isCurrent ? <Badge color="var(--brand)">active</Badge> : null}
                        <span className="mono text-2xs text-[var(--ink-low)]">
                          {run.id.slice(0, 8)}
                        </span>
                        <span className="text-2xs text-[var(--ink-low)]">
                          {dateTime(run.started_at)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <ProgressBar
                            value={pctDone}
                            tone={run.status === 'failed' ? 'critical' : 'ok'}
                            label={`${done} of ${TOTAL_STAGES} stages complete`}
                          />
                        </div>
                        <span className="num shrink-0 text-2xs">
                          {int(done)}/{TOTAL_STAGES}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {run.stages_completed.slice(-5).map((key) => {
                        const def = STAGE_BY_KEY[key as keyof typeof STAGE_BY_KEY];
                        if (!def) return null;
                        return (
                          <Badge key={key} color={stageStatusColor('done' as StageStatus)}>
                            {def.short}
                          </Badge>
                        );
                      })}
                    </div>
                    <div className="shrink-0">
                      <Link
                        to="/report/$datasetId"
                        params={{ datasetId: run.dataset_id }}
                        hash="action-plan"
                      >
                        <Button variant="secondary" size="sm">
                          Open report
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <p className="text-2xs text-[var(--ink-faint)]">
            Latest recorded run: {stamp(scoped[0]?.started_at ?? '')}. Times are shown in your local
            timezone.
          </p>
        </div>
      )}
    </PageFrame>
  );
}
