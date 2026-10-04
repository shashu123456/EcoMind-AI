import type { ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '../lib/ui';

/**
 * The boundary that keeps one broken page from taking the product with it.
 *
 * Every page except login arrives as a lazily-loaded chunk, so every page can
 * fail after the shell has already rendered — a chart fed a shape it did not
 * expect, a component reading a field a backend change removed, a genuine bug.
 * Without a boundary React unmounts the tree and the user gets a blank page
 * plus a console message they will never read, losing the sidebar, the dataset
 * selector, the scope bar and their filter state along with the page.
 *
 * TanStack renders `errorComponent` *in place of* the failed route and leaves
 * its parent layout mounted, which is exactly the containment wanted here: the
 * application stays navigable and only this page is replaced. `reset()` clears
 * the error and re-runs the route, so retrying is a real retry rather than a
 * reload.
 */

export function RouteErrorView({
  error,
  reset,
  label,
}: {
  error: unknown;
  reset?: () => void;
  label: string;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'The page failed for a reason the application could not describe.';

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="surface w-full max-w-lg p-6">
        <span className="eyebrow">This page could not load</span>
        <h1 className="mt-2 text-lg font-semibold text-[var(--ink)]">{label} is unavailable</h1>
        <p className="prose-muted mt-2 text-sm">
          The rest of the application is still running — your dataset, scope and navigation are
          untouched. Only this page failed, which usually means the data it expected has changed
          shape.
        </p>

        {/*
          Shown rather than hidden: a user who can see the reason can report
          something useful, and an error that reveals nothing is
          indistinguishable from a crash.
        */}
        <pre className="mono mt-4 max-h-40 overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface-inset)] p-3 text-xs text-[var(--ink-mid)]">
          {message}
        </pre>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => reset?.()}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.assign('/')}>
            Back to overview
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Build the `errorComponent` for a route.
 *
 * Returning a factory rather than a single shared component is what lets each
 * route name itself, so a failure says which page broke instead of "something
 * went wrong". Logging lives here so every route reports through one place
 * rather than each declaring its own handler and some of them forgetting.
 */
export function routeErrorComponent(label: string) {
  return function RouteError({ error, reset }: ErrorComponentProps) {
    if (error) console.error(`[route:${label}] render failed`, error);
    return <RouteErrorView error={error} reset={reset} label={label} />;
  };
}
