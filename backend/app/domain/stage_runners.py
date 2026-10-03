"""Import every stage-service module for its stage-runner registration.

Registration in `app.workflow.stages` happens as a side effect of importing the
module that owns the runner, and the exec endpoint reads that registry from
memory. A runner whose module nobody has imported is a 404 — "not implemented
yet" for a stage that is in fact written.

Route modules import the service they serve, which used to be enough. It stops
being enough once a service has no route yet: the preparation and decision
stages were built before the routes that read them, so nothing pulled them in and
all of them were invisible to the pipeline.

This module is that import, stated once. It is deliberately boring and
deliberately not clever: no lazy loading, no discovery by filesystem scan. What a
stage module registers is a decision someone made deliberately when they wrote the
stage, and it should be visible in the place where all the stage modules are
named.

A runner registered twice is the same function object, so a route importing its
own service later does not double-register anything.
"""

# Each import is unused on purpose; importing it is the whole effect.
from app.domain import (
    anomaly_service,  # noqa: F401  stage 7: anomaly
    dataset_service,  # noqa: F401  stages 1-2: library, import
    dq_service,  # noqa: F401  stage 4: quality
    forecast_service,  # noqa: F401  stage 8: forecast
    model_service,  # noqa: F401  stage 6: model_selection
    recommend_service,  # noqa: F401  stage 9: recommendation
    report_service,  # noqa: F401  stage 10: report
    schema_service,  # noqa: F401  stage 3: schema
    transform_service,  # noqa: F401  stage 5: transformation
)


def registered_stages() -> list[str]:
    """Which stage keys currently have a runner, in pipeline order.

    For the status endpoint and for tests that assert coverage, so "which stages
    are real" is answered by the registry rather than by counting files.
    """
    from app.workflow.stages import STAGE_RUNNERS, STAGES

    return [s["key"] for s in STAGES if s["key"] in STAGE_RUNNERS]
