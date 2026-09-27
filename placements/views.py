"""HTTP adapters for placement drives and reports (T-19 / T-21).

Everything that decides *what is true* lives in `placements/services.py`. These
views parse a request, call one service function, and serialise the result.
They replace `staff/views.py` (376 LOC) and `placement_officer/views.py`
(498 LOC).

Authorisation is declarative — `HasRole` and the role groups in
`base/permissions.py`, specified by `docs/PERMISSIONS.md`. URL paths are
unchanged, so the frontend does not notice this move.
"""

import logging
import os
import shutil
import uuid
from pathlib import Path

from celery.result import AsyncResult
from django.conf import settings
from django.db import transaction
from django.db.models import Avg
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from dotenv import load_dotenv
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from base.error_utils import safe_error_payload
from base.permissions import ROLES, HasRole
from dataimport import sources as historical_sources
from notifications.models import Notification
from notifications.serializers import NotificationSerializer
from placements import services
from placements.bulk_import import views as bulk_views
from placements.models import CategoryRule, CompanyRegistration, Notice
from placements.pagination import StandardResultsSetPagination as ReportPagination
from placements.serializers import (
    BasicStudentSerializer,
    FormDataSerializer,
    InterestedStudentApplicationSerializer,
    NotInterestedStudentApplicationSerializer,
    NoticeSerializer,
    StudentDetailReportSerializer,
)
from placements.tasks import (
    generate_excel_export_task,
    generate_resume_zip_task,
    run_historical_import_task,
)
from program_coordinator_api.models import AttendanceData, TrainingPerformanceCategory
from student.models import Student, StudentOffer, StudentPlacementAppliedCompany
from student.serializers import StudentSerializer

logger = logging.getLogger(__name__)

DRIVE = HasRole.of(*ROLES.PLACEMENT_DRIVE)
DRIVE_OR_READ = HasRole.of(*ROLES.PLACEMENT_DRIVE, read_any=True)
REPORTS = HasRole.of(*ROLES.PLACEMENT_REPORTS)


# ---------------------------------------------------------------------------
# Placement Notices  (standalone notices not tied to a CompanyRegistration)
# ---------------------------------------------------------------------------

