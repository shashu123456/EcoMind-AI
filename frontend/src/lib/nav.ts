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
  ShieldCheck,
  TableProperties,
  TrendingUp,
  Upload,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { type StageKey, type StageStatuses } from './journey';

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
        gate: 'dataset',
        built: true,
      },
      {
        id: 'compare',
        label: 'Compare',
        to: '/compare/$datasetId',
        icon: GitCompareArrows,
        gate: 'dataset',
        built: true,
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
        built: true,
      },
      {
        id: 'analyses',
        label: 'Recent Analyses',
        to: '/analyses',
        icon: History,
        gate: 'none',
        built: true,
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
 * Whether an entry genuinely cannot be opened right now.
 *
 * Two reasons remain, and only two, because both are about the address bar
 * rather than about the user's judgement:
 *
 * - the page does not exist yet;
 * - the entry is scoped to a dataset and no dataset is active, so there is no
 *   URL to build.
 *
 * Stage prerequisites used to be a third. They are not, and the reason is the
 * difference between a rule the platform can enforce and one it cannot: the
 * pipeline will refuse to *execute* anomaly detection before a model exists,
 * and that refusal is real. Whether a person may open the anomaly page to look
 * at what is there is a different question, and answering it for them only
 * ever hid work they were sent to review. Sequencing now shows up where it
 * belongs -- as an explanation on the page and a disabled control in the run
 * bar -- rather than as a redirect that discards the URL someone was sent.
 *
 * `statuses` is still taken, because the sidebar passes it and because a
 * caller may legitimately want a readiness hint; it simply no longer decides
 * whether the link works.
 */
export function navItemLocked(
  item: NavItem,
  datasetId: string | null,
  _statuses: StageStatuses,
): boolean {
  if (!item.built) return true;
  if (navNeedsDataset(item) && !datasetId) return true;
  return item.gate === 'dataset' && !datasetId;
}
