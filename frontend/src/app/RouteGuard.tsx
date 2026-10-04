import { useEffect, type ReactNode } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { datasets, getToken } from '../lib/api';
import type { Dataset } from '../lib/api/types';
import { ErrorState, LoadingState } from '../lib/ui';
import { useJourney } from '../lib/journey';

export interface RouteGuardProps {
  /** The stage this route represents, or null for the product's own pages. */
  stage: string | null;
  /** Dataset id taken from the route, if the route has one. */
  datasetId: string | null;
  children: ReactNode;
}

/**
 * Three rules, enforced before any page renders.
 *
 * 1. No token, no product. A deep link into a stage without a session goes to
 *    the sign-in page, not to an error.
 * 2. A URL wins — *once it is known to be a dataset*. A pasted or shared link is
 *    a legitimate way to arrive, so its dataset is adopted rather than fought
 *    with.
 * 3. **A URL that is not a dataset is refused.** This rule did not exist, and
 *    its absence was the most damaging defect in the product.
 *
 * Rule 3 exists because of what rule 2 cost. Every route carrying a dataset
 * parameter accepted whatever string occupied that segment and wrote it into
 * the persisted journey store. A link carrying a run id, a deleted dataset, or
 * a typo therefore became the active dataset permanently: the store said
 * `activeDatasetId = <not a dataset>`, so every page resolved "no dataset
 * active" while the run bar and sidebar still reported the run's own progress.
 * The product showed confident, mutually contradictory state, and because the
 * value was persisted it survived every reload and every sign-out.
 *
 * So the guard now asks the server whether the id is a dataset before adopting
 * it. The cost is one request on a cold deep link; the benefit is that the
 * address bar and the screen can no longer disagree about what is open.
 *
 * **There is deliberately no fourth rule.** Earlier versions also redirected any
 * stage whose prerequisites had not run, on the grounds that a page showing
 * numbers that do not exist yet is worse than a redirect. In practice it was
 * worse in every way: a reviewer inspecting one stage of a colleague's run was
 * silently thrown somewhere else, the back button became a loop, and the
 * address bar stopped describing what was on screen.
 *
 * Sequencing is still enforced, but by the thing that can actually enforce it:
 * the stage will not *execute* before its prerequisites, and the page says so
 * plainly and offers to run the stages that are missing. The order is a
 * property of the pipeline; whether a person may *look* at a stage is not.
 */
export function RouteGuard({ datasetId, children }: RouteGuardProps) {
  const authenticated = Boolean(getToken());
  const activeDatasetId = useJourney((s) => s.activeDatasetId);
  const setActive = useJourney((s) => s.setActive);

  // Only a dataset id the route disagrees with needs checking. When the store
  // already agrees there is nothing to validate and no request is made.
  const needsCheck = Boolean(datasetId && datasetId !== activeDatasetId);

  const check = useQuery<Dataset>({
    queryKey: ['dataset', datasetId],
    queryFn: () => datasets.getDataset(datasetId as string),
    enabled: needsCheck && authenticated,
    retry: false,
    staleTime: 60_000,
  });

  const adopting = needsCheck && !check.isError;
  const refused = needsCheck && check.isError;

  useEffect(() => {
    if (adopting && check.data) setActive({ datasetId: check.data.id });
  }, [adopting, check.data, setActive]);

  if (!authenticated) return <Navigate to="/login" replace />;

  if (refused) {
    return (
      <div className="page-gutter py-8">
        <ErrorState
          title="That dataset does not exist"
          message={
            `This link points at a dataset that is not in the library. ` +
            `It may have been deleted, or the address may have been edited.`
          }
        />
      </div>
    );
  }

  if (adopting) {
    return (
      <div className="page-gutter py-8">
        <LoadingState label="Opening dataset" lines={4} />
      </div>
    );
  }

  return <>{children}</>;
}
