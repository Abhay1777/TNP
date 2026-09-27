"""Celery background tasks for bulk company imports."""

import logging
from celery import shared_task

from placements.models import ImportSession
from placements.bulk_import.importer import commit_import_session

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def run_bulk_company_import_task(self, session_id: str, duplicate_policy: str = "skip", selected_row_ids=None):
    """Execute bulk import in the background with Celery for large spreadsheets."""
    try:
        session = ImportSession.objects.get(id=session_id)
    except ImportSession.DoesNotExist:
        logger.error(f"ImportSession {session_id} not found for Celery task.")
        return {"error": "ImportSession not found"}

    try:
        summary = commit_import_session(
            session=session,
            duplicate_policy=duplicate_policy,
            selected_row_ids=selected_row_ids,
        )
        return summary
    except Exception as exc:
        logger.exception(f"Error in run_bulk_company_import_task for session {session_id}")
        return {"error": str(exc)}
