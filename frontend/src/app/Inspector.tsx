import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DetailDrawer, DetailList, DetailRow } from '../lib/ui';

/**
 * The inspector: record-level detail without leaving the page.
 *
 * A dashboard number is only trustworthy if a user can open it and see the rows
 * behind it. Rather than route to a detail page — which destroys the context
 * that made the number meaningful — anything inspectable calls `inspect()` and
 * the shell slides a drawer in from the right.
 */

export interface InspectorRow {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export interface InspectorGroup {
  heading?: string;
  rows: InspectorRow[];
}

export interface InspectorPayload {
  title: string;
  subtitle?: string;
  groups: InspectorGroup[];
  footer?: ReactNode;
}

interface InspectorCtx {
  open: boolean;
  payload: InspectorPayload | null;
  inspect: (payload: InspectorPayload) => void;
  close: () => void;
}

const InspectorContext = createContext<InspectorCtx | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<InspectorPayload | null>(null);
  const inspect = useCallback((next: InspectorPayload) => setPayload(next), []);
  const close = useCallback(() => setPayload(null), []);

  const value = useMemo<InspectorCtx>(
    () => ({ open: payload !== null, payload, inspect, close }),
    [payload, inspect, close],
  );

  return (
    <InspectorContext.Provider value={value}>
      {children}
      <DetailDrawer
        open={payload !== null}
        onClose={close}
        title={payload?.title ?? ''}
        subtitle={payload?.subtitle}
        footer={payload?.footer}
      >
        {payload?.groups.map((group, index) => (
          <section key={group.heading ?? index} className="mb-5 last:mb-0">
            {group.heading && <p className="eyebrow mb-1.5">{group.heading}</p>}
            <DetailList>
              {group.rows.map((row, rowIndex) => (
                <DetailRow key={`${row.label}-${rowIndex}`} label={row.label} mono={row.mono}>
                  {row.value}
                </DetailRow>
              ))}
            </DetailList>
          </section>
        ))}
      </DetailDrawer>
    </InspectorContext.Provider>
  );
}

export function useInspector(): InspectorCtx {
  const ctx = useContext(InspectorContext);
  if (!ctx) throw new Error('useInspector must be used within <InspectorProvider>');
  return ctx;
}
