"""Serializers for Placement Notice Automation workflow."""

import json
from rest_framework import serializers

from placements.models import (
    Company,
    Notice,
    NoticeAuditLog,
    NoticeVersion,
    PlacementOpportunity,
)


class NoticeVersionSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = NoticeVersion
        fields = [
            "id",
            "version_number",
            "title_or_subject",
            "snapshot",
            "changes_summary",
            "created_by_email",
            "created_by_name",
            "created_at",
            "is_current",
        ]
        read_only_fields = fields


class NoticeAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoticeAuditLog
        fields = [
            "id",
            "action",
            "version_number",
            "performed_by_name",
            "performed_by_email",
            "timestamp",
            "details",
            "ip_address",
        ]
        read_only_fields = fields


class NoticeDetailSerializer(serializers.ModelSerializer):
    table_data = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True, default="")
    company_website = serializers.CharField(source="company.website", read_only=True, default="")
    opportunity_designation = serializers.CharField(source="opportunity.designation", read_only=True, default="")
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True, default="")
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")
    updated_by_email = serializers.EmailField(source="updated_by.email", read_only=True, default="")
    latest_version = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = [
            "id",
            "sr_no",
            "to",
            "subject",
            "date",
            "intro",
            "about",
            "eligibility_criteria",
            "roles",
            "table_data",
            "skill_required",
            "documents_to_carry",
            "walk_in_interview",
            "company_registration_link",
            "note",
            "from_field",
            "from_designation",
            "location",
            "deadline",
            "notice_type",
            "status",
            "batch",
            "company",
            "company_name",
            "company_website",
            "opportunity",
            "opportunity_designation",
            "version_count",
            "cloned_from",
            "created_by_email",
            "created_by_name",
            "updated_by_email",
            "custom_data",
            "latest_version",
            "created_at",
            "updated_at",
        ]

    def get_table_data(self, obj):
        if obj.custom_data and "table_data" in obj.custom_data:
            return obj.custom_data["table_data"]
        if obj.roles:
            try:
                parsed = json.loads(obj.roles)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
        return []

    def get_latest_version(self, obj):
        version = obj.versions.filter(is_current=True).first()
        if version:
            return {
                "version_number": version.version_number,
                "changes_summary": version.changes_summary,
                "created_at": version.created_at,
            }
        return None


class NoticeDraftSaveSerializer(serializers.Serializer):
    """Payload for saving or updating an isolated Placement Notice draft."""
    subject = serializers.CharField(max_length=255, required=False, allow_blank=True)
    date = serializers.DateField(required=False, allow_null=True)
    to = serializers.CharField(max_length=255, required=False, allow_blank=True)
    intro = serializers.CharField(required=False, allow_blank=True)
    about = serializers.CharField(required=False, allow_blank=True)
    eligibility_criteria = serializers.CharField(required=False, allow_blank=True)
    skill_required = serializers.CharField(required=False, allow_blank=True)
    documents_to_carry = serializers.CharField(required=False, allow_blank=True)
    walk_in_interview = serializers.CharField(required=False, allow_blank=True)
    company_registration_link = serializers.CharField(required=False, allow_blank=True)
    college_registration_link = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    from_field = serializers.CharField(max_length=255, required=False, allow_blank=True)
    from_designation = serializers.CharField(max_length=255, required=False, allow_blank=True)
    location = serializers.CharField(max_length=255, required=False, allow_blank=True)
    deadline = serializers.DateField(required=False, allow_null=True)
    sr_no = serializers.CharField(max_length=100, required=False, allow_blank=True)
    opportunity_id = serializers.IntegerField(required=False, allow_null=True)
    company_id = serializers.IntegerField(required=False, allow_null=True)
    batch = serializers.CharField(max_length=50, required=False, allow_blank=True)
    table_data = serializers.ListField(child=serializers.DictField(), required=False)
    skills_list = serializers.ListField(child=serializers.CharField(), required=False)


class NoticePublishSerializer(serializers.Serializer):
    """Payload for validating and publishing a Placement Notice."""
    subject = serializers.CharField(max_length=255, required=True)
    date = serializers.DateField(required=True)
    to = serializers.CharField(max_length=255, required=True)
    intro = serializers.CharField(required=True)
    about = serializers.CharField(required=False, allow_blank=True)
    eligibility_criteria = serializers.CharField(required=True)
    skill_required = serializers.CharField(required=False, allow_blank=True)
    documents_to_carry = serializers.CharField(required=False, allow_blank=True)
    walk_in_interview = serializers.CharField(required=False, allow_blank=True)
    company_registration_link = serializers.CharField(required=False, allow_blank=True)
    college_registration_link = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    from_field = serializers.CharField(max_length=255, required=False, allow_blank=True)
    from_designation = serializers.CharField(max_length=255, required=False, allow_blank=True)
    location = serializers.CharField(max_length=255, required=False, allow_blank=True)
    deadline = serializers.DateField(required=False, allow_null=True)
    sr_no = serializers.CharField(max_length=100, required=False, allow_blank=True)
    table_data = serializers.ListField(child=serializers.DictField(), required=False)
