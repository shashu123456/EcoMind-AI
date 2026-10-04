import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../cn';

export type SortDir = 'asc' | 'desc';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Falls back to `String(row[key])`. */
  cell?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Numeric columns get tabular figures and are sortable by default. */
  numeric?: boolean;
  sortable?: boolean;
  width?: string;
  mono?: boolean;
}

export interface DataGridProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  caption?: ReactNode;
  sort?: { key: string; dir: SortDir };
  onSortChange?: (next: { key: string; dir: SortDir }) => void;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  empty?: ReactNode;
  /** Sticky header. Default true — these grids get long. */
  stickyHeader?: boolean;
  maxHeight?: string;
  className?: string;
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

/**
 * A plain, dense table. No sorting logic of its own beyond direction, no
 * client-side filtering, no virtualisation — those belong to the page, not the
 * grid, so the same table renders a 5-row anomaly summary and a 4,800-row
 * repair ledger without branching.
 */
export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  caption,
  sort,
  onSortChange,
  onRowClick,
  selectedKey,
  empty,
  stickyHeader = true,
  maxHeight,
  className,
}: DataGridProps<T>) {
  const sortable = Boolean(sort && onSortChange);

  function toggleSort(key: string) {
    if (!sort || !onSortChange) return;
    onSortChange({ key, dir: sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc' });
  }

  if (!rows.length) {
    return (
      <div className={cn('surface', className)}>
        {empty ?? (
          <div className="px-3.5 py-8 text-center">
            <p className="text-sm font-medium text-neutral-700">No rows to display</p>
            <p className="mt-1 text-xs text-neutral-600">
              Adjust the filters above, or run the stage to populate this table.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('surface overflow-hidden', className)}>
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const canSort = sortable && (col.sortable ?? col.numeric ?? false);
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    aria-sort={
                      active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cn(
                      'whitespace-nowrap px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-neutral-600',
                      ALIGN[col.align ?? (col.numeric ? 'right' : 'left')],
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-neutral-700',
                          active && 'text-neutral-800',
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort!.dir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const selected = key === selectedKey;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  className={cn(
                    'border-b border-[var(--line-faint)] last:border-0',
                    onRowClick && 'cursor-pointer transition-colors hover:bg-[var(--surface-2)]',
                    selected && 'bg-[var(--brand-tint)]',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-2 align-middle text-neutral-800',
                        col.numeric && 'num',
                        col.mono && 'mono',
                        ALIGN[col.align ?? (col.numeric ? 'right' : 'left')],
                      )}
                    >
                      {col.cell
                        ? col.cell(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
