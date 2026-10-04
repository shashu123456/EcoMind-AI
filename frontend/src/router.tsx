import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouteComponent,
} from '@tanstack/react-router';
import { AppShell } from './app/AppShell';
import { routeErrorComponent } from './app/RouteErrorBoundary';
import { errorMessage } from './lib/api';
import { STAGE_BY_KEY } from './lib/journey';
import { Button, EmptyState, ErrorState } from './lib/ui';
import {
  AnomaliesPage,
  ComparePage,
  DataQualityPage,
  DatasetDetailPage,
  ExplorePage,
  ForecastPage,
  ImportPage,
  LibraryPage,
  LoginPage,
  ModelSelectionPage,
  RecentAnalysesPage,
  ReportPage,
  SchemaPage,
  StatusPage,
  TransformationPage,
} from './pages';

/**
 * Fifteen routes: one sign-in, nine stage routes, four workspace routes, and
 * the overview that opens at `/`.
 *
 * Each stage owns exactly one path, and the path is declared once in
 * `lib/journey.ts`. This file adds only the parts a router needs — the param,
 * and the component. A stage cannot acquire a second URL, because there is
 * nowhere here to declare one.
 *
 * Nine of the ten stages have a route of their own. The tenth — the
 * recommendation stage — deliberately does not: its action plan is a tab of
 * the report page, so two stages share one URL and the reader who wants to
 * know what to do is never navigated away from the document that tells them.
 */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
  // Last line of defence. If the shell itself throws, there is no chrome left
  // to preserve, so this one is allowed to take the whole page — but it still
  // says what happened and offers a way back instead of showing a blank screen.
  errorComponent: routeErrorComponent('EcoMind'),
});

/** Pathless layout: everything except sign-in lives inside the shell. */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: AppShell,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const statusRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  component: StatusPage,
});

/**
 * Declare one stage route from its definition.
 *
 * The path is read from `lib/journey.ts` rather than written here, so the URL
 * a stage lives at has exactly one source of truth. The lookup throws at module
 * load if the two ever disagree, which is a build-time failure rather than a
 * 404 nobody notices until a user reports it.
 *
 * The leading slash is stripped because a child route's path is relative to its
 * parent. `lib/journey.ts` keeps the absolute form — that is what a caller
 * needs when it builds a link.
 */
/**
 * Drop the leading slash. A child route's path is relative to its parent, and
 * the literal type has to survive so the router can type-check every link.
 */
type RelativePath<P extends string> = P extends `/${infer Rest}` ? Rest : P;

function stageRoute<P extends `/${string}`>(path: P, Component: RouteComponent) {
  return createRoute({
    getParentRoute: () => shellRoute,
    path: path.slice(1) as RelativePath<P>,
    /*
     * Every page but login is a lazily-loaded chunk, so every page can fail
     * after the shell has rendered. Applied here rather than at each call site
     * so a route declared in future cannot forget it — a boundary someone has
     * to remember to add is one that eventually is missing exactly when it is
     * needed. `errorComponent` replaces the failed route while leaving the
     * shell mounted, so the app stays navigable.
     */
    errorComponent: routeErrorComponent(String(path)),
    component: Component,
  });
}

const libraryRoute = stageRoute(STAGE_BY_KEY.library.path, LibraryPage);
const importRoute = stageRoute(STAGE_BY_KEY.import.path, ImportPage);
const schemaRoute = stageRoute(STAGE_BY_KEY.schema.path, SchemaPage);
const qualityRoute = stageRoute(STAGE_BY_KEY.quality.path, DataQualityPage);
const transformationRoute = stageRoute(STAGE_BY_KEY.transformation.path, TransformationPage);
const modelSelectionRoute = stageRoute(STAGE_BY_KEY.model_selection.path, ModelSelectionPage);
const anomaliesRoute = stageRoute(STAGE_BY_KEY.anomaly.path, AnomaliesPage);
const forecastRoute = stageRoute(STAGE_BY_KEY.forecast.path, ForecastPage);
const reportRoute = stageRoute(STAGE_BY_KEY.report.path, ReportPage);

// Workspace pages. Not stages, so they carry no StageDef: they read the dataset
// directly and are reachable whether or not any stage has run.
function workspaceRoute<P extends `/${string}`>(path: P, Component: RouteComponent) {
  return createRoute({
    getParentRoute: () => shellRoute,
    path: path.slice(1) as RelativePath<P>,
    // Same containment as stage routes: these are lazy chunks too, and the
    // workspace pages are the ones most likely to hit an unexpected dataset
    // shape because they read the dataset directly rather than a stage output.
    errorComponent: routeErrorComponent(String(path)),
    component: Component,
  });
}

const exploreRoute = workspaceRoute('/explore/$datasetId', ExplorePage);
const compareRoute = workspaceRoute('/compare/$datasetId', ComparePage);
const datasetRoute = workspaceRoute('/datasets/$datasetId', DatasetDetailPage);
const analysesRoute = workspaceRoute('/analyses', RecentAnalysesPage);

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([
    statusRoute,
    libraryRoute,
    importRoute,
    schemaRoute,
    qualityRoute,
    transformationRoute,
    modelSelectionRoute,
    anomaliesRoute,
    forecastRoute,
    reportRoute,
    exploreRoute,
    compareRoute,
    datasetRoute,
    analysesRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultErrorComponent: RouteError,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function NotFound() {
  return (
    <div className="page-gutter py-12">
      <EmptyState
        title="That page is not part of EcoMind"
        description="The address does not match any stage. Start from the dataset library, or pick a stage below."
        action={
          <Link to="/library">
            <Button variant="primary">Go to the library</Button>
          </Link>
        }
      />
    </div>
  );
}

/**
 * A render failure should read as a fault, not as a blank page. The technical
 * detail stays available because the platform is used by engineers, but the
 * headline says what to do.
 */
function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <div className="page-gutter py-8">
      <ErrorState
        title="This page could not be rendered"
        message={errorMessage(error, 'An unexpected error occurred.')}
        onRetry={reset}
      />
    </div>
  );
}
