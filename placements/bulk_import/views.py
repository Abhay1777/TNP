"""API Views for Bulk Company Import."""

import logging
from datetime import timedelta

from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.permissions import HasRole, ROLES
from placements.bulk_import.constants import SESSION_EXPIRATION_HOURS
from placements.bulk_import.importer import commit_import_session, CommitImportError
from placements.bulk_import.parser import (
    FileValidationError,
    parse_uploaded_file,
)
from placements.bulk_import.serializers import (
    ConfirmImportSerializer,
    ImportSessionSerializer,
    ImportedRowSerializer,
    PlacementOpportunitySearchSerializer,
    RowCorrectionSerializer,
)
from placements.bulk_import.template import generate_company_import_template
from placements.bulk_import.validator import (
    ExistingCompaniesCache,
    validate_row,
)
from placements.models import ImportSession, ImportedRow, PlacementOpportunity

logger = logging.getLogger(__name__)


def check_session_ownership(request, session: ImportSession):
    """Enforce object-level access: uploader or superuser only."""
    if not (request.user.is_superuser or session.uploaded_by_id == request.user.id):
        return Response(
            {"error": "You do not have permission to access or modify this import session."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class TemplateDownloadView(APIView):
    """Download official 36-column Excel template with sample rows and guidelines."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def get(self, request, *args, **kwargs):
        buf = generate_company_import_template()
        response = HttpResponse(
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="TCET_Company_Bulk_Import_Template.xlsx"'
        return response


class UploadAndValidateView(APIView):
    """Upload Excel/CSV file, parse, validate, and create temporary staging session with ZERO permanent writes."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "No file uploaded. Please select an Excel or CSV file."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            headers, column_mapping, raw_rows = parse_uploaded_file(file_obj)
        except FileValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error during file parsing")
            return Response({"error": f"Failed to parse file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        if not raw_rows:
            return Response({"error": "The uploaded file contains no data rows."}, status=status.HTTP_400_BAD_REQUEST)

        # Build cache for fast duplicate detection
        cache = ExistingCompaniesCache()
        seen_in_batch = set()

        expires_at = timezone.now() + timedelta(hours=SESSION_EXPIRATION_HOURS)

        # Create session
        file_ext = file_obj.name.split(".")[-1].lower() if "." in file_obj.name else "unknown"
        session = ImportSession.objects.create(
            uploaded_by=request.user,
            file_name=file_obj.name,
            file_type=file_ext,
            file_size=getattr(file_obj, "size", 0),
            status="VALIDATING",
            total_rows=len(raw_rows),
            column_mapping=column_mapping,
            expires_at=expires_at,
        )

        imported_row_instances = []
        valid_count = 0
        warning_count = 0
        duplicate_count = 0
        error_count = 0

        for idx, r_data in enumerate(raw_rows, start=1):
            result = validate_row(
                row_num=idx,
                raw_data=r_data,
                column_mapping=column_mapping,
                cache=cache,
                seen_in_batch=seen_in_batch,
            )

            st = result["status"]
            if st == "VALID":
                valid_count += 1
            elif st == "WARNING":
                warning_count += 1
            elif st == "DUPLICATE":
                duplicate_count += 1
            elif st == "ERROR":
                error_count += 1

            imported_row_instances.append(
                ImportedRow(
                    session=session,
                    row_number=result["row_number"],
                    source_sr_no=result["source_sr_no"],
                    raw_data=result["raw_data"],
                    normalized_data=result["normalized_data"],
                    status=result["status"],
                    validation_messages=result["validation_messages"],
                    duplicate_info=result["duplicate_info"],
                    is_selected=(st != "ERROR"),
                )
            )

        # Bulk insert staging rows
        ImportedRow.objects.bulk_create(imported_row_instances, batch_size=500)

        # Update session totals
        session.status = "VALIDATED"
        session.valid_rows = valid_count
        session.warning_rows = warning_count
        session.duplicate_rows = duplicate_count
        session.error_rows = error_count
        session.save(
            update_fields=[
                "status",
                "valid_rows",
                "warning_rows",
                "duplicate_rows",
                "error_rows",
            ]
        )

        return Response(
            {
                "message": "File parsed and validated successfully.",
                "session": ImportSessionSerializer(session).data,
                "detected_headers": headers,
                "column_mapping": column_mapping,
            },
            status=status.HTTP_201_CREATED,
        )


class ImportSessionDetailView(APIView):
    """Retrieve details and metrics of an import session."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def get(self, request, session_id, *args, **kwargs):
        session = get_object_or_404(ImportSession, id=session_id)
        auth_err = check_session_ownership(request, session)
        if auth_err:
            return auth_err
        return Response(ImportSessionSerializer(session).data)


class ImportSessionPreviewView(APIView):
    """Retrieve paginated staging rows for review, filtering, and search."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def get(self, request, session_id, *args, **kwargs):
        session = get_object_or_404(ImportSession, id=session_id)
        auth_err = check_session_ownership(request, session)
        if auth_err:
            return auth_err

        qs = session.rows.all().order_by("row_number")

        # Status filter
        status_filter = request.query_params.get("status", "all").upper()
        if status_filter in ("VALID", "WARNING", "DUPLICATE", "ERROR"):
            qs = qs.filter(status=status_filter)

        # Search filter
        search_query = request.query_params.get("search", "").strip()
        if search_query:
            qs = qs.filter(
                Q(raw_data__icontains=search_query) |
                Q(normalized_data__company_name__icontains=search_query) |
                Q(normalized_data__designation__icontains=search_query)
            )

        page_number = request.query_params.get("page", 1)
        page_size = min(int(request.query_params.get("page_size", 25)), 100)

        paginator = Paginator(qs, page_size)
        page = paginator.get_page(page_number)

        serializer = ImportedRowSerializer(page, many=True)
        return Response({
            "session_id": str(session.id),
            "total_items": paginator.count,
            "total_pages": paginator.num_pages,
            "current_page": page.number,
            "page_size": page_size,
            "counts": {
                "total": session.total_rows,
                "valid": session.valid_rows,
                "warning": session.warning_rows,
                "duplicate": session.duplicate_rows,
                "error": session.error_rows,
            },
            "rows": serializer.data,
        })


class RowCorrectionView(APIView):
    """Inline correction of an individual preview row, immediately re-running row validation."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def patch(self, request, session_id, row_id, *args, **kwargs):
        session = get_object_or_404(ImportSession, id=session_id)
        auth_err = check_session_ownership(request, session)
        if auth_err:
            return auth_err

        if session.status in ("COMPLETED", "PROCESSING"):
            return Response(
                {"error": "Cannot modify rows of an import session that has already completed or is processing."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row = get_object_or_404(ImportedRow, session=session, id=row_id)
        serializer = RowCorrectionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updates = serializer.validated_data.get("updates", {})
        is_selected = serializer.validated_data.get("is_selected", row.is_selected)

        # Apply updates to raw_data
        updated_raw = dict(row.raw_data)
        for k, v in updates.items():
            updated_raw[k] = v

        cache = ExistingCompaniesCache()
        seen = set()

        validation_result = validate_row(
            row_num=row.row_number,
            raw_data=updated_raw,
            column_mapping=session.column_mapping,
            cache=cache,
            seen_in_batch=seen,
        )

        with transaction.atomic():
            old_status = row.status
            new_status = validation_result["status"]

            row.raw_data = updated_raw
            row.normalized_data = validation_result["normalized_data"]
            row.status = new_status
            row.validation_messages = validation_result["validation_messages"]
            row.duplicate_info = validation_result["duplicate_info"]
            row.is_selected = is_selected
            row.save()

            # Recalculate session status counts if status changed
            if old_status != new_status:
                session.valid_rows = session.rows.filter(status="VALID").count()
                session.warning_rows = session.rows.filter(status="WARNING").count()
                session.duplicate_rows = session.rows.filter(status="DUPLICATE").count()
                session.error_rows = session.rows.filter(status="ERROR").count()
                session.save(update_fields=["valid_rows", "warning_rows", "duplicate_rows", "error_rows"])

        return Response({
            "message": "Row updated and revalidated.",
            "row": ImportedRowSerializer(row).data,
            "session_counts": {
                "valid": session.valid_rows,
                "warning": session.warning_rows,
                "duplicate": session.duplicate_rows,
                "error": session.error_rows,
            },
        })


class ConfirmImportView(APIView):
    """Revalidate and commit import session to the permanent database safely."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def post(self, request, session_id, *args, **kwargs):
        session = get_object_or_404(ImportSession, id=session_id)
        auth_err = check_session_ownership(request, session)
        if auth_err:
            return auth_err

        serializer = ConfirmImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        duplicate_policy = serializer.validated_data.get("duplicate_policy", "skip")
        selected_row_ids = serializer.validated_data.get("selected_row_ids", None)
        async_mode = serializer.validated_data.get("async_mode")

        if async_mode is None:
            # Auto-decide: synchronous if <= 50 rows, asynchronous via Celery if > 50 rows
            async_mode = session.total_rows > 50

        if async_mode:
            try:
                from placements.bulk_import.tasks import run_bulk_company_import_task
                session.status = "PROCESSING"
                session.duplicate_policy = duplicate_policy
                session.save(update_fields=["status", "duplicate_policy"])
                task = run_bulk_company_import_task.delay(
                    session_id=str(session.id),
                    duplicate_policy=duplicate_policy,
                    selected_row_ids=selected_row_ids,
                )
                return Response(
                    {
                        "message": "Import job dispatched to background worker.",
                        "session_id": str(session.id),
                        "task_id": task.id,
                        "status": "PROCESSING",
                    },
                    status=status.HTTP_202_ACCEPTED,
                )
            except Exception as e:
                logger.warning(f"Celery dispatch failed ({e}), falling back to synchronous execution.")

        try:
            summary = commit_import_session(
                session=session,
                duplicate_policy=duplicate_policy,
                selected_row_ids=selected_row_ids,
            )
            return Response(
                {
                    "message": "Import completed successfully.",
                    "session_id": str(session.id),
                    "status": "COMPLETED",
                    "summary": summary,
                },
                status=status.HTTP_200_OK,
            )
        except CommitImportError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error in commit_import_session")
            return Response({"error": f"Import failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ImportSessionStatusView(APIView):
    """Poll progress status of an executing or completed import session."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def get(self, request, session_id, *args, **kwargs):
        session = get_object_or_404(ImportSession, id=session_id)
        auth_err = check_session_ownership(request, session)
        if auth_err:
            return auth_err

        return Response({
            "session_id": str(session.id),
            "status": session.status,
            "total_rows": session.total_rows,
            "processed_rows": session.processed_rows,
            "summary": session.summary,
            "completed_at": session.completed_at,
        })


class CancelImportSessionView(APIView):
    """Cancel a staging import session and clean up its temporary rows."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def post(self, request, session_id, *args, **kwargs):
        session = get_object_or_404(ImportSession, id=session_id)
        auth_err = check_session_ownership(request, session)
        if auth_err:
            return auth_err

        if session.status in ("COMPLETED", "PROCESSING"):
            return Response(
                {"error": "Cannot cancel a session that is already processing or completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            session.rows.all().delete()
            session.status = "CANCELLED"
            session.save(update_fields=["status"])

        return Response({"message": "Import session cancelled and temporary records cleared."})


class ImportHistoryView(APIView):
    """List historical import sessions with metrics, status, and timestamps."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def get(self, request, *args, **kwargs):
        if request.user.is_superuser:
            qs = ImportSession.objects.all().order_by("-created_at")
        else:
            qs = ImportSession.objects.filter(uploaded_by=request.user).order_by("-created_at")

        serializer = ImportSessionSerializer(qs[:50], many=True)
        return Response(serializer.data)


class OpportunitySearchView(APIView):
    """Search opportunities for autofilling Notice creation forms."""
    permission_classes = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]

    def get(self, request, *args, **kwargs):
        q = request.query_params.get("q", "").strip()
        batch = request.query_params.get("batch", "").strip()
        opp_type = request.query_params.get("type", "").strip()

        qs = PlacementOpportunity.objects.select_related("company").all().order_by("-created_at")

        if batch:
            qs = qs.filter(batch=batch)
        if opp_type:
            qs = qs.filter(placement_internship__iexact=opp_type)
        if q:
            qs = qs.filter(
                Q(company__name__icontains=q) |
                Q(designation__icontains=q) |
                Q(skills__icontains=q)
            )

        serializer = PlacementOpportunitySearchSerializer(qs[:30], many=True)
        return Response(serializer.data)
