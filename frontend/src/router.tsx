import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouteComponent,
} from '@tanstack/react-router';
import { AppShell } from './app/AppShell';
import { errorMessage } from './lib/api';
import { STAGE_BY_KEY } from './lib/journey';
import { Button, EmptyState, ErrorState } from './lib/ui';
import {
  AnomaliesPage,
  DataQualityPage,
  ForecastPage,
  ImportPage,
  LibraryPage,
  LoginPage,
  ModelSelectionPage,
  RecommendationsPage,
  ReportPage,
  SchemaPage,
  StatusPage,
  TransformationPage,
} from './pages';

/**
 * Twelve routes for a ten-stage product.
 *
 * Each stage owns exactly one path, and the path is declared once in
 * `lib/journey.ts`. This file adds only the parts a router needs — the param,
 * and the component. A stage cannot acquire a second URL, because there is
 * nowhere here to declare one.
 */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
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
const recommendationsRoute = stageRoute(STAGE_BY_KEY.recommendation.path, RecommendationsPage);
const reportRoute = stageRoute(STAGE_BY_KEY.report.path, ReportPage);

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
    recommendationsRoute,
    reportRoute,
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
