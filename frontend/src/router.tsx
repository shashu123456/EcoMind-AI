import React from 'react'
import { createRouter, createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import { App } from './App'
import { LoginPage } from './pages/Login'
import { PageSkeleton } from './components/PageSkeleton'

const rootRoute = createRootRoute({
  component: () => <React.Suspense fallback={<PageSkeleton />}><Outlet /></React.Suspense>,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const appLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: '__app',
  component: App,
})

function stageRoute(path: string, importer: () => Promise<{ default: React.ComponentType }>) {
  const Component = React.lazy(importer)
  return createRoute({
    getParentRoute: () => appLayout,
    path,
    component: () => (
      <React.Suspense fallback={<PageSkeleton />}>
        <Component />
      </React.Suspense>
    ),
  })
}

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayout.addChildren([
    stageRoute('/', () => import('./pages/Dashboard')),
    stageRoute('/dashboard', () => import('./pages/Dashboard')),
    stageRoute('/journey-complete', () => import('./pages/JourneyComplete')),
    stageRoute('/library', () => import('./pages/Library')),
    stageRoute('/import/$datasetId', () => import('./pages/Import')),
    stageRoute('/preview/$datasetId', () => import('./pages/RawPreview')),
    stageRoute('/schema/$datasetId', () => import('./pages/SchemaDiscovery')),
    stageRoute('/dq/$datasetId', () => import('./pages/DQEngine')),
    stageRoute('/transformations/$datasetId', () => import('./pages/Transformations')),
    stageRoute('/features/$datasetId', () => import('./pages/FeatureEngineering')),
    stageRoute('/prediction/$datasetId', () => import('./pages/Prediction')),
    stageRoute('/confidence/$runId', () => import('./pages/ConfidenceGate')),
    stageRoute('/comparison/$runId', () => import('./pages/RawProcessedComparison')),
    stageRoute('/shap/$modelId', () => import('./pages/SHAPExplainability')),
    stageRoute('/anomalies/$datasetId', () => import('./pages/AnomalyDetection')),
    stageRoute('/benchmarks/$datasetId', () => import('./pages/Benchmarking')),
    stageRoute('/recommendations/$datasetId', () => import('./pages/Recommendations')),
    stageRoute('/executive', () => import('./pages/ExecutiveCenter')),
    stageRoute('/reports', () => import('./pages/ReportGeneration')),
    stageRoute('/history', () => import('./pages/History')),
    stageRoute('/scorecard', () => import('./pages/Scorecard')),
  ]),
])

export const router = createRouter({ routeTree })