import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { PageFrame, PageHero } from '../app/PageFrame';
import { StageGate } from '../app/StageGate';
import type { QualityResult, QualityRule } from '../lib/api/types';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { useStageOutput } from '../lib/stageOutput';
import {
  boundsFacts,
  completenessFacts,
  detailRows,
  duplicateFacts,
  gapFacts,
  monotonicFacts,
  outlierFacts,
  violationCount,
  zscoreFacts,
} from '../lib/qualityDetails';
import { count, dateTime, dec, duration, int, num } from '../lib/format';
import { BarCompare } from '../lib/charts';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataGrid,
  DetailList,
  DetailRow,
  Inset,
  KpiRow,
  KpiTile,
  MeterBar,
  Panel,
  Section,
  type Column,
} from '../lib/ui';

const DIMENSION_ORDER = ['completeness', 'validity', 'consistency', 'accuracy', 'timeliness'];

const SEVERITY_TONE: Record<string, 'ok' | 'warn' | 'critical' | 'neutral'> = {
  info: 'ok',
  warning: 'warn',
  critical: 'critical',
};

/**
 * A rule's verdict, recomputed from its own evidence.
 *
 * The backend already enforces this — a rule tagged `critical` must report
 * zero violations to pass — but the page does not take a stored flag on trust,
 * because a green badge beside 378 physically impossible readings is the single
 * most damaging thing this screen could show. If the two ever disagree, the
 * evidence wins and the disagreement is called out.
 */
function effectivePass(rule: QualityRule): {
  pass: boolean;
  violations: number | null;
  disagrees: boolean;
} {
  const violations = violationCount(rule.details);
  if (rule.severity === 'critical' && violations.value !== null) {
    return {
      pass: violations.value === 0,
      violations: violations.value,
      disagrees: rule.passed !== (violations.value === 0),
    };
  }
  return { pass: rule.passed, violations: violations.value, disagrees: false };
}

function scoreTone(score: number): 'ok' | 'warn' | 'critical' {
  if (score >= 95) return 'ok';
  if (score >= 80) return 'warn';
  return 'critical';
}

/**
 * Stage 4 — data quality.
 *
 * Seven rules across five dimensions, each one reporting what it measured and
 * how many cells it examined. The headline score is the mean of the five
 * dimension means, normalised — and the dimension bars are shown next to it so
 * a single good number cannot hide a collapsed dimension behind an average.
 *
 * The evidence drawer matters more than the score here. A score tells a reader
 * the data is suspect; the details tell them which readings, in which columns,
 * and whether that is a rounding artefact or a real fault.
 */
