import { Link, useNavigate } from '@tanstack/react-router';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { pctValue } from '../lib/format';
import {
  PHASES,
  nextStage,
  phaseProgress,
  progressStats,
  stagePath,
  stagesForPhase,
  type Phase,
} from '../lib/journey';
import { Button, EmptyState, Panel, ProgressBar, Stepper, type StepperStep } from '../lib/ui';

/**
 * Where the product lands, and where it resumes.
 *
 * There is no auto-advance anywhere in this product, so this page is the only
 * thing that decides which stage comes next — and it says so out loud rather
 * than quietly navigating.
 */
export function StatusPage() {
  const { dataset, datasetId, stageStatuses } = useDatasetScope();
  const stats = progressStats(stageStatuses);
  const upcoming = nextStage(stageStatuses);

  if (!dataset) {
    return (
      <PageFrame
        title="Where does this estate stand?"
        subtitle="Choose a dataset to begin. Every stage is scoped to it, and every conclusion stays traceable to the readings it came from."
      >
        <EmptyState
          title="No dataset is active"
          description="Pick a dataset from the library to scope the ten stages."
          action={
            <Link to="/library">
              <Button variant="primary">Open the dataset library</Button>
            </Link>
          }
        />
      </PageFrame>
    );
  }

  const nextPath = upcoming ? stagePath(upcoming, datasetId) : null;

  return (
    <PageFrame
      title="Where does this estate stand?"
      subtitle="Ten stages, two phases. Preparation must finish before the decision phase unlocks."
      hero={
        <PageHero
          eyebrow="Pipeline progress"
          value={pctValue(stats.pct)}
          verdict={
            stats.done === 0
              ? `Nothing has run yet for ${dataset.name}.`
              : stats.done === stats.total
                ? `All ${stats.total} stages complete — the report is ready.`
                : `${stats.done} of ${stats.total} complete · next up: ${upcoming?.label ?? '—'}. Nothing advances on its own.`
          }
          tone={stats.pct === 100 ? 'ok' : 'neutral'}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {PHASES.map((phase) => {
              const progress = phaseProgress(stageStatuses, phase.key);
              return (
                <div key={phase.key} className="min-w-[7rem] flex-1 sm:min-w-[9rem]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-widest text-neutral-600">
                      {phase.label}
                    </span>
                    <span className="num text-2xs font-medium text-neutral-600">
                      {progress.done}/{progress.total}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-1"
                    value={progress.pct / 100}
                    size="sm"
                    tone={progress.done === progress.total ? 'ok' : 'brand'}
                  />
                </div>
              );
            })}
          </div>
        </PageHero>
      }
      actions={
        nextPath && upcoming ? (
          <Link to={nextPath}>
            <Button variant="primary">Continue to {upcoming.label}</Button>
          </Link>
        ) : (
          <Link to="/report/$datasetId" params={{ datasetId: datasetId ?? '' }}>
            <Button variant="primary">Open the report</Button>
          </Link>
        )
      }
      aside={
        <Panel title="Active dataset">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="eyebrow">Name</dt>
              <dd className="mt-0.5 font-medium text-neutral-800">{dataset.name}</dd>
            </div>
            <div>
              <dt className="eyebrow">Granularity</dt>
              <dd className="mt-0.5 text-neutral-700">
                {dataset.granularity === 'meter'
                  ? 'Building › Meter'
                  : 'Building › Floor › Room › Device'}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Readings</dt>
              <dd className="num mt-0.5 text-neutral-700">{dataset.rowCount ?? '—'}</dd>
            </div>
          </dl>
          <Link to="/library" className="mt-4 block">
            <Button variant="outline" size="sm" className="w-full">
              Change dataset
            </Button>
          </Link>
        </Panel>
      }
    >
      {PHASES.map((phase) => (
        <PhasePanel key={phase.key} phase={phase.key} datasetId={datasetId} />
      ))}
    </PageFrame>
  );
}

function PhasePanel({ phase, datasetId }: { phase: Phase; datasetId: string | null }) {
  const navigate = useNavigate();
  const { stageStatuses } = useDatasetScope();
  const meta = PHASES.find((p) => p.key === phase);
  const stages = stagesForPhase(phase);
  const progress = phaseProgress(stageStatuses, phase);

  const steps: StepperStep[] = stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    status: stageStatuses[stage.key] ?? 'pending',
    outcome: stage.purpose,
  }));

  const activeIndex = steps.findIndex((s) => s.status === 'running');

  return (
    <Panel
      title={`${meta?.label} phase`}
      hint={meta?.purpose}
      actions={
        <span className="num text-xs font-medium text-neutral-600">
          {progress.done} of {progress.total} complete
        </span>
      }
    >
      <Stepper
        steps={steps}
        activeIndex={activeIndex >= 0 ? activeIndex : undefined}
        onSelect={(index) => {
          const stage = stages[index];
          // Every stage is open. Sequencing is enforced when a stage runs, not
          // when someone looks at it.
          if (!stage) return;
          void navigate({ to: stagePath(stage, datasetId) });
        }}
      />
    </Panel>
  );
}
