// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Badge,
  DATA_SEVERITY_ORDER,
  DeltaBadge,
  deltaTone,
  QualityTag,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SeverityTag,
  StageStatusTag,
  statusLabel,
  toDataSeverity,
  type DeltaQuantity,
} from '../ui/Badge';

/**
 * Severity is the one place this product can lie most easily.
 *
 * The detector emits exactly three severities — verified against a completed
 * run, where `severity_counts` is `{critical: 0, high: 1720, moderate: 106,
 * low: 401}` and `critical` is never produced at all. These tests pin the
 * consequences:
 *
 *   1. severity is always a colour AND a word, so it survives greyscale
 *      printing and colour-vision deficiency;
 *   2. the vocabulary a row may use is three, not five, because a red
 *      "Critical 0" implies the absence of an emergency rather than the
 *      absence of the ability to detect one; and
 *   3. a value outside the ramp is *flagged*, never quietly remapped.
 */

describe('SeverityTag', () => {
  it('pairs every severity with a visible word, never colour alone', () => {
    for (const severity of DATA_SEVERITY_ORDER) {
      const { unmount } = render(<SeverityTag severity={severity} />);
      expect(screen.getByText(SEVERITY_LABEL[severity])).toBeInTheDocument();
      unmount();
    }
  });

  it('renders each severity in its own colour', () => {
    const seen = new Set<string>();
    for (const severity of DATA_SEVERITY_ORDER) {
      const { container, unmount } = render(<SeverityTag severity={severity} />);
      const colour = (container.firstChild as HTMLElement).style.color;
      expect(colour).not.toBe('');
      expect(colour).toBe(SEVERITY_COLOR[severity]);
      seen.add(colour);
      unmount();
    }
    // Guards against two severities silently collapsing to one hue.
    expect(seen.size).toBe(DATA_SEVERITY_ORDER.length);
  });

  it('shows a count when one is supplied, and omits it otherwise', () => {
    const { rerender } = render(<SeverityTag severity="high" count={1720} />);
    expect(screen.getByText('1720')).toBeInTheDocument();
    expect(screen.getByText(/High/)).toHaveTextContent('High1720');

    rerender(<SeverityTag severity="high" />);
    expect(screen.queryByText('1720')).not.toBeInTheDocument();
  });

  it('renders zero as a real count rather than hiding it', () => {
    // A zero count is information. Suppressing it would make "none found" and
    // "not applicable" look identical.
    render(<SeverityTag severity="low" count={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('resolves every severity in the vocabulary to a defined colour token', () => {
    for (const severity of DATA_SEVERITY_ORDER) {
      expect(SEVERITY_COLOR[severity], `severity ${severity}`).toMatch(/^var\(--sev-/);
    }
  });

  it('keeps the five-step contract resolvable for schema documentation', () => {
    // The classifier's own vocabulary is still documented in the schema, so the
    // tokens must keep resolving even though no row may be labelled with them.
    expect(SEVERITY_COLOR.critical).toMatch(/^var\(--sev-critical\)$/);
    expect(SEVERITY_LABEL.critical).toBe('Critical');
    expect(SEVERITY_ORDER).toContain('normal');
  });
});

describe('toDataSeverity', () => {
  it('passes the three emitted severities straight through', () => {
    for (const severity of DATA_SEVERITY_ORDER) {
      expect(toDataSeverity(severity)).toBe(severity);
    }
  });

  it('flags critical and normal as outside the ramp instead of remapping them', () => {
    // Remapping critical to high would understate it and mapping it to low
    // would overstate it. Both are silent lies about the reader's own data.
    expect(toDataSeverity('critical')).toBe('out-of-ramp');
    expect(toDataSeverity('normal')).toBe('out-of-ramp');
    expect(toDataSeverity('')).toBe('out-of-ramp');
    expect(toDataSeverity('nonsense')).toBe('out-of-ramp');
  });
});

describe('SeverityTag out of ramp', () => {
  it('labels the value it was given rather than substituting a band', () => {
    render(<SeverityTag severity="out-of-ramp" count={3} />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('says in the tooltip that the ramp does not cover it', () => {
    render(<SeverityTag severity="out-of-ramp" />);
    const tag = screen.getByTitle(/three-step severity ramp/);
    expect(tag).toBeInTheDocument();
  });

  it('marks the dot as hollow, so the row is visibly unlike the others', () => {
    const { container: hollow } = render(<SeverityTag severity="out-of-ramp" />);
    const dot = hollow.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.style.backgroundColor).toBe('');

    const { container: filled } = render(<SeverityTag severity="high" />);
    const filledDot = filled.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(filledDot.style.backgroundColor).not.toBe('');
  });
});

describe('deltaTone', () => {
  /**
   * §10.5 is a correctness rule. Every row is the case the bug would take:
   * a green "+18% energy" is the exact failure the table exists to prevent.
   */
  const cases: [DeltaQuantity, 'good' | 'bad' | 'neutral'][] = [
    ['cost', 'bad'],
    ['spend', 'bad'],
    ['co2', 'bad'],
    ['anomalies', 'bad'],
    ['excess_kwh', 'bad'],
    ['payback_months', 'bad'],
    ['energy_saved', 'good'],
    ['recoverable_kwh', 'good'],
    ['load_factor', 'good'],
    ['dq_score', 'good'],
    ['r2', 'good'],
    ['latency', 'neutral'],
    ['duration', 'neutral'],
  ];

  it('reads an increase in each quantity the way §10.5 requires', () => {
    for (const [quantity, expected] of cases) {
      expect(deltaTone(quantity, 'up'), `${quantity} up`).toBe(expected);
    }
  });

  it('inverts good and bad on a decrease, and leaves neutral alone', () => {
    for (const [quantity, up] of cases) {
      const down = deltaTone(quantity, 'down');
      expect(down, `${quantity} down`).toBe(
        up === 'neutral' ? 'neutral' : up === 'good' ? 'bad' : 'good',
      );
    }
  });

  it('never renders a rising cost or rising excess as good news', () => {
    for (const quantity of ['cost', 'spend', 'co2', 'anomalies', 'excess_kwh'] as const) {
      const { container, unmount } = render(
        <DeltaBadge value="+18%" quantity={quantity} direction="up" />,
      );
      expect((container.firstChild as HTMLElement).style.color, quantity).not.toBe('var(--ok)');
      unmount();
    }
  });
});

describe('DeltaBadge', () => {
  it('derives its colour from the polarity table when no tone is passed', () => {
    const { container } = render(<DeltaBadge value="+18%" quantity="cost" direction="up" />);
    expect((container.firstChild as HTMLElement).style.color).toBe('var(--critical)');
  });

  it('keeps the sign in text so meaning survives a greyscale print', () => {
    render(<DeltaBadge value="+18%" quantity="cost" direction="up" />);
    expect(screen.getByText('+18%')).toBeInTheDocument();
  });

  it('falls back to a neutral arrow when there is no direction to read', () => {
    const { container } = render(<DeltaBadge value="0%" />);
    expect((container.firstChild as HTMLElement).style.color).toBe('var(--ink-low)');
  });

  it('lets an explicit tone win for quantities outside the table', () => {
    const { container } = render(<DeltaBadge value="+4" tone="good" />);
    expect((container.firstChild as HTMLElement).style.color).toBe('var(--ok)');
  });
});

describe('Badge', () => {
  it('renders an aria-hidden dot so it is not announced twice', () => {
    const { container } = render(
      <Badge color="var(--ok)" dot>
        Healthy
      </Badge>,
    );
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders without a colour and without a dot', () => {
    const { container } = render(<Badge>Plain</Badge>);
    expect(screen.getByText('Plain')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe('QualityTag', () => {
  it('never says "clean" — it always names what happened', () => {
    const statuses = ['complete', 'imputed', 'repaired', 'flagged', 'excluded'] as const;
    for (const status of statuses) {
      const { unmount } = render(<QualityTag status={status} />);
      const text = screen.getByText(/./).textContent ?? '';
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).not.toBe('clean');
      unmount();
    }
  });
});

describe('StageStatusTag', () => {
  it('labels every stage status in words', () => {
    const cases: [Parameters<typeof StageStatusTag>[0]['status'], RegExp][] = [
      ['pending', /Not started/],
      ['running', /Running/],
      ['done', /Complete/],
      ['failed', /Failed/],
      ['blocked', /Blocked/],
      ['skipped', /Skipped/],
    ];
    for (const [status, expected] of cases) {
      const { unmount } = render(<StageStatusTag status={status} />);
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it('falls back rather than rendering an empty tag for an unknown status', () => {
    render(<StageStatusTag status={'nonsense' as never} />);
    // Whatever it renders, it must render something.
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe('statusLabel', () => {
  it('labels known statuses and passes unknown ones through unchanged', () => {
    expect(statusLabel('done')).toBe('Complete');
    expect(statusLabel('something_new')).toBe('something_new');
  });
});
