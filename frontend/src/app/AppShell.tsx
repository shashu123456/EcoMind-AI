import { useEffect } from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { datasets, runs } from '../lib/api';
import { datasetIdForPath, isDone, stageForPath, useJourney, type StageKey } from '../lib/journey';
import {
  ActiveDatasetProvider,
  type ActiveDataset,
  type HierarchyLevel,
} from '../lib/ActiveDatasetContext';
import { LoadingState } from '../lib/ui';
import { WorkspaceProvider } from '../lib/workspace';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { EventConsole, EventConsoleProvider } from './EventConsole';
import { InspectorProvider } from './Inspector';
import { RouteGuard } from './RouteGuard';
import { RunBar } from './RunBar';

/**
 * There is no hierarchy endpoint, and inventing one from the four counts on the
 * dataset row would be a lie -- a count says how many buildings there are, not
 * which ones. Pages that filter by building read the codes out of the stage
 * payload they are already displaying, so the shell contributes no levels.
 */
const NO_LEVELS: HierarchyLevel[] = [];

/**
 * The application shell: one sidebar, one workspace bar, one scrolling surface.
 *
 * Preparation and analytics present very differently, but they are the same
 * product and belong in the same chrome. The shell owns only what is shared —
 * navigation, the active dataset, the time window, the inspector and the
 * processing log — and leaves each page to speak for itself.
 */
export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activeDatasetId = useJourney((s) => s.activeDatasetId);
  const setActive = useJourney((s) => s.setActive);
  const setStatuses = useJourney((s) => s.setStatuses);

  const currentStage = stageForPath(pathname);
  const routeDatasetId = datasetIdForPath(pathname, currentStage);

  const datasetQuery = useQuery({
    queryKey: ['dataset', activeDatasetId],
    queryFn: () => datasets.getDataset(activeDatasetId as string),
    enabled: Boolean(activeDatasetId),
    staleTime: 60_000,
  });
  const runQuery = useQuery({
    queryKey: ['latest-run-detail', activeDatasetId],
    queryFn: () => runs.latestRunDetail(activeDatasetId as string),
    enabled: Boolean(activeDatasetId),
    staleTime: 15_000,
  });

  const dataset = datasetQuery.data ?? null;

  // Resume after a reload: the traces are the record of what has actually
  // happened, so the navigation reflects them rather than an empty store. The
  // run row carries no status map -- a stage that never ran has no trace -- so
  // progress is reconstructed from the traces that exist.
  const detail = runQuery.data ?? null;
  useEffect(() => {
    if (!detail) return;
    setActive({ runId: detail.run.id });
    // The traces are the record of what has actually happened, so a reload
    // rebuilds progress from them. Merge rather than replace: a stage the run
    // controls optimistically marked done must never be downgraded just because
    // the refetched trace list is a beat behind. The backend records a finished
    // stage as `completed`; the frontend calls that state `done`. Accept both
    // (and the legacy `passed`).
    const current = useJourney.getState().stageStatuses;
    let changed = false;
    const next = { ...current };
    for (const trace of detail.traces) {
      const finished =
        trace.status === 'completed' || trace.status === 'done' || trace.status === 'passed';
      const key = trace.stage_key as StageKey;
      if (finished && !isDone(next, key)) {
        next[key] = 'done';
        changed = true;
      }
    }
    if (changed) setStatuses(next);
  }, [detail, setActive, setStatuses]);

  const active: ActiveDataset | null = dataset
    ? {
        id: dataset.id,
        name: dataset.name,
        granularity: dataset.granularity,
        rowCount: dataset.row_count,
        topLevel: 'building',
      }
    : null;

  // Never render a page against half-loaded run state — gating and stage badges
  // would both be lying.
  const ready = !activeDatasetId || (datasetQuery.isFetched && runQuery.isFetched);

  return (
    <ActiveDatasetProvider dataset={active} levels={NO_LEVELS}>
      <WorkspaceProvider>
        <InspectorProvider>
          <EventConsoleProvider>
            <div className="flex h-full min-h-0">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <TopBar />
                <RunBar />
                <main className="min-h-0 flex-1 overflow-y-auto">
                  {ready ? (
                    <RouteGuard stage={currentStage} datasetId={routeDatasetId ?? activeDatasetId}>
                      <Outlet />
                    </RouteGuard>
                  ) : (
                    <div className="page-gutter py-8">
                      <LoadingState label="Loading run state" lines={4} />
                    </div>
                  )}
                </main>
                <EventConsole />
              </div>
            </div>
          </EventConsoleProvider>
        </InspectorProvider>
      </WorkspaceProvider>
    </ActiveDatasetProvider>
  );
}