export function DataQualityPage() {
  const { datasetId } = useDatasetScope();
  const state = useStageOutput<QualityResult>('quality');
  const [selected, setSelected] = useState<string | null>(null);

  const verdicts = useMemo(
    () => (state.output?.results ?? []).map((r) => ({ rule: r, verdict: effectivePass(r) })),
    [state.output],
  );
  const failed = verdicts.filter((v) => !v.verdict.pass);
  const disagreements = verdicts.filter((v) => v.verdict.disagrees);
  const active = verdicts.find((v) => v.rule.id === selected) ?? verdicts[0] ?? null;

  const dimensionRows = useMemo(() => {
    const byDim = state.output?.by_dimension ?? {};
    return Object.entries(byDim)
      .map(([dimension, score]) => ({ dimension, score: score ?? 0 }))
      .sort(
        (a, b) =>
          DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension) ||
          a.dimension.localeCompare(b.dimension),
      );
  }, [state.output]);

  const ruleColumns: Column<(typeof verdicts)[number]>[] = [
    {
      key: 'rule_name',
      header: 'Rule',
      cell: (v) => <span className="font-medium text-neutral-800">{v.rule.rule_name}</span>,
    },
    { key: 'dimension', header: 'Dimension', width: '8rem' },
    {
      key: 'severity',
      header: 'Severity',
      width: '7rem',
      cell: (v) => (
        <Badge color={`var(--${v.rule.severity === 'info' ? 'ok' : v.rule.severity})`}>
          {v.rule.severity}
        </Badge>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      numeric: true,
      width: '6rem',
      cell: (v) => <span className="num">{dec(v.rule.score, 1)}</span>,
    },
    {
      key: 'pass',
      header: 'Verdict',
      width: '8rem',
      cell: (v) => (
        <span
          className={`text-xs font-medium ${
            v.verdict.pass ? 'text-[var(--ok)]' : 'text-[var(--critical)]'
          }`}
        >
          {v.verdict.pass ? 'pass' : 'flagged'}
          {v.verdict.violations !== null && v.verdict.violations > 0 ? (
            <span className="num ml-1 text-2xs text-neutral-600">
              ({int(v.verdict.violations)} cells)
            </span>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <PageFrame
      stage="quality"
      status={state.output ? 'done' : 'pending'}
      actions={
        <Link to="/transformation/$datasetId" params={{ datasetId: datasetId ?? '' }}>
          <Button variant="primary">Continue to transformation</Button>
        </Link>
      }
    >
      <StageGate stage="quality" state={state} blockedBy={['import', 'schema']}>
        {(output, s) => {
          const tone = scoreTone(output.overall_score);
          return (
            <>
              <PageHero
                eyebrow="Quality score"
                value={dec(output.overall_score, 1)}
                unit="/ 100"
                verdict={s.decision ?? output.summary}
                tone={tone}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-neutral-600">
                  <span>{output.summary}</span>
                  <span>
                    scored in {duration(output.elapsed_ms / 1000)} · {dateTime(output.ran_at)}
                  </span>
                </div>
              </PageHero>

              <p className="max-w-3xl text-sm text-neutral-700">
                {count(output.results.length, 'rule', 'rules')} ran across{' '}
                {int(dimensionRows.length)} dimensions. {int(output.passed_count)} passed and{' '}
                {int(output.failed_count)} were flagged. The headline score is the mean of the
                dimension scores, not a separate judgement — which is why the dimension bars below
                are the real result and this number is only their summary.
              </p>

              {disagreements.length > 0 ? (
                <Callout tone="critical" title="A pass flag disagrees with its own evidence">
                  {disagreements.length === 1
                    ? 'One rule is'
                    : `${int(disagreements.length)} rules are`}{' '}
                  marked as passing while reporting violations:{' '}
                  {disagreements.map((v) => v.rule.rule_name).join(', ')}. The findings below are
                  treated as authoritative over the flag.
                </Callout>
              ) : null}

              {failed.length > 0 ? (
                <Callout tone="warn" title={`${int(failed.length)} rules flagged findings`}>
                  {failed.map((v) => v.rule.rule_name).join(', ')}. Nothing has been repaired — this
                  stage measures, it does not rewrite. Select a rule to see which cells were
                  examined and how many failed.
                </Callout>
              ) : null}

              <KpiRow columns={5}>
                <KpiTile
                  label="Overall"
                  value={dec(output.overall_score, 1)}
                  unit="/ 100"
                  tone={tone}
                />
                <KpiTile
                  label="Rules passed"
                  value={`${int(output.passed_count)} / ${int(output.results.length)}`}
                  tone={output.failed_count === 0 ? 'ok' : 'warn'}
                />
                <KpiTile
                  label="Critical severity"
                  value={int(output.severity_counts.critical ?? 0)}
                  hint="Rules where any violation is disqualifying"
                  tone={(output.severity_counts.critical ?? 0) > 0 ? 'critical' : 'ok'}
                />
                <KpiTile
                  label="Warning severity"
                  value={int(output.severity_counts.warning ?? 0)}
                  tone={(output.severity_counts.warning ?? 0) > 0 ? 'warn' : 'ok'}
                />
                <KpiTile
                  label="Info severity"
                  value={int(output.severity_counts.info ?? 0)}
                  tone="neutral"
                  hint="Recorded for the record; cannot fail"
                />
              </KpiRow>

              <Section
                title="Dimension scores"
                description="The five dimensions behind the headline. The bars are deliberately not sorted by score — completeness first, accuracy last, so the reader sees the same order every time."
              >
                <BarCompare
                  title="Score by dimension"
                  hint="Mean of the rules in each dimension. The dashed mark is the 80-point flag threshold."
                  data={dimensionRows}
                  category="dimension"
                  series={[{ key: 'score', label: 'Score', unit: '/100' }]}
                  layout="horizontal"
                  colorBy="dimension"
                  colorScale={Object.fromEntries(
                    dimensionRows.map((r) => [
                      r.dimension,
                      `var(--${r.score >= 95 ? 'ok' : r.score >= 80 ? 'warn' : 'critical'})`,
                    ]),
                  )}
                  format={(v) => dec(v, 1)}
                  reference={{ value: 80, label: 'Flag threshold' }}
                />
              </Section>

              <Section
                title="Rule findings"
                description="Each rule with what it examined and how it scored. Select a row to open its evidence."
              >
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
                  <Card>
                    <DataGrid
                      rows={verdicts}
                      columns={ruleColumns}
                      rowKey={(v) => v.rule.id}
                      caption={`${verdicts.length} rules.`}
                      onRowClick={(v) => setSelected(v.rule.id)}
                      selectedKey={active?.rule.id}
                      maxHeight="26rem"
                    />
                  </Card>
                  <RuleEvidence verdict={active} />
                </div>
              </Section>

              <Inset>
                <p className="eyebrow">What this stage does not do</p>
                <p className="mt-1 text-xs text-neutral-600">
                  It does not repair anything. No cell has been imputed, dropped or rewritten, and
                  no score here is a licence to ignore a flagged column — the transformation stage
                  is where that decision is made and recorded, one field at a time.
                </p>
              </Inset>
            </>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}

function RuleEvidence({
  verdict,
}: {
  verdict: {
    rule: QualityRule;
    verdict: { pass: boolean; violations: number | null; disagrees: boolean };
  } | null;
}) {
  if (!verdict) {
    return (
      <Panel title="Evidence">
        <p className="text-sm text-neutral-600">Select a rule to see what it measured.</p>
      </Panel>
    );
  }

  const { rule, verdict: v } = verdict;
  const tone = SEVERITY_TONE[rule.severity] ?? 'neutral';
  const extra = explainRule(rule);

  return (
    <Panel title={rule.rule_name} hint={`${rule.dimension} · ${rule.rule_category}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={`var(--${rule.severity === 'info' ? 'ok' : rule.severity})`}>
          {rule.severity}
        </Badge>
        <Badge color={`var(--${v.pass ? 'ok' : 'critical'})`}>{v.pass ? 'pass' : 'flagged'}</Badge>
        <span className="num text-xs text-neutral-600">score {dec(rule.score, 1)}</span>
      </div>

      <MeterBar className="mt-3" value={rule.score} max={100} tone={scoreTone(rule.score)} />

      {extra ? (
        <div className="mt-4">
          <p className="eyebrow">What it measured</p>
          <p className="mt-1 text-xs text-neutral-700">{extra}</p>
        </div>
      ) : null}

      {v.violations !== null && v.violations > 0 ? (
        <Callout
          className="mt-3"
          tone={rule.severity === 'critical' ? 'critical' : 'warn'}
          title={`${count(v.violations, 'cell')} outside the rule's expectation`}
        >
          {rule.severity === 'critical'
            ? 'This rule is critical, so any violation is disqualifying regardless of how small the share is.'
            : 'A small share of cells outside the expected range, recorded rather than hidden.'}
        </Callout>
      ) : null}

      <div className="mt-4 border-t border-[var(--line-faint)] pt-3">
        <p className="eyebrow">Reported detail</p>
        <DetailList className="mt-2">
          {detailRows(rule.details).map((row) => (
            <DetailRow key={row.key} label={row.key} mono>
              <span className="break-words">{row.value}</span>
            </DetailRow>
          ))}
        </DetailList>
      </div>

      <p className="mt-3 text-2xs text-neutral-600">
        Measured {dateTime(rule.ran_at)} · {tone} severity
      </p>
    </Panel>
  );
}

/** One sentence per rule, in the rule's own terms, from its own numbers. */
function explainRule(rule: QualityRule): string | null {
  const d = rule.details ?? {};
  switch (rule.rule_name) {
    case 'completeness': {
      const f = completenessFacts(d);
      const total = f.totalCells;
      const rate = f.globalRate ?? (total ? (f.nullCells ?? 0) / total : null);
      return `${int(f.nullCells)} of ${int(total)} cells are empty (${rate === null ? 'rate not reported' : `${dec(rate * 100, 3)}%`}). Columns with gaps: ${
        f.columnsWithGaps.join(', ') || 'none'
      }.`;
    }
    case 'validity_semantic_bounds': {
      const f = boundsFacts(d);
      const pairs = f.outOfRange.map((o) => `${o.column} ${int(o.count)}`).join(', ');
      return `${int(f.passing)} of ${int(f.totalChecked)} readings sit inside the physical limits for their quantity. Out of range — ${pairs || 'none'}.`;
    }
    case 'consistency_duplicates': {
      const f = duplicateFacts(d);
      return f.duplicates === null && f.total === null
        ? null
        : `${int(f.duplicates ?? 0)} duplicate rows out of ${int(f.total ?? 0)}${
            f.keys.length ? `, keyed on ${f.keys.join(', ')}` : ''
          }.`;
    }
    case 'consistency_monotonic_timestamps': {
      const f = monotonicFacts(d);
      return `${int(f.nonMonotonicRows)} rows move backwards in time across ${int(
        f.seriesChecked,
      )} ${f.grain ?? 'series'} checked.`;
    }
    case 'accuracy_outliers_iqr': {
      const f = outlierFacts(d);
      return `${int(f.outlierCount)} readings sit outside 1.5×IQR of their column${
        f.checkedColumns.length ? `, across ${f.checkedColumns.join(', ')}` : ''
      } (${f.outlierRate === null ? 'rate not reported' : `${dec(f.outlierRate * 100, 2)}%`}).`;
    }
    case 'accuracy_zscore': {
      const f = zscoreFacts(d);
      return `${int(f.extremePoints)} readings are more than ${int(f.threshold)} standard deviations from the mean of ${f.targetColumn ?? 'the target'}.`;
    }
    case 'timeliness_temporal_gaps': {
      const f = gapFacts(d);
      const median = f.medianIntervalSeconds;
      return `Median interval ${median === null ? 'not reported' : `${dec(median / 60, 0)} minutes`}; ${int(
        f.missedIntervals,
      )} expected intervals are absent from the ${f.timeRangeSeconds === null ? 'observed span' : `${dec(f.timeRangeSeconds / 86400, 1)} days`}.`;
    }
    default: {
      const score = num(rule.score);
      return score === null ? null : `Scored ${dec(score, 1)} on this rule's own measurement.`;
    }
  }
}
