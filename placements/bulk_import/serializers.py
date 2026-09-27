"""DRF Serializers for Bulk Company Import."""

from rest_framework import serializers

from placements.models import Company, ImportSession, ImportedRow, PlacementOpportunity


class ImportSessionSerializer(serializers.ModelSerializer):
    uploaded_by_email = serializers.EmailField(source="uploaded_by.email", read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)

    class Meta:
        model = ImportSession
        fields = [
            "id",
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
            "uploaded_by_email",
            "uploaded_by_name",
        ]
        read_only_fields = fields


class ImportedRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedRow
        fields = [
            "id",
            "row_number",
            "source_sr_no",
            "raw_data",
            "normalized_data",
            "status",
            "validation_messages",
            "duplicate_info",
            "is_selected",
        ]


class RowCorrectionSerializer(serializers.Serializer):
    """Payload for inline correction of temporary staging rows."""
    updates = serializers.DictField(child=serializers.CharField(allow_blank=True, allow_null=True))
    is_selected = serializers.BooleanField(required=False)


class ConfirmImportSerializer(serializers.Serializer):
    """Payload to confirm and commit an ImportSession to database."""
    duplicate_policy = serializers.ChoiceField(
        choices=["skip", "update", "keep_separate"], default="skip"
    )
    selected_row_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )
    async_mode = serializers.BooleanField(required=False, default=None)


class PlacementOpportunitySearchSerializer(serializers.ModelSerializer):
    """Serializer for searching opportunities during Placement Notice creation."""
    company_name = serializers.CharField(source="company.name", read_only=True)
    company_website = serializers.CharField(source="company.website", read_only=True)

    class Meta:
        model = PlacementOpportunity
        fields = [
            "id",
            "company_name",
            "company_website",
            "batch",
            "designation",
            "tech_nontech",
            "placement_internship",
            "eligibility_criteria",
            "eligible_departments",
            "department_flags",
            "job_profiles",
            "skills",
            "emolument_raw",
            "emolument_value",
            "emolument_unit",
            "selection_process",
            "number_of_offers",
            "created_at",
        ]
