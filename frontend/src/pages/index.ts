import { lazyRouteComponent } from '@tanstack/react-router';

/**
 * Every page, loaded on demand.
 *
 * This barrel was fifteen static re-exports, which pulled all sixteen pages --
 * and every chart they reach for -- into the initial bundle. Recharts alone
 * dominated it: a single 892 kB entry chunk meant a visitor downloaded the
 * forecasting engine, the anomaly toolkit and the report layout before they
 * could read a login screen.
 *
 * `lazyRouteComponent` splits each page into its own chunk. It is used rather
 * than React's own `lazy` for two reasons that matter here: it is typed as the
 * router's `RouteComponent`, so the routes need no casts, and it carries a
 * `preload()` method the router can call. `defaultPreload: 'intent'` in
 * `router.tsx` means hovering a sidebar link fetches its chunk before the
 * click -- which is what keeps this invisible rather than feeling like a
 * spinner on every navigation.
 *
 * Every page here uses a named export, so each call names the export it wants.
 * Saying so in one file rather than adding a `export default` to fifteen pages
 * keeps the pages' own module shape untouched.
 *
 * Login is deliberately not lazy. It is the first thing almost everyone sees,
 * it is small, and a login screen that waits on a network round trip to appear
 * is worse than one that ships in the entry chunk.
 */
export { LoginPage } from './LoginPage';

export const StatusPage = lazyRouteComponent(() => import('./StatusPage'), 'StatusPage');
export const LibraryPage = lazyRouteComponent(() => import('./LibraryPage'), 'LibraryPage');
export const ImportPage = lazyRouteComponent(() => import('./ImportPage'), 'ImportPage');
export const SchemaPage = lazyRouteComponent(() => import('./SchemaPage'), 'SchemaPage');
export const ComparePage = lazyRouteComponent(() => import('./ComparePage'), 'ComparePage');
export const DataQualityPage = lazyRouteComponent(
  () => import('./DataQualityPage'),
  'DataQualityPage',
);
export const DatasetDetailPage = lazyRouteComponent(
  () => import('./DatasetDetailPage'),
  'DatasetDetailPage',
);
export const TransformationPage = lazyRouteComponent(
  () => import('./TransformationPage'),
  'TransformationPage',
);
export const ModelSelectionPage = lazyRouteComponent(
  () => import('./ModelSelectionPage'),
  'ModelSelectionPage',
);
export const AnomaliesPage = lazyRouteComponent(() => import('./AnomaliesPage'), 'AnomaliesPage');
export const ExplorePage = lazyRouteComponent(() => import('./ExplorePage'), 'ExplorePage');
export const ForecastPage = lazyRouteComponent(() => import('./ForecastPage'), 'ForecastPage');
export const RecentAnalysesPage = lazyRouteComponent(
  () => import('./RecentAnalysesPage'),
  'RecentAnalysesPage',
);
export const ReportPage = lazyRouteComponent(() => import('./ReportPage'), 'ReportPage');
