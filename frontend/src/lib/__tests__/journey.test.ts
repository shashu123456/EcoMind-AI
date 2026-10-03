import { describe, it, expect } from 'vitest';
import {
  PHASES,
  STAGES,
  STAGE_BY_KEY,
  STAGE_KEYS,
  TOTAL_STAGES,
  continuePath,
  firstIncomplete,
  isDone,
  isReachable,
  nextStage,
  phaseProgress,
  phaseStatus,
  progressStats,
  stagePath,
  stagesForPhase,
  statusesFromCompleted,
  type StageStatuses,
} from '../journey';

const ALL_DONE: StageStatuses = statusesFromCompleted(STAGE_KEYS);

describe('stage registry', () => {
  it('is ten stages across two phases', () => {
    expect(TOTAL_STAGES).toBe(10);
    expect(STAGES).toHaveLength(10);
    expect(PHASES).toHaveLength(2);
  });

  it('indexes stages contiguously from zero, in array order', () => {
    expect(STAGES.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('has unique keys and one lookup entry per stage', () => {
    expect(new Set(STAGE_KEYS).size).toBe(10);
    for (const stage of STAGES) expect(STAGE_BY_KEY[stage.key]).toBe(stage);
  });

  it('carries a real route, purpose and answer for every stage', () => {
    for (const stage of STAGES) {
      expect(stage.path.startsWith('/')).toBe(true);
      expect(stage.purpose.length).toBeGreaterThan(10);
      expect(stage.answers.length).toBeGreaterThan(10);
      expect(stage.short.length).toBeGreaterThan(0);
    }
  });

  it('leaves only the library ungated', () => {
    expect(STAGES.filter((s) => !s.gated).map((s) => s.key)).toEqual(['library']);
  });

  it('places the phase gate between model selection and anomaly detection', () => {
    const preparation = stagesForPhase('preparation');
    const decision = stagesForPhase('decision');
    expect(preparation.map((s) => s.key)).toEqual([
      'library',
      'import',
      'schema',
      'quality',
      'transformation',
      'model_selection',
    ]);
    expect(decision.map((s) => s.key)).toEqual(['anomaly', 'forecast', 'recommendation', 'report']);
    expect(PHASES.map((p) => p.key)).toEqual(['preparation', 'decision']);
  });

  it('routes every dataset-scoped stage through $datasetId', () => {
    for (const stage of STAGES) {
      if (stage.key === 'library') continue;
      expect(stage.path).toContain('$datasetId');
    }
  });
});

describe('statuses', () => {
  it('treats only done as complete', () => {
    expect(isDone({ library: 'done' }, 'library')).toBe(true);
    expect(isDone({ library: 'running' }, 'library')).toBe(false);
    expect(isDone({ library: 'failed' }, 'library')).toBe(false);
    expect(isDone({}, 'library')).toBe(false);
  });

  it('builds a full map from a completed list', () => {
    const statuses = statusesFromCompleted(['library', 'import']);
    expect(statuses.library).toBe('done');
    expect(statuses.import).toBe('done');
    expect(statuses.quality).toBe('pending');
    expect(Object.keys(statuses)).toHaveLength(10);
  });

  it('ignores keys that are not stages', () => {
    const statuses = statusesFromCompleted(['library', 'dq_engine']);
    expect(statuses).not.toHaveProperty('dq_engine');
    expect(statuses.library).toBe('done');
  });

  it('ignores unknown statuses as incomplete', () => {
    expect(isDone({ library: 'whatever' } as unknown as StageStatuses, 'library')).toBe(false);
  });
});

describe('reachability', () => {
  it('always allows the library', () => {
    expect(isReachable(STAGE_BY_KEY.library, {})).toBe(true);
  });

  it('locks the first dataset stage until the library is done', () => {
    expect(isReachable(STAGE_BY_KEY.import, {})).toBe(false);
    expect(isReachable(STAGE_BY_KEY.import, { library: 'done' })).toBe(true);
  });

  it('requires all six preparation stages before the decision phase opens', () => {
    const anomaly = STAGE_BY_KEY.anomaly;
    const fiveOfSix = statusesFromCompleted(STAGE_KEYS.slice(0, 5));
    expect(isReachable(anomaly, fiveOfSix)).toBe(false);
    expect(isReachable(anomaly, statusesFromCompleted(STAGE_KEYS.slice(0, 6)))).toBe(true);
  });

  it('treats a failed preparation stage as blocking', () => {
    expect(isReachable(STAGE_BY_KEY.forecast, { library: 'done', quality: 'failed' })).toBe(false);
  });
});

describe('progress', () => {
  it('is zero when nothing is done', () => {
    expect(progressStats({})).toEqual({ done: 0, total: 10, pct: 0 });
  });

  it('is one hundred only when every stage is done', () => {
    expect(progressStats(ALL_DONE)).toEqual({ done: 10, total: 10, pct: 100 });
    const nine = statusesFromCompleted(STAGE_KEYS.slice(0, 9));
    expect(progressStats(nine)).toEqual({ done: 9, total: 10, pct: 90 });
  });

  it('counts the two phases separately', () => {
    const preparation = statusesFromCompleted(STAGE_KEYS.slice(0, 3));
    expect(phaseProgress(preparation, 'preparation')).toEqual({ done: 3, total: 6, pct: 50 });
    expect(phaseProgress(preparation, 'decision')).toEqual({ done: 0, total: 4, pct: 0 });
  });

  it('reports not-started, in-progress, blocked and complete', () => {
    expect(phaseStatus({}, 'preparation')).toBe('not-started');
    expect(phaseStatus({ library: 'done' }, 'preparation')).toBe('in-progress');
    expect(phaseStatus({ library: 'running' }, 'preparation')).toBe('in-progress');
    expect(phaseStatus({ library: 'failed' }, 'preparation')).toBe('blocked');
    expect(phaseStatus({ quality: 'blocked' }, 'preparation')).toBe('blocked');
    expect(phaseStatus(statusesFromCompleted(STAGE_KEYS.slice(0, 6)), 'preparation')).toBe(
      'complete',
    );
  });

  it('finds the next and first incomplete stage', () => {
    expect(nextStage({})?.key).toBe('library');
    expect(nextStage(statusesFromCompleted(STAGE_KEYS.slice(0, 6)))?.key).toBe('anomaly');
    expect(nextStage(ALL_DONE)).toBeNull();
    expect(firstIncomplete(STAGES, {})?.key).toBe('library');
    expect(firstIncomplete(STAGES, ALL_DONE)).toBeNull();
  });
});

describe('paths', () => {
  it('substitutes the dataset id', () => {
    expect(stagePath(STAGE_BY_KEY.quality, 'd1')).toBe('/quality/d1');
    expect(stagePath(STAGE_BY_KEY.library, 'd1')).toBe('/library');
  });

  it('leaves no dangling slash when there is no dataset yet', () => {
    expect(stagePath(STAGE_BY_KEY.quality, null)).toBe('/quality/');
  });

  it('only offers a continue target the user can actually reach', () => {
    expect(continuePath('library', { library: 'done' }, 'd1')).toBe('/import/d1');
    // Data quality is not reachable yet, so the rail must not offer "continue".
    expect(continuePath('library', { library: 'done' }, 'd1')).not.toBe('/quality/d1');
  });

  it('stops continuing at the end of the pipeline', () => {
    expect(continuePath('report', ALL_DONE, 'd1')).toBeNull();
  });

  it('offers no continue target when the next stage is locked', () => {
    expect(continuePath('transformation', { transformation: 'done' }, 'd1')).toBeNull();
  });
});
