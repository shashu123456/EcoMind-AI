import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Check, Lock, PanelLeft, PanelLeftClose } from 'lucide-react';
import { cn } from '../lib/cn';
import { health } from '../lib/api';
import { analyticsReady, progressStats, useJourney, type StageStatuses } from '../lib/journey';
import { NAV_SECTIONS, navItemActive, navItemLocked, navPath, type NavItem } from '../lib/nav';
import { stageStatusColor } from '../lib/ui';
import { useWorkspace } from '../lib/workspace';
import { Mark } from './Mark';

function HealthDot() {
  const query = useQuery({
    queryKey: ['health'],
    queryFn: health.check,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const ok = query.data?.status === 'ok';
  return (
    <span
      title={
        query.isError
          ? 'Backend unreachable'
          : `${query.data?.service ?? 'EcoMind'} ${query.data?.version ?? ''}`.trim()
      }
      className="flex items-center gap-1.5 text-2xs font-medium text-neutral-600"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: ok ? 'var(--ok)' : 'var(--ink-faint)' }}
      />
      <span className="truncate">{ok ? 'Connected' : query.isError ? 'Offline' : 'Checking'}</span>
    </span>
  );
}

function Item({
  item,
  pathname,
  datasetId,
  statuses,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  datasetId: string | null;
  statuses: StageStatuses;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const isLocked = navItemLocked(item, datasetId, statuses);
  const active = item.built && !isLocked && navItemActive(item, pathname);

  const status = item.stageKey ? (statuses[item.stageKey] ?? 'pending') : null;
  const dotColor = status ? stageStatusColor(status) : null;
  const showDot = Boolean(status && status !== 'pending');

  const className = cn(
    'group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-fast',
    collapsed && 'justify-center px-0',
    active
      ? 'bg-brand-tint font-semibold text-brand'
      : isLocked
        ? 'cursor-not-allowed text-neutral-400'
        : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-800',
  );

  const label = (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && !item.built && (
        <span className="shrink-0 rounded border border-[var(--line)] px-1 text-2xs font-medium uppercase tracking-wide text-neutral-500">
          Soon
        </span>
      )}
      {!collapsed && item.built && isLocked && <Lock className="h-3 w-3 shrink-0" aria-hidden />}
      {!collapsed && item.built && !isLocked && status === 'done' && (
        <Check className="h-3 w-3 shrink-0" style={{ color: dotColor ?? undefined }} aria-hidden />
      )}
      {collapsed && showDot && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor ?? undefined }}
        />
      )}
      {collapsed && item.built && isLocked && (
        <Lock className="absolute bottom-1 right-1 h-2.5 w-2.5 text-neutral-400" aria-hidden />
      )}
    </>
  );

  const title = item.built
    ? isLocked
      ? item.gate === 'analytics'
        ? `${item.label} — complete data preparation to unlock`
        : `${item.label} — complete the earlier stages first`
      : item.label
    : `${item.label} — coming in a later phase`;

  if (!item.built || isLocked) {
    return (
      <div aria-disabled="true" title={title} className={className}>
        {label}
      </div>
    );
  }

  return (
    <Link
      to={navPath(item, datasetId)}
      title={title}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={className}
    >
      {label}
    </Link>
  );
}

/**
 * The primary navigation: one sidebar for both halves of the product.
 *
 * Preparation items carry a status dot because their state is what determines
 * whether the analytics workspace is open. Analytics items are locked as a
 * group until every preparation stage is done — the same promise the pipeline
 * has always made, now expressed where the user actually navigates.
 */
export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const datasetId = useJourney((s) => s.activeDatasetId);
  const statuses = useJourney((s) => s.stageStatuses);
  const { sidebarCollapsed, toggleSidebar, navOpen, setNavOpen } = useWorkspace();

  const progress = progressStats(statuses);
  const ready = analyticsReady(statuses);

  return (
    <>
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-[var(--overlay)] md:hidden"
        />
      )}
      <aside
        aria-label="Primary"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-[var(--line)] bg-[var(--surface)]',
          'transition-[transform,width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[68px]' : 'w-60',
          navOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex h-12 shrink-0 items-center border-b border-[var(--line)] px-3',
            sidebarCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!sidebarCollapsed && (
            <Link to="/" onClick={() => setNavOpen(false)} className="shrink-0">
              <Mark />
            </Link>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="hidden shrink-0 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700 md:inline-flex"
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-50 md:hidden"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.id} className="mb-4 last:mb-0">
              {!sidebarCollapsed && <p className="eyebrow px-2 pb-1.5">{section.label}</p>}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <Item
                      item={item}
                      pathname={pathname}
                      datasetId={datasetId}
                      statuses={statuses}
                      collapsed={sidebarCollapsed}
                      onNavigate={() => setNavOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--line)] px-3 py-2.5">
          {sidebarCollapsed ? (
            <div className="flex justify-center">
              <HealthDot />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-medium text-neutral-600">
                  {ready ? 'Analytics ready' : 'Preparation'}
                </span>
                <span className="num text-2xs text-neutral-500">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <HealthDot />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
