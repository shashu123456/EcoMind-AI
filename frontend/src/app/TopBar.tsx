import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { cn } from '../lib/cn';
import { auth, getUser } from '../lib/api';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { useTheme } from '../lib/theme';
import { SegmentedControl } from '../lib/ui';
import { TIME_RANGES, useWorkspace, type TimeRange } from '../lib/workspace';
import { CommandPalette } from './CommandPalette';
import { Mark } from './Mark';

function DatasetSwitcher() {
  const { dataset, datasetId } = useDatasetScope();
  if (!dataset) {
    return (
      <Link
        to="/library"
        className="rounded-md border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-brand hover:text-brand"
      >
        Select a dataset
      </Link>
    );
  }
  return (
    <Link
      to="/library"
      title={`${dataset.name} — switch dataset`}
      className="flex max-w-[20rem] items-center gap-2 rounded-md border border-neutral-300 bg-[var(--surface)] px-2.5 py-1 hover:border-neutral-400"
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', datasetId ? 'bg-[var(--ok)]' : '')}
      />
      <span className="truncate text-xs font-medium text-neutral-800">{dataset.name}</span>
    </Link>
  );
}

/**
 * The workspace bar.
 *
 * Only the things that apply everywhere live here: which dataset is open, the
 * time window every analysis reads, whether the workspace auto-refreshes, and
 * the person using it. There is no pipeline strip — the sidebar owns navigation
 * — and no stage progress, because progress belongs to the page that acts on it.
 */
export function TopBar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { timeRange, setTimeRange, live, setLive, setNavOpen } = useWorkspace();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const user = getUser();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3.5 md:flex-nowrap md:gap-3">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
          className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-50 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="md:hidden">
          <Mark word={false} />
        </span>

        <DatasetSwitcher />

        <div className="min-w-0 flex-1" />

        <SegmentedControl<TimeRange>
          ariaLabel="Time range"
          size="sm"
          value={timeRange}
          onChange={setTimeRange}
          options={TIME_RANGES.map((r) => ({ value: r.value, label: r.label, hint: r.hint }))}
          className="hidden md:inline-flex"
        />

        <button
          type="button"
          onClick={() => setLive(!live)}
          aria-pressed={live}
          title={live ? 'Auto-refresh on (not a live sensor feed)' : 'Auto-refresh off'}
          className={cn(
            'hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors sm:inline-flex',
            live
              ? 'border-[var(--ok-line)] bg-[var(--ok-tint)] text-ok'
              : 'border-[var(--line)] text-neutral-600 hover:text-neutral-700',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              live ? 'bg-[var(--ok)]' : 'bg-[var(--ink-faint)]',
            )}
          />
          {live ? 'Live' : 'Paused'}
        </button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search pages (Ctrl+K)"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-[var(--line-strong)] hover:text-neutral-800"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-[var(--line)] px-1 text-2xs text-neutral-500 lg:inline">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="rounded-md p-1.5 text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-800"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="flex min-w-0 items-center gap-2 border-l border-[var(--line)] pl-3">
          {user && (
            <span className="hidden max-w-[12rem] truncate text-xs text-neutral-600 md:inline">
              {user.email}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              auth.logout();
              navigate({ to: '/login' });
            }}
            className="truncate rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
