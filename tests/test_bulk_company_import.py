"""Tests for Admin / Staff Bulk Company Import system (T-BulkImport)."""

import io
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from placements.bulk_import.constants import CANONICAL_COLUMNS
from placements.bulk_import.importer import commit_import_session
from placements.bulk_import.template import generate_company_import_template
from placements.bulk_import.validator import (
    ExistingCompaniesCache,
    check_department_consistency,
    normalize_batch,
    parse_boolean_flag,
    parse_emolument_ctc,
    validate_and_normalize_website,
    validate_row,
)
from placements.models import Company, ImportSession, ImportedRow, PlacementOpportunity

User = get_user_model()


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        email="staff_importer@tcetmumbai.in",
        full_name="Staff Importer",
        role="staff",
        password="TestPassword123!",
    )


@pytest.fixture
def student_user(db):
    return User.objects.create_user(
        email="student@tcetmumbai.in",
        full_name="Student User",
        role="student",
        password="TestPassword123!",
    )


@pytest.fixture
def other_staff_user(db):
    return User.objects.create_user(
        email="other_staff@tcetmumbai.in",
        full_name="Other Staff",
        role="staff",
        password="TestPassword123!",
    )


@pytest.mark.django_db
class TestValidatorUnits:
    """Test unit normalization and validation rules."""

    def test_parse_boolean_flags(self):
        assert parse_boolean_flag("Yes") is True
        assert parse_boolean_flag("Y") is True
        assert parse_boolean_flag(1) is True
        assert parse_boolean_flag("True") is True
        assert parse_boolean_flag("checked") is True
        assert parse_boolean_flag("✔") is True
        assert parse_boolean_flag("No") is False
        assert parse_boolean_flag(0) is False
        assert parse_boolean_flag("") is False
        assert parse_boolean_flag(None) is False

    def test_normalize_batch(self):
        norm, raw = normalize_batch("2027")
        assert norm == "2027"
        assert raw == "2027"

        norm, raw = normalize_batch("2026-27")
        assert norm == "2026"
        assert raw == "2026-27"

        norm, raw = normalize_batch("Batch 2028 Passout")
        assert norm == "2028"

    def test_parse_emolument_ctc(self):
        val, unit, raw = parse_emolument_ctc("7.5 LPA")
        assert val == 7.5
        assert unit == "LPA"

        val, unit, raw = parse_emolument_ctc("₹25,000/month")
        assert val == 25000.0
        assert unit == "MONTHLY_STIPEND"

        val, unit, raw = parse_emolument_ctc("600000")
        assert val == 6.0
        assert unit == "LPA"

    def test_validate_and_normalize_website(self):
        url, valid = validate_and_normalize_website("www.tcs.com")
        assert valid is True
        assert url == "https://www.tcs.com"

        url, valid = validate_and_normalize_website("https://google.com")
        assert valid is True
        assert url == "https://google.com"

        url, valid = validate_and_normalize_website("")
        assert valid is True
        assert url == ""

    def test_check_department_consistency(self):
        flags = {"COMP": True, "IT": True, "CIVIL": False}
        assert check_department_consistency(flags, "COMP, IT") is True
        assert check_department_consistency(flags, "All Departments") is True
        # Mismatch: flags are COMP/IT but text says only CIVIL
        assert check_department_consistency(flags, "CIVIL Only") is False


@pytest.mark.django_db
class TestTemplateGeneration:
    """Test official 36-column Excel template generation."""

    def test_template_contains_all_36_headers(self):
        buf = generate_company_import_template()
        assert buf is not None
        buf.seek(0)
        import openpyxl
        wb = openpyxl.load_workbook(buf)
        ws = wb["Company_Import_Template"]
        headers = [cell.value for cell in ws[1]]
        assert len(headers) == 36
        assert headers == CANONICAL_COLUMNS


