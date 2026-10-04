import type { ElementType, ReactNode } from 'react';
import { cn } from '../cn';

/**
 * The three spacing primitives (DESIGN_SPEC §10.2, REDESIGN_ROADMAP Phase 1).
 *
 * Pages currently spell their rhythm by hand: `gap-2`, `gap-4`, `flex-col`,
 * `grid lg:grid-cols-2`, repeated per screen with small variations. That is
 * where layout drift comes from — two screens that mean "a tight group of
 * things" pick different gaps and nothing notices.
 *
 * These three cover the whole vocabulary:
 *
 *   Stack   — one direction. A column or a row of things with a rhythm.
 *   Cluster — one direction, wrapping. A row of things that must reflow.
 *   Grid    — two dimensions, equal tracks.
 *
 * The `space` scale is the design system's own, not Tailwind's, so a density
 * change re-spaces every page that uses these rather than only the ones that
 * remembered to be updated.
 */

export type Space = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '8' | '10' | '12' | '16';

type PrimitiveProps = {
  children?: ReactNode;
  className?: string;
  /** Render as something else — a `section`, a `li`, a router `Link`. */
  as?: ElementType;
};

/** One direction of flow with a single gap. The workhorse. */
export function Stack({
  children,
  className,
  as: Tag = 'div',
  direction = 'column',
  space = '4',
  align,
  justify,
  ...rest
}: PrimitiveProps & {
  direction?: 'column' | 'row';
  space?: Space;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  [key: string]: unknown;
}) {
  return (
    <Tag
      className={cn('flex min-w-0', direction === 'column' ? 'flex-col' : 'flex-row', className)}
      style={{ gap: `var(--space-${space})`, ...pickAlign(align, justify) }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** One direction of flow that wraps. A `Stack direction="row"` that reflows. */
export function Cluster({
  children,
  className,
  as: Tag = 'div',
  space = '2',
  align = 'center',
  justify,
  ...rest
}: PrimitiveProps & {
  space?: Space;
  align?: 'start' | 'center' | 'end' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  [key: string]: unknown;
}) {
  return (
    <Tag
      className={cn('flex min-w-0 flex-wrap', className)}
      style={{ gap: `var(--space-${space})`, ...pickAlign(align, justify) }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Two dimensions. `columns` is a track count, not a width, so the track is
 * always equal and a row of four tiles never ends up with one wide orphan.
 * `minWidth` switches to `repeat(auto-fit, minmax(...))`, which is the right
 * answer whenever the items are cards of unknown count.
 */
export function Grid({
  children,
  className,
  as: Tag = 'div',
  columns = 2,
  space = '4',
  minWidth,
  align,
  ...rest
}: PrimitiveProps & {
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  space?: Space;
  /** Track floor, e.g. `'16rem'`. Overrides `columns` with auto-fit. */
  minWidth?: string;
  align?: 'start' | 'center' | 'end' | 'stretch';
  [key: string]: unknown;
}) {
  return (
    <Tag
      className={cn('grid min-w-0', className)}
      style={{
        gap: `var(--space-${space})`,
        gridTemplateColumns: minWidth
          ? `repeat(auto-fit, minmax(min(${minWidth}, 100%), 1fr))`
          : `repeat(${columns}, minmax(0, 1fr))`,
        alignItems: align,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function pickAlign(
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline',
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly',
): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (align) style.alignItems = align;
  if (justify) style.justifyContent = justify;
  return style;
}
