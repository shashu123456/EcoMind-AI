import {
  Activity,
  Boxes,
  Building2,
  Compass,
  Database,
  FileText,
  GitCompareArrows,
  History,
  LayoutDashboard,
  Lightbulb,
  ShieldCheck,
  TableProperties,
  TrendingUp,
  Upload,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import {
  STAGE_BY_KEY,
  analyticsReady,
  isReachable,
  type StageKey,
  type StageStatuses,
} from './journey';

/**
 * The sidebar model for the application shell.
 *
 * The product has two halves, and the navigation has to say so: a *preparation
 * pipeline* that runs in order, and an *analytics workspace* that opens only
 * once preparation is complete. Both live in one sidebar rather than one being
 * hidden behind a wizard, because an experienced user should be able to jump to
 * any unlocked tool without losing the thread.
 *
 * This file is data only. It describes what exists and how each entry is gated;
 * `Sidebar.tsx` decides how that looks.
 */

/**
 * How an entry is unlocked.
 *
 * - `none`      always available (the product landing).
 * - `stage`     follows the stage gate in `journey.ts` (prerequisites done).
 * - `analytics` requires the whole preparation phase to be complete.
 * - `dataset`   only needs a dataset to be active.
 */
export type NavGate = 'none' | 'stage' | 'analytics' | 'dataset';

export interface NavItem {
  id: string;
  label: string;
  /** Absolute route path. May contain the `$datasetId` parameter. */
  to: string;
  icon: LucideIcon;
  /** The stage this entry fronts, when it is a stage page. */
  stageKey?: StageKey;
  gate: NavGate;
  /** False while the page is still to be built in a later phase. */
  built: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        to: '/',
        icon: LayoutDashboard,
        gate: 'none',
        built: true,
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    items: [
      {
        id: 'explore',
        label: 'Explore',
        to: '/explore/$datasetId',
        icon: Compass,
        gate: 'analytics',
        built: false,
      },
      {
        id: 'compare',
        label: 'Compare',
        to: '/compare/$datasetId',
        icon: GitCompareArrows,
        gate: 'analytics',
        built: false,
      },
      {
        id: 'anomalies',
        label: 'Anomalies',
        to: '/anomalies/$datasetId',
        icon: Activity,
        stageKey: 'anomaly',
        gate: 'analytics',
        built: true,
      },
      {
        id: 'forecast',
        label: 'Forecast',
        to: '/forecast/$datasetId',
        icon: TrendingUp,
        stageKey: 'forecast',
        gate: 'analytics',
        built: true,
      },
      {
        id: 'recommendations',
        label: 'Recommendations',
        to: '/recommendations/$datasetId',
        icon: Lightbulb,
        stageKey: 'recommendation',
        gate: 'analytics',
        built: true,
      },
      {
        id: 'reports',
        label: 'Reports',
        to: '/report/$datasetId',
        icon: FileText,
        stageKey: 'report',
        gate: 'analytics',
        built: true,
      },
    ],
  },
  {
    id: 'preparation',
    label: 'Data Preparation',
    items: [
      {
        id: 'library',
        label: 'Library',
        to: '/library',
        icon: Database,
        stageKey: 'library',
        gate: 'stage',
        built: true,
      },
      {
        id: 'import',
        label: 'Import',
        to: '/import/$datasetId',
        icon: Upload,
        stageKey: 'import',
        gate: 'stage',
        built: true,
      },
      {
        id: 'schema',
        label: 'Schema Discovery',
        to: '/schema/$datasetId',
        icon: TableProperties,
        stageKey: 'schema',
        gate: 'stage',
        built: true,
      },
      {
        id: 'quality',
        label: 'Data Quality',
        to: '/quality/$datasetId',
        icon: ShieldCheck,
        stageKey: 'quality',
        gate: 'stage',
        built: true,
      },
      {
        id: 'transformation',
        label: 'Transformation',
        to: '/transformation/$datasetId',
        icon: Wand2,
        stageKey: 'transformation',
        gate: 'stage',
        built: true,
      },
      {
        id: 'model_selection',
        label: 'Model Selection',
        to: '/model-selection/$datasetId',
        icon: Boxes,
        stageKey: 'model_selection',
        gate: 'stage',
        built: true,
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      {
        id: 'dataset',
        label: 'Dataset Details',
        to: '/datasets/$datasetId',
        icon: Building2,
        gate: 'dataset',
        built: false,
      },
      {
        id: 'analyses',
        label: 'Recent Analyses',
        to: '/analyses',
        icon: History,
        gate: 'none',
        built: false,
      },
    ],
  },
] as const;

/** Every item across every section, in navigation order. */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Resolve a route template to a concrete path for the active dataset. */
export function navPath(item: NavItem, datasetId: string | null): string {
  return item.to.replace('$datasetId', datasetId ?? '');
}

/** True when a nav item's template targets a single dataset. */
export function navNeedsDataset(item: NavItem): boolean {
  return item.to.includes('$datasetId');
}

/**
 * Whether a pathname is the one this item points at.
 *
 * Parameterised paths are compared segment-by-segment so `/anomalies/abc`
 * highlights the Anomalies entry regardless of which dataset is open.
 */
export function navItemActive(item: NavItem, pathname: string): boolean {
  const actual = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const expected = item.to.replace(/\/+$/, '').split('/').filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((seg, i) => seg.startsWith('$') || seg === actual[i]);
}

/**
 * Whether an entry is locked for the current dataset and stage statuses.
 *
 * A page that has not been built yet is always locked, so navigation never
 * leads somewhere that does not exist. A built page follows its gate: the
 * stage gate honours prerequisites, the analytics gate waits for the whole
 * preparation phase, and a parameterised route needs a dataset to point at.
 */
export function navItemLocked(
  item: NavItem,
  datasetId: string | null,
  statuses: StageStatuses,
): boolean {
  if (!item.built) return true;
  const needsDataset = navNeedsDataset(item) && !datasetId;
  switch (item.gate) {
    case 'none':
      return false;
    case 'dataset':
      return !datasetId;
    case 'analytics':
      return needsDataset || !analyticsReady(statuses);
    case 'stage':
      return (
        needsDataset ||
        (item.stageKey ? !isReachable(STAGE_BY_KEY[item.stageKey], statuses) : false)
      );
  }
}
