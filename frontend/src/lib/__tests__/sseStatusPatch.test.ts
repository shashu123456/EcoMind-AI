import { describe, it, expect } from 'vitest';
import { sseStatusPatch, STAGE_KEYS, statusesFromCompleted } from '../journey';

describe('sseStatusPatch', () => {
  it('maps stage_started to running', () => {
    expect(sseStatusPatch({ type: 'stage_started', stage_key: 'quality' })).toEqual({
      quality: 'running',
    });
  });

  it('maps stage_completed to done', () => {
    expect(sseStatusPatch({ type: 'stage_completed', stage_key: 'quality' })).toEqual({
      quality: 'done',
    });
  });

  it('maps stage_failed to failed, keeping the error out of the status map', () => {
    expect(sseStatusPatch({ type: 'stage_failed', stage_key: 'forecast', error: 'boom' })).toEqual({
      forecast: 'failed',
    });
  });

  it('maps blocked and skipped to their own states', () => {
    expect(sseStatusPatch({ type: 'stage_blocked', stage_key: 'report' })).toEqual({
      report: 'blocked',
    });
    expect(sseStatusPatch({ type: 'stage_skipped', stage_key: 'transformation' })).toEqual({
      transformation: 'skipped',
    });
  });

  it('returns a patch that never claims other stages changed', () => {
    // A dropped frame must not resurrect a finished stage.
    const patch = sseStatusPatch({ type: 'stage_completed', stage_key: 'import' });
    expect(Object.keys(patch ?? {})).toEqual(['import']);
  });

  it('ignores stage events with no stage key', () => {
    expect(sseStatusPatch({ type: 'stage_started' })).toBeNull();
    expect(sseStatusPatch({ type: 'stage_completed', stage_key: 7 })).toBeNull();
    expect(sseStatusPatch({ type: 'stage_completed', stage_key: null })).toBeNull();
  });

  it('refuses a key that is not a real stage, so junk never reaches storage', () => {
    expect(sseStatusPatch({ type: 'stage_completed', stage_key: 'dq_engine' })).toBeNull();
    expect(sseStatusPatch({ type: 'stage_started', stage_key: '__proto__' })).toBeNull();
  });

  it('ignores run-level and unknown event types', () => {
    expect(sseStatusPatch({ type: 'run_completed', stages_completed: STAGE_KEYS })).toBeNull();
    expect(sseStatusPatch({ type: 'progress', pct: 40 })).toBeNull();
  });

  it('ignores non-event payloads without throwing', () => {
    expect(sseStatusPatch(null)).toBeNull();
    expect(sseStatusPatch('stage_completed')).toBeNull();
    expect(sseStatusPatch(42)).toBeNull();
    expect(sseStatusPatch({})).toBeNull();
    expect(sseStatusPatch({ type: 5 })).toBeNull();
  });

  it('composes with statusesFromCompleted when a run finishes out of band', () => {
    // AppShell re-reads the run after a stream drops, so the pure helpers have
    // to agree on the same vocabulary.
    expect(sseStatusPatch({ type: 'stage_completed', stage_key: 'library' })).toEqual(
      pick(statusesFromCompleted(['library']), 'library'),
    );
  });
});

function pick(statuses: Record<string, string>, key: string) {
  return { [key]: statuses[key] };
}