@pytest.mark.django_db
class TestUploadAndValidationWorkflow:
    """Test full upload, staging, zero-write preview, and commit."""

    def test_upload_excel_creates_staging_without_permanent_records(self, staff_user):
        client = APIClient()
        client.force_authenticate(user=staff_user)

        # Generate template containing sample rows
        buf = generate_company_import_template()
        uploaded_file = SimpleUploadedFile(
            "test_companies.xlsx",
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        initial_companies_count = Company.objects.count()
        initial_opps_count = PlacementOpportunity.objects.count()

        url = reverse("bulk-import-upload")
        response = client.post(url, {"file": uploaded_file}, format="multipart")

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "session" in data
        session_id = data["session"]["id"]

        # ZERO database write to permanent Company / Opportunity tables
        assert Company.objects.count() == initial_companies_count
        assert PlacementOpportunity.objects.count() == initial_opps_count

        # Temporary staging session & rows created
        session = ImportSession.objects.get(id=session_id)
        assert session.total_rows == 3  # The 3 sample rows
        assert session.rows.count() == 3

    def test_unauthorized_student_cannot_upload(self, student_user):
        client = APIClient()
        client.force_authenticate(user=student_user)

        buf = generate_company_import_template()
        uploaded_file = SimpleUploadedFile(
            "test.xlsx",
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        url = reverse("bulk-import-upload")
        response = client.post(url, {"file": uploaded_file}, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_object_ownership_enforcement(self, staff_user, other_staff_user):
        client = APIClient()
        client.force_authenticate(user=staff_user)

        # Staff 1 creates session
        buf = generate_company_import_template()
        uploaded_file = SimpleUploadedFile("test.xlsx", buf.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res = client.post(reverse("bulk-import-upload"), {"file": uploaded_file}, format="multipart")
        session_id = res.json()["session"]["id"]

        # Staff 2 tries to access Staff 1's session
        client.force_authenticate(user=other_staff_user)
        preview_url = reverse("bulk-import-session-preview", kwargs={"session_id": session_id})
        res2 = client.get(preview_url)
        assert res2.status_code == status.HTTP_403_FORBIDDEN

    def test_inline_row_correction(self, staff_user):
        client = APIClient()
        client.force_authenticate(user=staff_user)

        buf = generate_company_import_template()
        uploaded_file = SimpleUploadedFile("test.xlsx", buf.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res = client.post(reverse("bulk-import-upload"), {"file": uploaded_file}, format="multipart")
        session_id = res.json()["session"]["id"]

        session = ImportSession.objects.get(id=session_id)
        first_row = session.rows.first()

        # Update designation
        patch_url = reverse("bulk-import-row-correction", kwargs={"session_id": session_id, "row_id": first_row.id})
        patch_res = client.patch(patch_url, {"updates": {"Designation": "Senior Systems Engineer"}}, format="json")
        assert patch_res.status_code == status.HTTP_200_OK

        first_row.refresh_from_db()
        assert first_row.normalized_data["designation"] == "Senior Systems Engineer"

    def test_confirmation_atomic_commit(self, staff_user):
        client = APIClient()
        client.force_authenticate(user=staff_user)

        buf = generate_company_import_template()
        uploaded_file = SimpleUploadedFile("test.xlsx", buf.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res = client.post(reverse("bulk-import-upload"), {"file": uploaded_file}, format="multipart")
        session_id = res.json()["session"]["id"]

        confirm_url = reverse("bulk-import-session-confirm", kwargs={"session_id": session_id})
        confirm_res = client.post(confirm_url, {"duplicate_policy": "skip", "async_mode": False}, format="json")

        assert confirm_res.status_code == status.HTTP_200_OK
        data = confirm_res.json()
        assert data["status"] == "COMPLETED"

        # Now permanent records must exist
        assert Company.objects.filter(name__icontains="Tata Consultancy Services").exists()
        assert PlacementOpportunity.objects.filter(company__name__icontains="Tata Consultancy Services").exists()

        # Double-confirmation must be rejected
        second_res = client.post(confirm_url, {"duplicate_policy": "skip", "async_mode": False}, format="json")
        assert second_res.status_code == status.HTTP_400_BAD_REQUEST
