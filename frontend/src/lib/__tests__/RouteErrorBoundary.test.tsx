// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteErrorView, routeErrorComponent } from '../../app/RouteErrorBoundary';

/**
 * The boundary exists because every page but login is a lazily-loaded chunk
 * that can fail after the shell has rendered. These tests pin the three
 * properties that make it worth having:
 *
 *   1. it names the page that broke, not "something went wrong";
 *   2. it shows the real reason instead of hiding it;
 *   3. it leaves the user a way forward.
 *
 * The third is the whole point — a blank page with a console message costs the
 * user their navigation, their scope and their filters.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouteErrorView', () => {
  it('names the route that failed', () => {
    render(<RouteErrorView error={new Error('boom')} label="/forecast/$datasetId" />);
    expect(screen.getByText(/\/forecast\/\$datasetId is unavailable/)).toBeInTheDocument();
  });

  it('shows the real reason rather than hiding it', () => {
    render(
      <RouteErrorView error={new Error('expected number, received array')} label="Forecast" />,
    );
    expect(screen.getByText(/expected number, received array/)).toBeInTheDocument();
  });

  it('reassures that the rest of the app survived', () => {
    render(<RouteErrorView error={new Error('x')} label="Forecast" />);
    expect(screen.getByText(/still running/i)).toBeInTheDocument();
  });

  it('survives an error that is not an Error instance', () => {
    // A thrown string or a rejected non-Error must not itself crash the
    // boundary, which would replace a recoverable failure with a blank page.
    render(<RouteErrorView error={'plain string failure'} label="Anomalies" />);
    expect(screen.getByText(/plain string failure/)).toBeInTheDocument();
  });

  it('describes an unrecognisable error instead of rendering nothing', () => {
    render(<RouteErrorView error={undefined} label="Explore" />);
    expect(screen.getByText(/could not describe/i)).toBeInTheDocument();
  });

  it('retries through the router reset rather than reloading', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<RouteErrorView error={new Error('x')} label="Report" reset={reset} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('still works when no reset handler is supplied', async () => {
    const user = userEvent.setup();
    render(<RouteErrorView error={new Error('x')} label="Report" />);
    // Must not throw when clicked.
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('routeErrorComponent', () => {
  it('builds a component that renders the failure for its own route', () => {
    const Boundary = routeErrorComponent('/anomalies/$datasetId');
    render(<Boundary error={new Error('chart got the wrong shape')} reset={() => {}} />);
    expect(screen.getByText(/\/anomalies\/\$datasetId is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/chart got the wrong shape/)).toBeInTheDocument();
  });

  it('logs the failure so the route is diagnosable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boundary = routeErrorComponent('/forecast/$datasetId');
    render(<Boundary error={new Error('boom')} reset={() => {}} />);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/forecast/$datasetId'),
      expect.any(Error),
    );
  });
});
