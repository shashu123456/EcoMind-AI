import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CornerDownLeft, Search } from 'lucide-react';
import { cn } from '../lib/cn';
import { useJourney } from '../lib/journey';
import { NAV_ITEMS, navItemLocked, navPath } from '../lib/nav';

/**
 * A keyboard-first jump menu.
 *
 * The shell has a lot of destinations; a command palette is faster than the
 * sidebar once a user knows where they are going. Only unlocked pages appear —
 * the palette is a navigation aid, not a way around the preparation gate.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const datasetId = useJourney((s) => s.activeDatasetId);
  const statuses = useJourney((s) => s.stageStatuses);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NAV_ITEMS.filter((item) => !navItemLocked(item, datasetId, statuses)).filter((item) =>
      q ? item.label.toLowerCase().includes(q) : true,
    );
  }, [query, datasetId, statuses]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        refs.current[active]?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results.length, active, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--overlay)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search pages"
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3.5">
          <Search className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to a page…"
            className="h-11 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-[var(--ink-faint)]"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 && (
            <li className="px-3.5 py-6 text-center text-sm text-neutral-600">
              No pages match “{query}”.
            </li>
          )}
          {results.map((item, index) => {
            const Icon = item.icon;
            const highlighted = index === active;
            return (
              <li key={item.id}>
                <Link
                  to={navPath(item, datasetId)}
                  ref={(el) => {
                    refs.current[index] = el;
                  }}
                  onClick={onClose}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'flex items-center gap-2.5 px-3.5 py-2 text-sm',
                    highlighted ? 'bg-brand-tint text-brand' : 'text-neutral-700',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {highlighted && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-end gap-3 border-t border-[var(--line)] px-3.5 py-2 text-2xs text-neutral-500">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
