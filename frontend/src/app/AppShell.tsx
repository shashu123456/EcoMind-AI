import { useEffect } from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ApiError, datasets, runs } from '../lib/api';
import type { DatasetHierarchy } from '../lib/api/types';
import { datasetIdForPath, isDone, stageForPath, useJourney, type StageKey } from '../lib/journey';
import {
  ActiveDatasetProvider,
  type ActiveDataset,
  type HierarchyLevel,
} from '../lib/ActiveDatasetContext';
import { LoadingState } from '../lib/ui';
import { ToastProvider } from '../lib/ui/Toast';
import { WorkspaceProvider } from '../lib/workspace';
import { Sidebar } from './Sidebar';
import { ScopeBar } from './ScopeBar';
import { TopBar } from './TopBar';
import { EventConsole, EventConsoleProvider } from './EventConsole';
import { InspectorProvider } from './Inspector';
import { RouteGuard } from './RouteGuard';
import { RunBar } from './RunBar';

/**
 * Levels come from the dataset's own hierarchy, so the shell stops contributing
 * an empty list and every page gains real drill targets.
 *
 * The endpoint reports only the levels a dataset can resolve: a meter-level
 * reference set returns building and device and nothing between, because
 * offering a room panel for buildings that have no room instrumentation would
 * mean inventing rooms. Rendering straight off this list keeps the UI honest
 * about what the data can support.
 */
function levelsFromHierarchy(hierarchy: DatasetHierarchy | undefined): HierarchyLevel[] {
  if (!hierarchy) return [];
  return hierarchy.levels.map((level) => ({
    key: level.level,
    label: level.label,
    values: level.values,
  }));
}

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
  const hierarchyQuery = useQuery({
    queryKey: ['hierarchy', activeDatasetId],
    queryFn: () => datasets.getHierarchy(activeDatasetId as string),
    enabled: Boolean(activeDatasetId),
    staleTime: 300_000,
    retry: false,
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

  /**
   * Reconcile the persisted dataset against the server before anything renders.
   *
   * The store is a cache, and a cache outlives its entry. If the dataset it
   * names has since been deleted — or was never a dataset at all — every page
   * resolves "no dataset active" while the run bar keeps reporting the run's
   * progress from storage. Two parts of the same screen disagreeing is worse
   * than either being empty, so the store is corrected here rather than being
   * defended everywhere downstream.
   *
   * Only a definitive 404 is treated as proof the dataset is gone. A dropped
   * connection, a 500, or a gateway timeout says something about the moment,
   * not about the dataset, and clearing the store on those would discard a
   * valid workspace because the network blinked. Losing context is exactly the
   * confusion this effect exists to prevent, so it must never cause it.
   *
   * Clearing the dataset clears the run with it, because a run belongs to a
   * dataset and reading one against the other is the confusion being removed.
   * Stage progress goes too, for the same reason.
   */
  const datasetMissing =
    Boolean(activeDatasetId) &&
    datasetQuery.isFetched &&
    datasetQuery.isError &&
    datasetQuery.error instanceof ApiError &&
    datasetQuery.error.status === 404;

  useEffect(() => {
    if (!datasetMissing) return;
    setActive({ datasetId: null, runId: null, modelId: null });
    setStatuses({});
  }, [datasetMissing, setActive, setStatuses]);

  // Never render a page against half-loaded run state — gating and stage badges
  // would both be lying.
  const ready =
    datasetMissing || !activeDatasetId || (datasetQuery.isFetched && runQuery.isFetched);

  return (
    <ToastProvider>
      <ActiveDatasetProvider
        dataset={active}
        levels={levelsFromHierarchy(hierarchyQuery.data)}
        buildings={hierarchyQuery.data?.tree ?? []}
      >
        <WorkspaceProvider>
          <InspectorProvider>
            <EventConsoleProvider>
              <div className="flex h-full min-h-0">
                <Sidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                  <TopBar />
                  <ScopeBar hierarchy={hierarchyQuery.data} />
                  <RunBar />
                  <main className="min-h-0 flex-1 overflow-y-auto">
                    {ready ? (
                      <RouteGuard
                        stage={currentStage}
                        datasetId={routeDatasetId ?? activeDatasetId}
                      >
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
    </ToastProvider>
  );
}
