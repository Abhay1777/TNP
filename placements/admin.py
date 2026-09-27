"""Django Admin configuration and Custom Import/Export Tool for Placements."""

import logging
from django.contrib import admin, messages
from django.db.models import Q
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404, render
from django.urls import path, reverse
from django.utils.translation import gettext_lazy as _
from unfold.admin import ModelAdmin

from placements.bulk_import.constants import SESSION_EXPIRATION_HOURS
from placements.bulk_import.exporter import (
    export_opportunities_to_csv,
    export_opportunities_to_excel,
)
from placements.bulk_import.importer import commit_import_session, CommitImportError
from placements.bulk_import.parser import parse_uploaded_file, FileValidationError
from placements.bulk_import.template import generate_company_import_template
from placements.bulk_import.validator import ExistingCompaniesCache, validate_row
from placements.models import (
    Company,
    ImportSession,
    ImportedRow,
    PlacementOpportunity,
)

logger = logging.getLogger(__name__)


def placement_import_export_view(request):
    """Custom 2-Tab Placement Import & Export Admin View."""
    active_tab = request.GET.get("tab", "import")
    action = request.GET.get("action") or request.POST.get("action")

    # ---------------------------------------------------------
    # TAB 1: DOWNLOAD OFFICIAL TEMPLATE
    # ---------------------------------------------------------
    if action == "download_template":
        buf = generate_company_import_template()
        response = HttpResponse(
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="TCET_Company_Bulk_Import_Template.xlsx"'
        return response

    # ---------------------------------------------------------
    # TAB 2: EXPORT PLACEMENT OPPORTUNITIES
    # ---------------------------------------------------------
    batch_filter = request.GET.get("batch", "").strip()
    type_filter = request.GET.get("type", "").strip()
    search_query = request.GET.get("q", "").strip()

    export_qs = PlacementOpportunity.objects.select_related("company").all()
    if batch_filter:
        export_qs = export_qs.filter(batch__iexact=batch_filter)
    if type_filter:
        export_qs = export_qs.filter(placement_internship__icontains=type_filter)
    if search_query:
        export_qs = export_qs.filter(
            Q(company__name__icontains=search_query)
            | Q(designation__icontains=search_query)
            | Q(batch__icontains=search_query)
        )

    if action == "export_excel":
        excel_buf = export_opportunities_to_excel(export_qs)
        response = HttpResponse(
            excel_buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        filename = f"TCET_Placement_Export_{batch_filter or 'All'}.xlsx"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    if action == "export_csv":
        csv_buf = export_opportunities_to_csv(export_qs)
        response = HttpResponse(csv_buf.getvalue(), content_type="text/csv; charset=utf-8")
        filename = f"TCET_Placement_Export_{batch_filter or 'All'}.csv"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    # ---------------------------------------------------------
    # TAB 1: POST ACTIONS (UPLOAD, CONFIRM, CANCEL)
    # ---------------------------------------------------------
    if request.method == "POST":
        if action == "upload":
            uploaded_file = request.FILES.get("file")
            if not uploaded_file:
                messages.error(request, "Please select an Excel (.xlsx, .xls) or CSV file to upload.")
                return HttpResponseRedirect(f"{reverse('admin:placements_placement_import_export')}?tab=import")

            try:
                detected_headers, rows_dict, mapping = parse_uploaded_file(uploaded_file)
            except FileValidationError as e:
                messages.error(request, f"File format validation error: {e}")
                return HttpResponseRedirect(f"{reverse('admin:placements_placement_import_export')}?tab=import")
            except Exception as e:
                logger.exception("Spreadsheet parsing failed in admin")
                messages.error(request, f"Could not read spreadsheet: {e}")
                return HttpResponseRedirect(f"{reverse('admin:placements_placement_import_export')}?tab=import")

            from datetime import timedelta
            from django.utils import timezone

            ext = uploaded_file.name.rsplit(".", 1)[-1].lower() if "." in uploaded_file.name else "xlsx"
            expires_at = timezone.now() + timedelta(hours=SESSION_EXPIRATION_HOURS)

            # Create Staging Session
            session = ImportSession.objects.create(
                uploaded_by=request.user,
                file_name=uploaded_file.name,
                file_type=ext,
                file_size=uploaded_file.size,
                column_mapping=mapping,
                status="VALIDATING",
                expires_at=expires_at,
            )

            cache = ExistingCompaniesCache()
            seen_in_batch = set()
            valid_cnt = warning_cnt = duplicate_cnt = error_cnt = 0
            imported_rows = []

            for row_idx, raw_data in enumerate(rows_dict, start=1):
                val_res = validate_row(
                    row_num=row_idx,
                    raw_data=raw_data,
                    column_mapping=mapping,
                    cache=cache,
                    seen_in_batch=seen_in_batch,
                )
                st = val_res["status"]
                if st == "VALID":
                    valid_cnt += 1
                elif st == "WARNING":
                    warning_cnt += 1
                elif st == "DUPLICATE":
                    duplicate_cnt += 1
                else:
                    error_cnt += 1

                imported_rows.append(
                    ImportedRow(
                        session=session,
                        row_number=row_idx,
                        source_sr_no=val_res.get("source_sr_no", ""),
                        raw_data=raw_data,
                        normalized_data=val_res["normalized_data"],
                        status=st,
                        validation_messages=val_res["validation_messages"],
                        duplicate_info=val_res["duplicate_info"],
                    )
                )

            ImportedRow.objects.bulk_create(imported_rows, batch_size=500)
            session.status = "VALIDATED"
            session.total_rows = len(rows_dict)
            session.valid_rows = valid_cnt
            session.warning_rows = warning_cnt
            session.duplicate_rows = duplicate_cnt
            session.error_rows = error_cnt
            session.save(update_fields=["status", "total_rows", "valid_rows", "warning_rows", "duplicate_rows", "error_rows"])

            messages.info(
                request,
                f"File '{uploaded_file.name}' processed: {valid_cnt} valid, {warning_cnt} warnings, {duplicate_cnt} duplicates, {error_cnt} errors.",
            )
            return HttpResponseRedirect(f"{reverse('admin:placements_placement_import_export')}?tab=import&session_id={session.id}")

        elif action == "confirm":
            session_id = request.POST.get("session_id")
            duplicate_policy = request.POST.get("duplicate_policy", "skip")
            session = get_object_or_404(ImportSession, id=session_id)

            try:
                result = commit_import_session(session, duplicate_policy)
                messages.success(
                    request,
                    f"Import successfully committed! {result['created_companies_count']} companies created, {result['created_opportunities_count']} opportunities created, {result['skipped_count']} duplicates skipped.",
                )
                return HttpResponseRedirect(f"{reverse('admin:placements_placement_import_export')}?tab=import&committed=1&session_id={session.id}")
            except CommitImportError as e:
                messages.error(request, f"Import commit failed: {e}")
                return HttpResponseRedirect(f"{reverse('admin:placements_placement_import_export')}?tab=import&session_id={session.id}")

        elif action == "cancel":
            session_id = request.POST.get("session_id")
            if session_id:
                ImportSession.objects.filter(id=session_id).delete()
                messages.info(request, "Staging session cancelled. Temporary upload data was safely discarded.")
            return HttpResponseRedirect(f"{reverse('admin:placements_placement_import_export')}?tab=import")

    # ---------------------------------------------------------
    # RENDER CONTEXT
    # ---------------------------------------------------------
    session_id = request.GET.get("session_id")
    staging_session = None
    committed_session = None
    preview_rows = []

    if session_id:
        try:
            s = ImportSession.objects.get(id=session_id)
            # If committed=1 is in the URL or DB status is COMPLETED, show success report
            if request.GET.get("committed") == "1" or s.status == "COMPLETED":
                committed_session = s
            elif s.status in ("PARSED", "VALIDATING", "VALIDATED", "staging", "PROCESSING"):
                staging_session = s
                preview_rows = s.rows.all().order_by("row_number")[:100]
        except ImportSession.DoesNotExist:
            pass

    available_batches = (
        PlacementOpportunity.objects.exclude(batch__isnull=True)
        .exclude(batch="")
        .values_list("batch", flat=True)
        .distinct()
        .order_by("-batch")
    )

    context = {
        **admin.site.each_context(request),
        "title": "Placement (Import & Export)",
        "active_tab": active_tab,
        "staging_session": staging_session,
        "committed_session": committed_session,
        "preview_rows": preview_rows,
        # Export context
        "available_batches": list(available_batches),
        "selected_batch": batch_filter,
        "selected_type": type_filter,
        "search_query": search_query,
        "total_export_count": export_qs.count(),
        "export_preview_rows": export_qs.order_by("-created_at")[:25],
    }

    return render(request, "admin/placements/placement_import_export.html", context)


# ---------------------------------------------------------
# MODEL ADMIN REGISTRATIONS
# ---------------------------------------------------------

@admin.register(Company)
class CompanyAdmin(ModelAdmin):
    list_display = (
        "name",
        "website",
        "created_at",
    )
    search_fields = ("name", "website")
    list_filter = ("created_at",)
    readonly_fields = ("id", "created_at", "updated_at")

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "import-export/",
                self.admin_site.admin_view(placement_import_export_view),
                name="placements_placement_import_export",
            ),
        ]
        return custom_urls + urls


@admin.register(PlacementOpportunity)
class PlacementOpportunityAdmin(ModelAdmin):
    list_display = (
        "company",
        "batch",
        "designation",
        "placement_internship",
        "tech_nontech",
        "emolument_raw",
        "number_of_offers",
        "created_at",
    )
    search_fields = ("company__name", "designation", "batch")
    list_filter = ("batch", "placement_internship", "tech_nontech")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ImportSession)
class ImportSessionAdmin(ModelAdmin):
    list_display = (
        "id",
        "file_name",
        "uploaded_by",
        "status",
        "total_rows",
        "valid_rows",
        "warning_rows",
        "duplicate_rows",
        "error_rows",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("file_name", "uploaded_by__email")
    readonly_fields = (
        "id",
        "uploaded_by",
        "file_name",
        "file_type",
        "file_size",
        "status",
        "total_rows",
        "valid_rows",
        "warning_rows",
        "duplicate_rows",
        "error_rows",
        "processed_rows",
        "column_mapping",
        "duplicate_policy",
        "summary",
        "created_at",
        "expires_at",
        "completed_at",
    )
