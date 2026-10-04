import { describe, expect, it } from 'vitest';
import { datasetIdForPath, stageForPath } from '../journey';

/**
 * The dataset parameter must be found on *every* route that carries one.
 *
 * This used to hold only for stage routes. Workspace routes -- `/explore`,
 * `/compare`, `/datasets` -- are not stages, so they have no `StageDef` to read
 * a parameter position from, and the function returned null. The consequence was
 * invisible until you used the product: those pages rendered their own content
 * correctly while the shell around them believed no dataset was active. The top
 * bar read "Select a dataset", the sidebar showed no progress, and a user
 * arriving on a shared workspace link got a page with no context around it.
 *
 * Every global scope feature -- the context bar, the estate navigator, the
 * cross-filter -- binds to the active dataset, so this function being right is
 * a prerequisite for the whole context layer, not a small nicety.
 */

const DATASET = 'b13c23f0-0666-4d1e-82b3-06d4b488935a';
const OTHER = '317babde-23b5-4c06-a68e-51bea9769f4d';

describe('datasetIdForPath — stage routes', () => {
  it('finds the parameter on a stage route', () => {
    expect(datasetIdForPath(`/forecast/${DATASET}`, 'forecast')).toBe(DATASET);
  });

  it('returns null on a stage route that declares no parameter', () => {
    // /library takes no dataset.
    expect(stageForPath('/library')).toBe('library');
    expect(datasetIdForPath('/library', 'library')).toBeNull();
  });
});

describe('datasetIdForPath — workspace routes', () => {
  it('finds the parameter on /explore', () => {
    expect(stageForPath(`/explore/${DATASET}`)).toBeNull();
    expect(datasetIdForPath(`/explore/${DATASET}`, null)).toBe(DATASET);
  });

  it('finds the parameter on /compare and /datasets', () => {
    expect(datasetIdForPath(`/compare/${DATASET}`, null)).toBe(DATASET);
    expect(datasetIdForPath(`/datasets/${DATASET}`, null)).toBe(DATASET);
  });

  it('ignores literal segments that are not ids', () => {
    // /analyses has no dataset at all. Treating "analyses" as one would bind
    // the whole product to a dataset named "analyses".
    expect(datasetIdForPath('/analyses', null)).toBeNull();
    expect(datasetIdForPath('/', null)).toBeNull();
  });

  it('tolerates a trailing slash', () => {
    expect(datasetIdForPath(`/explore/${DATASET}/`, null)).toBe(DATASET);
  });
});

describe('datasetIdForPath — the run-id trap', () => {
  /**
   * A run id is shaped exactly like a dataset id, so this function returns it.
   * That is intended: it locates the parameter, it does not judge it. The
   * judgement is made by `RouteGuard`, which asks the server before adopting
   * anything into persisted state.
   *
   * This test exists to document that boundary. If it ever starts returning null
   * for uuid-shaped segments, the guard loses its chance to refuse and a run id
   * silently becomes a dataset again.
   */
  it('surfaces a run id so the guard can refuse it', () => {
    const runId = '0af1984d-bba6-4705-b8a7-c3bd168f33f8';
    expect(datasetIdForPath(`/forecast/${runId}`, null)).toBe(runId);
  });
});

describe('different datasets stay distinct', () => {
  it('does not confuse two datasets', () => {
    expect(datasetIdForPath(`/explore/${DATASET}`, null)).toBe(DATASET);
    expect(datasetIdForPath(`/explore/${OTHER}`, null)).toBe(OTHER);
    expect(datasetIdForPath(`/explore/${DATASET}`, null)).not.toBe(
      datasetIdForPath(`/explore/${OTHER}`, null),
    );
  });
});
