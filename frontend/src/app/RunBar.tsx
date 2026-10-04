import { useCallback, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Play, RotateCcw, Square } from 'lucide-react';
import { errorMessage, runs } from '../lib/api';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import {
  STAGES,
  STAGE_BY_KEY,
  firstIncomplete,
  isDone,
  isReachable,
  progressStats,
  stagePath,
  useJourney,
  type StageDef,
  type StageKey,
  type StageStatuses,
} from '../lib/journey';
import { Button, SegmentedControl, Select, useToast } from '../lib/ui';
import { RUN_MODES, useWorkspace, type RunMode } from '../lib/workspace';
import { useEventConsole } from './EventConsole';

/**
 * The global run control.
 *
 * The pipeline is not a wizard the user walks page by page — it is one process
 * they should be able to drive from anywhere. Smart runs every remaining stage
 * in order; Step runs exactly one and waits. Either way the controls live in the
 * shell, so a reviewer can kick a run from the anomaly dashboard just as easily
 * as from the status page.
 *
 * There is no per-stage reset in the backend: a stage belongs to a run, and a
 * finished run is immutable history. "Reset" therefore means what it honestly
 * means here — start a fresh run from the first stage.
 */
export function RunBar() {
  const { datasetId } = useDatasetScope();
  const runId = useJourney((s) => s.runId);
  const stageStatuses = useJourney((s) => s.stageStatuses);
  const setActive = useJourney((s) => s.setActive);
  const setStatuses = useJourney((s) => s.setStatuses);
  const markStage = useJourney((s) => s.markStage);
  const { runMode, setRunMode } = useWorkspace();
  const { setOpen: openConsole } = useEventConsole();
  const qc = useQueryClient();
  const toast = useToast();

  const [pending, setPending] = useState(false);
  const [activeKey, setActiveKey] = useState<StageKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const ensureRun = useCallback(async (): Promise<string> => {
    if (runId) return runId;
    const run = await runs.startRun(datasetId as string);
    setActive({ runId: run.id });
    return run.id;
  }, [runId, datasetId, setActive]);

  const runStage = useCallback(
    async (id: string, def: StageDef, local: StageStatuses): Promise<StageStatuses> => {
      setActiveKey(def.key);
      markStage(def.key, 'running');
      try {
        await runs.execStage(id, def.key);
        markStage(def.key, 'done');
        return { ...local, [def.key]: 'done' };
      } catch (e) {
        markStage(def.key, 'failed');
        throw e;
      }
    },
    [markStage],
  );

  const settle = useCallback(
    async (id: string) => {
      await qc.invalidateQueries({ queryKey: ['stage-output', id] });
      await qc.invalidateQueries({ queryKey: ['latest-run-detail', datasetId] });
    },
    [qc, datasetId],
  );

  const runAll = useCallback(async () => {
    setError(null);
    setPending(true);
    stopRef.current = false;
    try {
      const id = await ensureRun();
      openConsole(true);
      let local: StageStatuses = { ...stageStatuses };
      for (const def of STAGES) {
        if (stopRef.current) break;
        if (isDone(local, def.key)) continue;
        local = await runStage(id, def, local);
        await settle(id);
      }
      await settle(id);
      if (stopRef.current) {
        toast.info('Run stopped', 'Stopped after the current stage.');
      } else {
        toast.ok('Run complete', 'Every remaining stage finished.');
      }
    } catch (e) {
      setError(errorMessage(e));
      toast.error('Run failed', errorMessage(e));
    } finally {
      setPending(false);
      setActiveKey(null);
    }
  }, [ensureRun, runStage, stageStatuses, settle, openConsole, toast]);

  const runOne = useCallback(
    async (def: StageDef | null) => {
      if (!def) return;
      setError(null);
      setPending(true);
      stopRef.current = false;
      try {
        const id = await ensureRun();
        openConsole(true);
        await runStage(id, def, stageStatuses);
        await settle(id);
        toast.ok('Stage complete', `${def.label} finished.`);
      } catch (e) {
        setError(errorMessage(e));
        toast.error('Stage failed', errorMessage(e));
      } finally {
        setPending(false);
        setActiveKey(null);
      }
    },
    [ensureRun, runStage, stageStatuses, settle, openConsole, toast],
  );

  const reset = useCallback(async () => {
    if (pending || !datasetId) return;
    setError(null);
    setPending(true);
    try {
      const run = await runs.startRun(datasetId);
      openConsole(true);
      setStatuses({});
      setActive({ runId: run.id });
      await settle(run.id);
      toast.info('New run started', 'Progress reset to the first stage.');
    } catch (e) {
      setError(errorMessage(e));
      toast.error('Reset failed', errorMessage(e));
    } finally {
      setPending(false);
      setActiveKey(null);
    }
  }, [pending, datasetId, setStatuses, setActive, settle, openConsole, toast]);

  if (!datasetId) return null;

  const current = firstIncomplete(STAGES, stageStatuses);
  const progress = progressStats(stageStatuses);
  const runnable = STAGES.filter(
    (s) => !isDone(stageStatuses, s.key) && isReachable(s, stageStatuses),
  );
  const activeDef = activeKey ? STAGE_BY_KEY[activeKey] : null;
  const allDone = !current;

  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-1.5">
      <SegmentedControl<RunMode>
        ariaLabel="Run mode"
        size="sm"
        value={runMode}
        onChange={setRunMode}
        options={RUN_MODES.map((m) => ({ value: m.value, label: m.label, hint: m.hint }))}
      />

      <Button
        size="sm"
        variant="primary"
        icon={<Play className="h-3.5 w-3.5" aria-hidden />}
        loading={pending}
        disabled={allDone && runMode === 'smart'}
        onClick={() => (runMode === 'smart' ? runAll() : runOne(current))}
      >
        {runMode === 'smart' ? 'Run remaining' : 'Run next stage'}
      </Button>

      {pending && (
        <Button
          size="sm"
          variant="outline"
          icon={<Square className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => {
            stopRef.current = true;
          }}
        >
          Stop
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
        disabled={pending}
        onClick={reset}
        title="Start a fresh run from the first stage"
      >
        Reset
      </Button>

      {runMode === 'step' && (
        <Select
          value={null}
          onChange={(key) => runOne(STAGE_BY_KEY[key as StageKey] ?? null)}
          options={runnable.map((s) => ({ value: s.key, label: `${s.index + 1}. ${s.label}` }))}
          placeholder="Run a specific stage…"
          className="w-56"
          disabled={pending || runnable.length === 0}
        />
      )}

      <div className="flex-1" />

      {error ? (
        <span className="max-w-[22rem] truncate text-xs text-critical" role="alert">
          {error}
        </span>
      ) : activeDef ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
          <span
            aria-hidden
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--brand)]"
          />
          Running {activeDef.label}…
        </span>
      ) : (
        <span className="text-xs text-neutral-600">
          <span className="num">{progress.done}</span>
          <span className="text-neutral-400"> / {progress.total} stages</span>
        </span>
      )}

      {current && (
        <Link
          to={stagePath(current, datasetId)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          View output
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}
