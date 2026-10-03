import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import {
  PHASES,
  STAGE_BY_KEY,
  TOTAL_STAGES,
  type StageKey,
  type StageStatus,
} from '../lib/journey';
import { HeroMetric, StageStatusTag } from '../lib/ui';

/**
 * Every page in this product is the same shape, and the shape is the argument
 * the product makes:
 *
 *   1. purpose  — what this stage is for
 *   2. hero     — the single number that answers the stage's question
 *   3. conclusion — what that number means in words
 *   4. evidence — the charts, tables and ledgers behind it
 *
 * A reader should be able to stop after (3) and act correctly. Everything in
 * (4) exists so the number can be defended.
 */

type HeroSlot = 'hero' | 'body' | null;

const HeroSlotContext = createContext<HeroSlot>(null);

/**
 * The one hero slot.
 *
 * A stage's hero number can only be computed once the stage's own output has
 * loaded, so pages render `<PageHero>` inside `<StageGate>` — the body slot.
 * It may therefore appear in the `hero` prop or in the gated body, but it must
 * be inside a `PageFrame`: a hero with no page frame has no header to answer to.
 */
export function PageHero(props: ComponentProps<typeof HeroMetric>) {
  const slot = useContext(HeroSlotContext);
  if (slot === null) {
    throw new Error(
      '<PageHero> must be rendered inside <PageFrame>. A page has exactly one hero, and it belongs inside the page frame.',
    );
  }
  return <HeroMetric {...props} />;
}

export interface PageFrameProps {
  /**
   * Which of the 10 stages this page is. Drives the header copy. Omit only for
   * the product's own pages (the landing page), and then give `title` and
   * `subtitle` explicitly.
   */
  stage?: StageKey;
  title?: string;
  subtitle?: string;
  /** Live status of the stage, shown as a tag beside the phase name. */
  status?: StageStatus;
  /** Right-aligned header controls: run, download, download-raw, filter. */
  actions?: ReactNode;
  /** The single dominant conclusion. See {@link PageHero}. */
  hero?: ReactNode;
  /** One or two sentences saying what the hero number means. */
  conclusion?: ReactNode;
  /** Supporting detail — charts, ledgers, tables. */
  children?: ReactNode;
  /** Narrow right-hand column for filters, method notes and provenance. */
  aside?: ReactNode;
  /** Page-level actions, e.g. Continue to the next stage. */
  footer?: ReactNode;
  className?: string;
}

export function PageFrame({
  stage,
  title,
  subtitle,
  status,
  actions,
  hero,
  conclusion,
  children,
  aside,
  footer,
  className,
}: PageFrameProps) {
  const def = stage ? STAGE_BY_KEY[stage] : undefined;
  if (stage && !def) throw new Error(`<PageFrame> received unknown stage "${stage}".`);
  if (!def && !title) throw new Error('<PageFrame> needs either a stage or a title.');
  const phase = def ? PHASES.find((p) => p.key === def.phase) : undefined;

  return (
    <div className={cn('page-gutter flex flex-col gap-5 py-5', className)}>
      <header className="flex flex-col gap-3 border-b border-neutral-300 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow num">
              {def ? `Stage ${def.index + 1} / ${TOTAL_STAGES}` : 'EcoMind'}
            </span>
            {phase && (
              <>
                <span aria-hidden className="text-neutral-500">
                  ·
                </span>
                <span className="text-2xs font-semibold uppercase tracking-widest text-neutral-600">
                  {phase.label} phase
                </span>
              </>
            )}
            {status && <StageStatusTag status={status} />}
          </div>
          <h1 className="mt-2 max-w-3xl text-2xl font-semibold text-neutral-800">
            {def ? def.answers : title}
          </h1>
          <p className="prose-muted mt-1 max-w-3xl text-md">{def ? def.purpose : subtitle}</p>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
        )}
      </header>

      {hero && (
        <HeroSlotContext.Provider value="hero">
          <div data-slot="hero">{hero}</div>
        </HeroSlotContext.Provider>
      )}

      <HeroSlotContext.Provider value="body">
        {conclusion && (
          <section
            aria-label="What this means"
            data-slot="conclusion"
            className="surface-inset border-l-2 border-l-brand px-4 py-3"
          >
            <span className="eyebrow">What this means</span>
            <div className="prose-muted mt-1 max-w-3xl text-md">{conclusion}</div>
          </section>
        )}

        <div
          data-slot="body"
          className={cn('grid min-w-0 gap-4', aside && 'xl:grid-cols-[minmax(0,1fr)_21rem]')}
        >
          <div className="flex min-w-0 flex-col gap-4">{children}</div>
          {aside && <div className="flex min-w-0 flex-col gap-4">{aside}</div>}
        </div>

        {footer && (
          <footer data-slot="footer" className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {footer}
          </footer>
        )}
      </HeroSlotContext.Provider>
    </div>
  );
}
