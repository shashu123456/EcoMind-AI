import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Workspace-level preferences for the shell.
 *
 * These are not page state and not server state: they are the few settings that
 * apply across the whole analysis workspace — the time window every analytics
 * page reads, whether the workspace auto-refreshes, and the shape of the shell
 * itself (sidebar collapsed, mobile navigation open).
 *
 * Keeping them here means the top bar, the sidebar and every analytics page
 * agree on one definition of "the current window" instead of each inventing its
 * own.
 */

export type TimeRange = '24h' | '7d' | '30d' | '90d';

/**
 * How the pipeline is driven.
 *
 * Smart runs every remaining stage in order and stops only on failure — the
 * experience most users want. Step runs one stage at a time and waits for the
 * user, which is what a reviewer checking each stage's evidence needs. It is a
 * workspace preference because it shapes the run controls that live in the
 * shell, not any single page.
 */
export type RunMode = 'smart' | 'step';

export const RUN_MODES: readonly { value: RunMode; label: string; hint: string }[] = [
  { value: 'smart', label: 'Smart', hint: 'Run every remaining stage automatically' },
  { value: 'step', label: 'Step', hint: 'Run one stage at a time' },
];

export const TIME_RANGES: readonly { value: TimeRange; label: string; hint: string }[] = [
  { value: '24h', label: '24h', hint: 'Last 24 hours' },
  { value: '7d', label: '7d', hint: 'Last 7 days' },
  { value: '30d', label: '30d', hint: 'Last 30 days' },
  { value: '90d', label: '90d', hint: 'Last 90 days' },
];

const TIME_KEY = 'ecomind_time_range';
const LIVE_KEY = 'ecomind_live';
const SIDEBAR_KEY = 'ecomind_sidebar_collapsed';
const RUN_MODE_KEY = 'ecomind_run_mode';

function readRunMode(): RunMode {
  try {
    const raw = localStorage.getItem(RUN_MODE_KEY);
    if (raw === 'smart' || raw === 'step') return raw;
  } catch {
    /* storage unavailable */
  }
  return 'smart';
}

function readTimeRange(): TimeRange {
  try {
    const raw = localStorage.getItem(TIME_KEY);
    if (raw === '24h' || raw === '7d' || raw === '30d' || raw === '90d') return raw;
  } catch {
    /* storage unavailable */
  }
  return '30d';
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

interface WorkspaceCtx {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  /** Auto-refresh analytics data while true. Not a live sensor feed. */
  live: boolean;
  setLive: (value: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Mobile off-canvas navigation. */
  navOpen: boolean;
  setNavOpen: (value: boolean) => void;
  /** Smart (run all) vs Step (run one at a time) pipeline driving. */
  runMode: RunMode;
  setRunMode: (mode: RunMode) => void;
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRangeState] = useState<TimeRange>(readTimeRange);
  const [live, setLiveState] = useState<boolean>(() => readBool(LIVE_KEY, false));
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    readBool(SIDEBAR_KEY, false),
  );
  const [navOpen, setNavOpen] = useState(false);
  const [runMode, setRunModeState] = useState<RunMode>(readRunMode);

  useEffect(() => {
    write(TIME_KEY, timeRange);
  }, [timeRange]);
  useEffect(() => {
    write(LIVE_KEY, live ? '1' : '0');
  }, [live]);
  useEffect(() => {
    write(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);
  useEffect(() => {
    write(RUN_MODE_KEY, runMode);
  }, [runMode]);

  const setTimeRange = useCallback((range: TimeRange) => setTimeRangeState(range), []);
  const setLive = useCallback((value: boolean) => setLiveState(value), []);
  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);
  const setRunMode = useCallback((mode: RunMode) => setRunModeState(mode), []);

  const value = useMemo<WorkspaceCtx>(
    () => ({
      timeRange,
      setTimeRange,
      live,
      setLive,
      sidebarCollapsed,
      toggleSidebar,
      navOpen,
      setNavOpen,
      runMode,
      setRunMode,
    }),
    [
      timeRange,
      setTimeRange,
      live,
      setLive,
      sidebarCollapsed,
      toggleSidebar,
      navOpen,
      runMode,
      setRunMode,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within <WorkspaceProvider>');
  return ctx;
}
