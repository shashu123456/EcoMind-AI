import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useJourney, type StageStatuses } from './journey';
import type { Granularity } from './api/types';

/**
 * The active dataset, and the filters that scope every page to it.
 *
 * A single invariant runs through the whole product: one dataset is active at
 * a time. Building, floor and room filters always resolve *within* that
 * dataset, so a page can never combine Aurora's floors with Northgate's rooms.
 */

/** Re-exported so callers have one import for the scope, not two. */
export type { Granularity };

export interface HierarchyLevel {
  key: string;
  label: string;
  values: string[];
  parent?: { key: string; value: string };
}

export interface ActiveDataset {
  id: string;
  name: string;
  granularity: Granularity;
  rowCount: number | null;
  /** Highest level present, e.g. building for asset datasets, meter for BDG2. */
  topLevel: string;
}

export interface HierarchyFilter {
  building?: string;
  floor?: string;
  room?: string;
  device?: string;
}

export interface DatasetScope {
  dataset: ActiveDataset | null;
  datasetId: string | null;
  runId: string | null;
  selectedModelId: string | null;
  stageStatuses: StageStatuses;
  /** Hierarchy available for the active dataset. */
  levels: readonly HierarchyLevel[];
  filter: HierarchyFilter;
  setFilter: (next: HierarchyFilter) => void;
  /** Applies a level change and clears every deeper level. */
  drill: (key: keyof HierarchyFilter, value: string | null) => void;
  resetFilter: () => void;
  /** True when the dataset's granularity cannot support rooms/floors. */
  limitedTo: 'building' | 'floor' | 'room' | 'device' | null;
  setActive: (next: {
    datasetId?: string | null;
    runId?: string | null;
    modelId?: string | null;
  }) => void;
}

const DatasetScopeContext = createContext<DatasetScope | null>(null);

/**
 * Resolve which levels a filter may expose.
 *
 * BDG2 is meter-level reference data. Rather than fabricate a room tree, the
 * scope reports the real limit and pages suppress the drill-downs that would
 * be fiction.
 */
export function limitFor(
  granularity: Granularity,
  levels: readonly HierarchyLevel[],
): DatasetScope['limitedTo'] {
  const keys = new Set(levels.map((l) => l.key));
  if (!keys.has('building')) return 'building';
  if (!keys.has('floor')) return 'building';
  if (!keys.has('room')) return 'floor';
  if (!keys.has('device')) return 'room';
  void granularity;
  return null;
}

const ORDER: (keyof HierarchyFilter)[] = ['building', 'floor', 'room', 'device'];

function deeperThan(key: keyof HierarchyFilter): (keyof HierarchyFilter)[] {
  const idx = ORDER.indexOf(key);
  return ORDER.slice(idx + 1);
}

export function ActiveDatasetProvider({
  dataset,
  levels,
  runId,
  selectedModelId,
  stageStatuses,
  children,
}: {
  dataset: ActiveDataset | null;
  levels?: readonly HierarchyLevel[];
  runId?: string | null;
  selectedModelId?: string | null;
  stageStatuses?: StageStatuses;
  children: ReactNode;
}) {
  const journey = useJourney();
  const [filter, setFilter] = useState<HierarchyFilter>({});

  // A dataset switch invalidates every filter — floor 3 of Aurora means nothing
  // in a different estate.
  useEffect(() => {
    setFilter({});
  }, [dataset?.id]);

  const drill = useCallback((key: keyof HierarchyFilter, value: string | null) => {
    setFilter((prev) => {
      const next: HierarchyFilter = { ...prev, [key]: value ?? undefined };
      for (const deeper of deeperThan(key)) delete next[deeper];
      return next;
    });
  }, []);

  const resetFilter = useCallback(() => setFilter({}), []);

  const value = useMemo<DatasetScope>(
    () => ({
      dataset,
      datasetId: journey.activeDatasetId,
      runId: runId ?? journey.runId,
      selectedModelId: selectedModelId ?? journey.selectedModelId,
      stageStatuses: stageStatuses ?? journey.stageStatuses,
      levels: levels ?? [],
      filter,
      setFilter,
      drill,
      resetFilter,
      limitedTo: dataset ? limitFor(dataset.granularity, levels ?? []) : null,
      setActive: journey.setActive,
    }),
    [dataset, levels, runId, selectedModelId, stageStatuses, journey, filter, drill, resetFilter],
  );

  return <DatasetScopeContext.Provider value={value}>{children}</DatasetScopeContext.Provider>;
}

export function useDatasetScope(): DatasetScope {
  const ctx = useContext(DatasetScopeContext);
  if (!ctx) throw new Error('useDatasetScope must be used within <ActiveDatasetProvider>');
  return ctx;
}

/** True when a page must suppress room/appliance drill-down (BDG2). */
export function useIsMeterGranularity(): boolean {
  return useDatasetScope().dataset?.granularity === 'meter';
}

/**
 * Filter chips for the FilterBar. One source so every page words its chips
 * the same way.
 */
export function filterChips(
  filter: HierarchyFilter,
  labels: Partial<Record<keyof HierarchyFilter, string>> = {},
): { key: string; label: string; onClear: () => void }[] {
  const out: { key: string; label: string; onClear: () => void }[] = [];
  for (const key of ORDER) {
    const value = filter[key];
    if (!value) continue;
    out.push({
      key,
      label: `${labels[key] ?? key}: ${value}`,
      onClear: () => {
        delete filter[key];
      },
    });
  }
  return out;
}
