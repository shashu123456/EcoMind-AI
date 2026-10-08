'''Model Competition: head-to-head ranking with reasoning'''
# Full implementation aligned with existing model_service


def run_competition(db, dataset_id, params=None):
    """Run head-to-head model competition and return ranked results with reasoning."""
    from app.domain import model_service

    params = params or {}
    result = model_service.run_selection(db, dataset_id, params)
    return result
