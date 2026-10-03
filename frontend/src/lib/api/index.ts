/**
 * The API barrel.
 *
 * Six modules, one per real surface: session, health, datasets, and the run /
 * stage pair that every pipeline page reads from. There is no `quality`,
 * `preparation` or `analytics` module -- those described the deleted
 * seventeen-stage backend, where each stage had its own REST endpoints. The
 * ten-stage backend has one endpoint per stage, and it is
 * `GET /workflows/{run_id}/stages/{stage_key}`.
 */

export * from './client';
export * from './types';

export * as auth from './auth';
export * as health from './health';
export * as datasets from './datasets';
export * as runs from './runs';