class PlacementNoticeCreateOrUpdateView(APIView):
    """Create or update a standalone placement notice.

    POST body mirrors the Notice model fields.  If a notice with the same
    ``subject`` + ``date`` already exists it is updated in-place (idempotent
    for re-submissions); otherwise a new row is inserted.
    """

    permission_classes = [DRIVE]

    def post(self, request, *args, **kwargs):
        try:
            subject = request.data.get("subject", "").strip()
            date = request.data.get("date")
            if not subject or not date:
                return Response(
                    {"error": "subject and date are required fields."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            table_data = request.data.get("tableData") or request.data.get("table_data")
            notice, created = Notice.objects.get_or_create(
                subject=subject,
                date=date,
                defaults={"notice_type": "Placement"},
            )
            serializer = NoticeSerializer(notice, data=request.data, partial=not created)
            serializer.is_valid(raise_exception=True)
            serializer.save(notice_type="Placement")

            if table_data is not None and isinstance(table_data, list):
                import json
                notice.roles = json.dumps(table_data)
                notice.save(update_fields=["roles"])

            response_data = NoticeSerializer(notice).data
            http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
            return Response(
                {"message": "Notice saved.", "data": response_data},
                status=http_status,
            )
        except Exception as e:
            logger.exception("Error saving placement notice")
            return Response(safe_error_payload(e), status=status.HTTP_400_BAD_REQUEST)


class PlacementNoticeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update or delete a placement notice by primary key."""

    serializer_class = NoticeSerializer
    permission_classes = [DRIVE_OR_READ]

    def get_object(self):
        return get_object_or_404(Notice, pk=self.kwargs["pk"], notice_type="Placement")


# ---------------------------------------------------------------------------
# Companies and drives
# ---------------------------------------------------------------------------

class ApplicantPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class CompanyListCreateView(generics.ListCreateAPIView):
    queryset = CompanyRegistration.objects.all().order_by("-id")
    serializer_class = FormDataSerializer
    permission_classes = [DRIVE_OR_READ]


class CompanyDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FormDataSerializer
    lookup_field = "id"
    # Students read eligibility criteria before deciding whether to apply; only
    # the T&P office may edit or delete a drive.
    permission_classes = [DRIVE_OR_READ]

    def get_object(self):
        return get_object_or_404(CompanyRegistration, id=self.kwargs.get("id"))


class CompanyByBatchView(generics.ListAPIView):
    serializer_class = FormDataSerializer
    permission_classes = [DRIVE_OR_READ]

    def get_queryset(self):
        return CompanyRegistration.objects.filter(batch=self.kwargs.get("batch"))


class CompanyBatchesView(APIView):
    permission_classes = [DRIVE_OR_READ]

    def get(self, request, *args, **kwargs):
        batches = [
            b
            for b in CompanyRegistration.objects.values_list("batch", flat=True).distinct()
            if b
        ]
        batches.sort(reverse=True)
        return Response(batches)


class PlacementReportBatchesView(APIView):
    """Batches that actually have `Student` rows - i.e. batches the report
    dashboards (`placement_dashboard`, branch-wise report, ...) can render
    something for.

    Deliberately not `CompanyBatchesView`: that endpoint lists
    `CompanyRegistration.batch` values, which a staff member can register a
    drive against before a single student of that batch exists in the
    system, or simply mistype. Every report below queries `Student`, so this
    is the batch list that matches what they can actually show - selecting
    the newest one first (as the dashboards do by default) never lands on an
    empty year.
    """

    permission_classes = [REPORTS]

    def get(self, request, *args, **kwargs):
        batches = [
            b for b in Student.objects.values_list("batch", flat=True).distinct() if b
        ]
        batches.sort(reverse=True)
        return Response(batches)


class SendPlacementNotificationApiView(generics.CreateAPIView):
    """Notify a drive's eligible or registered students."""

    serializer_class = NotificationSerializer
    lookup_field = "id"
    permission_classes = [DRIVE]

    def create(self, request, *args, **kwargs):
        try:
            load_dotenv()
            company = get_object_or_404(CompanyRegistration, id=self.kwargs.get("id"))
            send_to = request.data.get("sendTo")
            content = request.data.get("content")

            if send_to == "eligible":
                student_ids = services.eligible_student_ids(company)
                if not student_ids:
                    return Response(
                        {"message": "No eligible students found for this company."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                recipients = [
                    s.user for s in Student.objects.filter(id__in=student_ids)
                ]
                message = (
                    f"{content}\n\n"
                    f"Dear Student,\n\nYou are eligible to apply for placement at {company.name}.\n"
                    f"Apply link: {os.getenv('CLIENT_URL')}/student/placement/registration/{company.id}"
                    f"\n\nBest regards,\nTraining and Placement Team"
                )
            else:
                applications = StudentPlacementAppliedCompany.objects.filter(
                    company=company, interested=True
                ).select_related("student")
                recipients = [a.student.user for a in applications]
                message = (
                    f"{content}\n\n"
                    f"Dear Student,\n\nThis is a notification regarding your application "
                    f"for placement at {company.name}.\n"
                    f"Please check your dashboard for more details."
                    f"\n\nBest regards,\nTraining and Placement Team"
                )

            notification = Notification.objects.create(
                title=request.data.get("title"),
                message=message,
                creator=request.user,
                category="placement",
            )
            # Recipients are resolved at read time now (T-23); this set is used
            # only to address the push.
            notification.recipients.set(recipients)

            return Response(
                self.get_serializer(notification).data, status=status.HTTP_201_CREATED
            )
        except Exception as e:
            logger.exception("Error sending placement notification")
            return Response(safe_error_payload(e), status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Applicants
# ---------------------------------------------------------------------------

class _CompanyScopedList(generics.ListAPIView):
    """Shared plumbing for the three applicant lists."""

    pagination_class = ApplicantPagination
    permission_classes = [DRIVE]

    def get_company(self):
        return get_object_or_404(CompanyRegistration, id=self.kwargs["company_id"])


class PaginatedInterestedStudentsView(_CompanyScopedList):
    serializer_class = InterestedStudentApplicationSerializer

    def get_queryset(self):
        return StudentPlacementAppliedCompany.objects.filter(
            company=self.get_company(), interested=True
        ).select_related("application")


class PaginatedNotInterestedStudentsView(_CompanyScopedList):
    serializer_class = NotInterestedStudentApplicationSerializer

    def get_queryset(self):
        return StudentPlacementAppliedCompany.objects.filter(
            company=self.get_company(), interested=False
        )


class EligibleButNotRegisteredView(_CompanyScopedList):
    serializer_class = BasicStudentSerializer

    def get_queryset(self):
        company = self.get_company()
        eligible = set(services.eligible_student_ids(company))
        registered = set(
            StudentPlacementAppliedCompany.objects.filter(
                company=company
            ).values_list("student_id", flat=True)
        )
        return Student.objects.filter(id__in=eligible - registered)


class BulkUpdateProgressView(APIView):
    """Advance a batch of applicants through a selection round."""

    permission_classes = [DRIVE]

    def post(self, request, *args, **kwargs):
        application_ids = request.data.get("application_ids", [])
        stage = request.data.get("stage")
        stage_status = request.data.get("status")
        final_result = request.data.get("final_result")
        joined = request.data.get("joined")

        if not isinstance(application_ids, list) or not application_ids:
            return Response(
                {"error": "application_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                applications = StudentPlacementAppliedCompany.objects.filter(
                    id__in=application_ids
                ).select_related("student", "company", "job_offer", "application")
                if not applications:
                    return Response(
                        {"error": "No valid applications found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                update_data = {}
                if stage and stage_status is not None:
                    from student.models import PlacementCompanyProgress

                    if not hasattr(PlacementCompanyProgress, stage):
                        raise ValueError(f"Invalid progress stage: {stage}")
                    update_data[stage] = stage_status
                if final_result:
                    update_data["final_result"] = final_result
                if not update_data and not joined:
                    return Response(
                        {"error": "No update data provided (stage/status or final_result)."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                progress_records, offers_to_create = [], []
                for app in applications:
                    progress = app.application
                    for field, value in update_data.items():
                        setattr(progress, field, value)
                    progress_records.append(progress)

                    if final_result == "Selected":
                        offers_to_create.append(
                            StudentOffer(
                                student=app.student,
                                company=app.company,
                                job_offer=app.job_offer,
                                salary=app.job_offer.salary,
                                role=app.job_offer.role,
                                offer_type=(
                                    "AEDP_PLI" if app.company.is_aedp_or_pli else "STANDARD"
                                ),
                                status="offered",
                            )
                        )
                    if joined:
                        StudentOffer.objects.update(
                            student=app.student, company=app.company, status="joined"
                        )
                        app.student.joined_company = True
                        app.student.save()

                if progress_records and update_data:
                    from student.models import PlacementCompanyProgress

                    PlacementCompanyProgress.objects.bulk_update(
                        progress_records, fields=update_data.keys()
                    )
                if offers_to_create:
                    StudentOffer.objects.bulk_create(offers_to_create)

            return Response(
                {
                    "status": "success",
                    "updated_count": len(progress_records),
                    "offers_created": len(offers_to_create),
                },
                status=status.HTTP_200_OK,
            )
        except ValueError as e:
            logger.exception("Invalid progress update request")
            return Response(safe_error_payload(e), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                safe_error_payload(e), status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

class TriggerExcelExportView(APIView):
    permission_classes = [DRIVE]

    def get(self, request, company_id, *args, **kwargs):
        task = generate_excel_export_task.delay(company_id)
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class TriggerResumeExportView(APIView):
    permission_classes = [DRIVE]

    def get(self, request, company_id, *args, **kwargs):
        task = generate_resume_zip_task.delay(company_id)
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class GetTaskStatusView(APIView):
    permission_classes = [DRIVE]

    def get(self, request, task_id, *args, **kwargs):
        result = AsyncResult(task_id)
        payload = {"task_id": task_id, "status": result.state}
        if result.state == "SUCCESS":
            payload["url"] = result.result.get("file_url")
        elif result.state == "FAILURE":
            logger.exception("Background task %s failed", task_id, exc_info=result.info)
            payload.update(safe_error_payload(result.info))
        return Response(payload, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Historical batch import
#
# Lets a placement officer add a graduated batch's placement records — the
# rosters and "Students Placement Register" workbooks — by uploading them in
# the browser, instead of needing shell access to run
# `manage.py import_historical_data` on the server. Wraps the exact same
# `dataimport` package that command uses.
# ---------------------------------------------------------------------------

#: Comfortably above the largest source workbook seen (~2.2MB); well below
#: anything that would make a synchronous multipart upload itself slow.
MAX_HISTORICAL_UPLOAD_MB = 15
ALLOWED_HISTORICAL_UPLOAD_EXTENSIONS = (".xls", ".xlsx")


class UploadHistoricalImportView(APIView):
    """``POST`` one or more spreadsheets, queue their import, return a task id.

    Files are saved into a per-request directory under ``MEDIA_ROOT`` — the
    same volume the ``celery`` container mounts — then handed to
    ``run_historical_import_task``, which deletes them once it finishes. A
    file whose format neither importer recognises is rejected here, before
    anything is queued, so a stray spreadsheet fails immediately with a clear
    message rather than reporting "0 files processed" a minute later.
    """

    permission_classes = [DRIVE]
    parser_classes = [MultiPartParser]

    def post(self, request, *args, **kwargs):
        files = request.FILES.getlist("files")
        if not files:
            return Response(
                {"error": "Attach at least one .xls or .xlsx file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dry_run = str(request.data.get("dry_run", "")).strip().lower() in ("1", "true", "yes")

        upload_dir = Path(settings.MEDIA_ROOT) / "historical_import_uploads" / uuid.uuid4().hex
        upload_dir.mkdir(parents=True, exist_ok=True)

        try:
            saved_names = []
            for uploaded in files:
                # Path(...).name strips any directory component a crafted
                # filename might carry, so the file can only land inside
                # upload_dir - never escape it.
                safe_name = Path(uploaded.name).name
                suffix = Path(safe_name).suffix.lower()

                if suffix not in ALLOWED_HISTORICAL_UPLOAD_EXTENSIONS:
                    return Response(
                        {"error": f"'{safe_name}' is not a .xls or .xlsx file."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if uploaded.size > MAX_HISTORICAL_UPLOAD_MB * 1024 * 1024:
                    return Response(
                        {"error": f"'{safe_name}' is larger than {MAX_HISTORICAL_UPLOAD_MB}MB."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                destination = upload_dir / safe_name
                with open(destination, "wb") as out:
                    for chunk in uploaded.chunks():
                        out.write(chunk)
                saved_names.append(safe_name)

            unrecognised = [
                name for name in saved_names
                if historical_sources.classify(upload_dir / name) is None
            ]
            if unrecognised:
                return Response(
                    {
                        "error": (
                            "Could not recognise the format of: " + ", ".join(unrecognised) +
                            ". Expected a student roster (uid, department, full_name, email, "
                            "batch, ... columns) or a 'Students Placement Register' workbook."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception:
            shutil.rmtree(upload_dir, ignore_errors=True)
            raise

        task = run_historical_import_task.delay(str(upload_dir), dry_run)
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class HistoricalImportStatusView(APIView):
    """Poll target for ``UploadHistoricalImportView`` — mirrors ``GetTaskStatusView``,
    kept separate because a successful import returns a full report, not a file URL.
    """

    permission_classes = [DRIVE]

    def get(self, request, task_id, *args, **kwargs):
        result = AsyncResult(task_id)
        payload = {"task_id": task_id, "status": result.state}
        if result.state == "SUCCESS":
            payload["report"] = result.result
        elif result.state == "FAILURE":
            logger.exception("Historical import task %s failed", task_id, exc_info=result.info)
            payload.update(safe_error_payload(result.info))
        return Response(payload, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Student records the T&P office maintains
# ---------------------------------------------------------------------------

class StudentDetailUpdateView(generics.RetrieveUpdateAPIView):
    permission_classes = [DRIVE]
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    lookup_field = "uid"


class UpdateStudentCategoryView(APIView):
    """Re-categorise a whole batch against threshold values.

    ⚠️ The single most destructive endpoint in the API: one POST rewrites
    `current_category` for every matching student. See docs/PERMISSIONS.md.
    """

    permission_classes = [DRIVE]

    def post(self, request):
        data = request.data
        try:
            thresholds = {
                key: float(data.get(key, 0))
                for key in ("cgpa", "academic_attendance", "training_attendance", "training_performance")
            }
        except ValueError:
            return Response(
                {"error": "Invalid threshold values"}, status=status.HTTP_400_BAD_REQUEST
            )

        candidates = Student.objects.filter(
            batch=data.get("batch"),
            cgpa__gte=thresholds["cgpa"],
            attendance__gte=thresholds["academic_attendance"],
        )

        matching_ids = []
        for student in candidates:
            records = AttendanceData.objects.filter(uid=student.uid)
            total = records.count()
            attendance_pct = (
                records.filter(present__iexact="Present").count() / total * 100
                if total
                else 0.0
            )
            performance = (
                TrainingPerformanceCategory.objects.filter(
                    performance__student=student
                ).aggregate(avg_marks=Avg("marks"))["avg_marks"]
                or 0.0
            )
            if (
                attendance_pct >= thresholds["training_attendance"]
                and performance >= thresholds["training_performance"]
            ):
                matching_ids.append(student.id)

        updated = Student.objects.filter(id__in=matching_ids).update(
            current_category=data.get("category")
        )
        return Response(
            {"message": "Category updated successfully", "students_updated": updated},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([REPORTS])
def consent_statistics(request, year=None):
    import json

    batch = year or request.query_params.get("batch") or request.query_params.get("year")
    breakdown = services.consent_breakdown(batch)
    return JsonResponse(
        {
            "consent_graph": json.dumps(breakdown["consent_graph"]),
            "consent_counts_by_branch": json.dumps(breakdown["consent_counts_by_branch"]),
        }
    )


@api_view(["GET"])
@permission_classes([REPORTS])
def filter_by_department(request, department, year=None):
    import json

    batch = year or request.query_params.get("batch") or request.query_params.get("year")
    return JsonResponse(
        {"filtered_data": json.dumps(services.consent_by_department(department, batch))}
    )


@api_view(["GET"])
@permission_classes([REPORTS])
def get_unique_departments(request, year=None):
    batch = year or request.query_params.get("batch") or request.query_params.get("year")
    return JsonResponse(
        {"unique_departments": services.unique_departments(batch)}
    )


@api_view(["GET"])
@permission_classes([REPORTS])
def get_category(request, year=None):
    batch = year or request.query_params.get("batch") or request.query_params.get("year")
    return JsonResponse({"category": services.category_breakdown(batch=batch)})


@api_view(["GET"])
@permission_classes([REPORTS])
def get_category_by_department(request, department, year=None):
    batch = year or request.query_params.get("batch") or request.query_params.get("year")
    return JsonResponse({"category": services.category_breakdown(department, batch=batch)})


@api_view(["POST"])
@permission_classes([REPORTS])
def create_category_rule(request):
    try:
        CategoryRule.objects.create(**request.data)
        return JsonResponse({"message": "Category rule created successfully"}, status=201)
    except Exception as e:
        return JsonResponse(safe_error_payload(e), status=400)


@api_view(["GET"])
@permission_classes([REPORTS])
def list_category_rules(request):
    return Response(list(CategoryRule.objects.all().values()))


@api_view(["GET"])
@permission_classes([REPORTS])
def students_by_category(request, category, batch):
    try:
        return Response(services.students_in_category(category, batch))
    except Exception as e:
        return Response(
            safe_error_payload(e), status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


class ConsolidationReportAPIView(APIView):
    permission_classes = [REPORTS]

    def get(self, request, batch, *args, **kwargs):
        return Response(services.consolidation_report(batch))


class PlacementDashboardAPIView(APIView):
    permission_classes = [REPORTS]

    def get(self, request, batch, *args, **kwargs):
        return Response(services.placement_dashboard(batch))


class BranchwiseReportAPIView(APIView):
    permission_classes = [REPORTS]

    def get(self, request, batch, *args, **kwargs):
        return Response(services.branchwise_report(batch))


class StudentDetailReportAPIView(APIView):
    permission_classes = [REPORTS]
    pagination_class = ReportPagination

    def get(self, request, batch, *args, **kwargs):
        students = services.student_detail_rows(
            batch, request.query_params.get("department")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(students, request, view=self)

        # Progress is attached only for the current page - loading it for the
        # whole batch would defeat the pagination.
        paginator.active_companies = services.attach_progress(page, batch)

        serializer = StudentDetailReportSerializer(
            page,
            many=True,
            context={"request": request, "companies": paginator.active_companies},
        )
        return paginator.get_paginated_response(serializer.data)
