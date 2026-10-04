// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Badge,
  QualityTag,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SeverityTag,
  StageStatusTag,
  statusLabel,
  type Severity,
} from '../ui/Badge';

/**
 * Severity is the one place this product can lie most easily.
 *
 * The detector emits exactly three severities — verified against a completed
 * run, where `severity_counts` is `{critical: 0, high: 1720, moderate: 106,
 * low: 401}` and `critical` is never produced at all. These tests pin two
 * things that must never regress:
 *
 *   1. severity is always a colour AND a word, so it survives greyscale
 *      printing and colour-vision deficiency; and
 *   2. every value the UI can render actually resolves to a colour, because a
 *      token that resolves to nothing renders as inherited colour and looks
 *      like a deliberate neutral.
 */

describe('SeverityTag', () => {
  it('pairs every severity with a visible word, never colour alone', () => {
    for (const severity of SEVERITY_ORDER) {
      const { unmount } = render(<SeverityTag severity={severity} />);
      expect(screen.getByText(SEVERITY_LABEL[severity])).toBeInTheDocument();
      unmount();
    }
  });

  it('renders each severity in its own colour', () => {
    const seen = new Set<string>();
    for (const severity of SEVERITY_ORDER) {
      const { container, unmount } = render(<SeverityTag severity={severity} />);
      const colour = (container.firstChild as HTMLElement).style.color;
      expect(colour).not.toBe('');
      expect(colour).toBe(SEVERITY_COLOR[severity]);
      seen.add(colour);
      unmount();
    }
    // Guards against two severities silently collapsing to one hue.
    expect(seen.size).toBe(SEVERITY_ORDER.length);
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
    for (const severity of SEVERITY_ORDER) {
      expect(SEVERITY_COLOR[severity], `severity ${severity}`).toMatch(/^var\(--sev-/);
    }
  });

  /**
   * The finding that shaped the redesign: `critical` is declared but never
   * emitted. It must still resolve — Badge and AnomaliesPage map a five-value
   * vocabulary — but Phase 1's SeverityTag is what will stop mapping it.
   */
  it('keeps critical resolvable while the classifier never emits it', () => {
    expect(SEVERITY_COLOR.critical).toMatch(/^var\(--sev-critical\)$/);
    expect(SEVERITY_LABEL.critical).toBe('Critical');
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
