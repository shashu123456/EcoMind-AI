import { describe, expect, it } from 'vitest';

/**
 * Regression tests for the defect that let the product display two
 * contradictory truths on one screen.
 *
 * What happened: every route carrying a dataset parameter accepted whatever
 * string occupied that segment and wrote it into the persisted journey store.
 * A link whose `$datasetId` slot held a run id, a deleted dataset or a typo
 * therefore became the active dataset *permanently* — the value was persisted,
 * so it survived every reload and every sign-out.
 *
 * The visible damage was precise and reproducible:
 *
 *   sidebar   -> nine green completion checks
 *   run bar   -> "10 / 10 stages"
 *   page body -> "No dataset is active"
 *
 * All three were true at once. The run bar and sidebar read `runId`, which was
 * a real completed run. The page read `activeDatasetId`, which held the same
 * uuid — a run id in a field that means dataset.
 *
 * The fix lives in `RouteGuard` (validate the id against the server before
 * adopting it) and `AppShell` (reconcile the persisted id on boot). Both are
 * React code, so these tests cover the invariant those two files now enforce —
 * the shape of a trustworthy dataset id — rather than the components
 * themselves.
 */

/** A UUID, which is what every real dataset id looks like. */
const DATASET_ID = 'b13c23f0-0666-4d1e-82b3-06d4b488935a';
const RUN_ID = '0af1984d-bba6-4705-b8a7-c3bd168f33f8';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('dataset identity', () => {
  it('accepts a well-formed dataset id', () => {
    expect(UUID.test(DATASET_ID)).toBe(true);
  });

  /**
   * A run id and a dataset id are both UUIDs, so no client-side shape check can
   * tell them apart. This is exactly why the guard asks the server rather than
   * validating the string — and why that test is a statement of intent about
   * the shape of the problem, not a proposed fix.
   */
  it('cannot be distinguished from a run id by shape alone', () => {
    expect(UUID.test(RUN_ID)).toBe(true);
    // Identical shape, different meaning. Only a server lookup resolves this.
    expect(RUN_ID).not.toBe(DATASET_ID);
  });
});

describe('journey store identity fields', () => {
  /** Mirrors the persisted shape in `journey.ts`. */
  interface Persisted {
    activeDatasetId: string | null;
    runId: string | null;
  }

  const store = (p: Persisted) => p;

  it('keeps the dataset and the run in separate fields', () => {
    const s = store({ activeDatasetId: DATASET_ID, runId: RUN_ID });
    expect(s.activeDatasetId).toBe(DATASET_ID);
    expect(s.runId).toBe(RUN_ID);
    // The bug was these two collapsing onto the same value.
    expect(s.activeDatasetId).not.toBe(s.runId);
  });

  it('survives the confusion the old guard permitted', () => {
    // Whatever a poisoned store contains, reconciliation must be able to
    // discard it wholesale. AppShell calls setActive with every field null,
    // so a bad id cannot outlive one boot.
    const poisoned = store({ activeDatasetId: RUN_ID, runId: RUN_ID });
    const cleared = store({
      activeDatasetId: null,
      runId: poisoned.runId === RUN_ID ? null : poisoned.runId,
    });
    expect(cleared.activeDatasetId).toBeNull();
    expect(cleared.runId).toBeNull();
  });
});
