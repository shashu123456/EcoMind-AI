import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, navItemLocked, navNeedsDataset, navPath } from '../nav';
import { STAGE_KEYS, statusesFromCompleted } from '../journey';

/**
 * The product used to gate navigation on stage prerequisites: an analytics page
 * stayed locked until the whole preparation phase had run, and the route guard
 * redirected anyone who arrived early. Both were removed, because whether a
 * person may *look* at a page is a different question from whether the pipeline
 * will *run* it, and answering the first one for them only ever hid work they
 * were sent to review.
 *
 * These tests exist to keep that decision from quietly coming back.
 */

const NOTHING_DONE = {};
const ALL_DONE = statusesFromCompleted(STAGE_KEYS);

describe('navItemLocked', () => {
  it('never locks a built page because a prerequisite has not run', () => {
    for (const item of NAV_ITEMS) {
      expect(navItemLocked(item, 'd1', NOTHING_DONE)).toBe(false);
    }
  });

  it('gives the same answer whether or not every stage has run', () => {
    for (const item of NAV_ITEMS) {
      expect(navItemLocked(item, 'd1', ALL_DONE)).toBe(navItemLocked(item, 'd1', NOTHING_DONE));
    }
  });

  it('only locks a dataset-scoped entry when no dataset is active', () => {
    for (const item of NAV_ITEMS) {
      const expected = navNeedsDataset(item);
      expect(navItemLocked(item, null, ALL_DONE)).toBe(expected);
    }
  });

  it('leaves entries that need no dataset open even with none active', () => {
    const standalone = NAV_ITEMS.filter((i) => !navNeedsDataset(i));
    expect(standalone.length).toBeGreaterThan(0);
    for (const item of standalone) {
      expect(navItemLocked(item, null, ALL_DONE)).toBe(false);
    }
  });
});

describe('navigation coverage', () => {
  it('has no unbuilt entries, so nothing in the sidebar is a dead end', () => {
    // "Soon" placeholders rendered as disabled text and were the most common
    // complaint about the shell: a navigation item you cannot open is worse
    // than no navigation item at all.
    const unbuilt = NAV_ITEMS.filter((i) => !i.built);
    expect(unbuilt).toEqual([]);
  });

  it('ships every stage page plus the four workspace pages', () => {
    const paths = NAV_ITEMS.map((i) => i.to);
    for (const p of [
      '/',
      '/library',
      '/import/$datasetId',
      '/schema/$datasetId',
      '/quality/$datasetId',
      '/transformation/$datasetId',
      '/model-selection/$datasetId',
      '/anomalies/$datasetId',
      '/forecast/$datasetId',
      '/report/$datasetId',
      '/explore/$datasetId',
      '/compare/$datasetId',
      '/datasets/$datasetId',
      '/analyses',
    ]) {
      expect(paths).toContain(p);
    }
  });

  it('gives every entry a unique id', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
  });
});

describe('navPath', () => {
  it('substitutes the dataset id', () => {
    const item = NAV_ITEMS.find((i) => i.to === '/anomalies/$datasetId');
    expect(navPath(item!, 'abc')).toBe('/anomalies/abc');
  });

  it('leaves the placeholder empty rather than printing undefined', () => {
    const item = NAV_ITEMS.find((i) => i.to === '/anomalies/$datasetId');
    expect(navPath(item!, null)).toBe('/anomalies/');
  });
});
