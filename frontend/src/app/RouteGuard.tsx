import { useEffect, type ReactNode } from 'react';
import { Navigate } from '@tanstack/react-router';
import { getToken } from '../lib/api';
import { LoadingState } from '../lib/ui';
import {
  STAGE_BY_KEY,
  STAGES,
  firstIncomplete,
  isReachable,
  stagePath,
  useJourney,
  type StageKey,
} from '../lib/journey';

export interface RouteGuardProps {
  /** The stage this route represents, or null for the product's own pages. */
  stage: StageKey | null;
  /** Dataset id taken from the route, if the route has one. */
  datasetId: string | null;
  children: ReactNode;
}

/**
 * Two rules, enforced before any page renders.
 *
 * 1. No token, no product. A deep link into a stage without a session goes to
 *    the sign-in page, not to an error.
 * 2. No stage before its prerequisites. The product's promise is that no
 *    conclusion is drawn from unchecked data, so an unreachable stage
 *    redirects to the first stage that is actually outstanding instead of
 *    rendering a page whose numbers do not exist yet.
 *
 * The guard deliberately does not wait for network calls itself — the shell
 * hydrates stage statuses before rendering this component, so gating decisions
 * are made against real run state rather than an empty store.
 */
export function RouteGuard({ stage, datasetId, children }: RouteGuardProps) {
  const authenticated = getToken();
  const activeDatasetId = useJourney((s) => s.activeDatasetId);
  const stageStatuses = useJourney((s) => s.stageStatuses);
  const setActive = useJourney((s) => s.setActive);

  // A pasted URL is a legitimate way to arrive. Adopt its dataset rather than
  // fighting the user — but render nothing until the store agrees, so no page
  // ever reads one dataset's status map against another's id.
  const adopting = Boolean(datasetId && datasetId !== activeDatasetId);
  useEffect(() => {
    if (datasetId && datasetId !== activeDatasetId) setActive({ datasetId });
  }, [datasetId, activeDatasetId, setActive]);

  if (!authenticated) return <Navigate to="/login" replace />;

  if (adopting) {
    return (
      <div className="page-gutter py-8">
        <LoadingState label="Opening dataset" lines={4} />
      </div>
    );
  }

  const def = stage ? STAGE_BY_KEY[stage] : null;
  if (def && !isReachable(def, stageStatuses)) {
    const next = firstIncomplete(STAGES, stageStatuses) ?? STAGES[0];
    return <Navigate to={stagePath(next, datasetId ?? activeDatasetId)} replace />;
  }

  return <>{children}</>;
}
