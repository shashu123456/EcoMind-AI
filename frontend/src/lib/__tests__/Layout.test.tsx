// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cluster, Grid, Stack, type Space } from '../ui/Layout';

/**
 * The layout primitives exist so spacing stops being retyped per screen. That
 * only works if the gap they emit comes from the design system's scale rather
 * than from whatever value the page happened to reach for, so that is the thing
 * these tests hold.
 */

const SCALE: Space[] = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'];

function styleOf(container: HTMLElement): CSSStyleDeclaration {
  return (container.firstChild as HTMLElement).style;
}

describe('Stack', () => {
  it('defaults to a column and reads its gap from the space scale', () => {
    const { container } = render(<Stack>a</Stack>);
    expect(styleOf(container).gap).toBe('var(--space-4)');
    expect((container.firstChild as HTMLElement).className).toContain('flex-col');
  });

  it('emits the token for every step of the scale', () => {
    for (const space of SCALE) {
      const { container, unmount } = render(<Stack space={space}>a</Stack>);
      expect(styleOf(container).gap, space).toBe(`var(--space-${space})`);
      unmount();
    }
  });

  it('can run the other way', () => {
    const { container } = render(<Stack direction="row">a</Stack>);
    expect((container.firstChild as HTMLElement).className).toContain('flex-row');
    expect((container.firstChild as HTMLElement).className).not.toContain('flex-col');
  });

  it('renders as whatever element it is asked to be', () => {
    // Tag name rather than role: a bare <section> is not a `region` landmark
    // without an accessible name, and the point here is the element swap.
    const { container } = render(
      <Stack as="section">
        <span>content</span>
      </Stack>,
    );
    expect((container.firstChild as HTMLElement).tagName).toBe('SECTION');
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});

describe('Cluster', () => {
  it('wraps, which is the whole difference from a row Stack', () => {
    const { container } = render(<Cluster>a</Cluster>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('flex-wrap');
    expect(styleOf(container).gap).toBe('var(--space-2)');
  });

  it('defaults to centring its items on the cross axis', () => {
    const { container } = render(<Cluster>a</Cluster>);
    expect(styleOf(container).alignItems).toBe('center');
  });
});

describe('Grid', () => {
  it('makes every track equal, so a row of tiles has no wide orphan', () => {
    const { container } = render(<Grid>a</Grid>);
    expect(styleOf(container).gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('honours the column count', () => {
    for (const columns of [1, 2, 3, 4, 5, 6] as const) {
      const { container, unmount } = render(<Grid columns={columns}>a</Grid>);
      expect(styleOf(container).gridTemplateColumns).toBe(`repeat(${columns}, minmax(0, 1fr))`);
      unmount();
    }
  });

  /**
   * `minmax(min(18rem, 100%), 1fr)` rather than plain `minmax(18rem, 1fr)`:
   * the inner `min` is what stops a narrow viewport from producing a track
   * wider than the screen and forcing the whole page to scroll sideways.
   */
  it('switches to auto-fit when given a track floor, without overflowing', () => {
    const { container } = render(<Grid minWidth="18rem">a</Grid>);
    expect(styleOf(container).gridTemplateColumns).toBe(
      'repeat(auto-fit, minmax(min(18rem, 100%), 1fr))',
    );
  });

  it('never emits a fixed pixel gap', () => {
    const { container } = render(<Grid space="6">a</Grid>);
    expect(styleOf(container).gap).toBe('var(--space-6)');
  });
});
