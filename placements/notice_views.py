"""API Views for Staff Placement Notice Automation."""

import logging
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.error_utils import safe_error_payload
from base.permissions import HasRole, ROLES
from placements.models import Notice, NoticeAuditLog, NoticeVersion
from placements.notice_serializers import (
    NoticeAuditLogSerializer,
    NoticeDetailSerializer,
    NoticeDraftSaveSerializer,
    NoticePublishSerializer,
    NoticeVersionSerializer,
)
from placements import notice_service

logger = logging.getLogger(__name__)

DRIVE_PERMS = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE)]
DRIVE_OR_READ_PERMS = [IsAuthenticated, HasRole.of(*ROLES.PLACEMENT_DRIVE, read_any=True)]


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class PlacementOpportunitySearchAPIView(APIView):
    """Search opportunities for autofilling Placement Notices."""
    permission_classes = DRIVE_PERMS

    def get(self, request, *args, **kwargs):
        q = request.query_params.get("q", "")
        batch = request.query_params.get("batch", "")
        opp_type = request.query_params.get("type", "")
        limit = int(request.query_params.get("limit", 50))

        results = notice_service.search_placement_opportunities(
            query=q,
            batch=batch,
            opp_type=opp_type,
            limit=limit,
        )
        return Response(results, status=status.HTTP_200_OK)


class PlacementOpportunityAutofillAPIView(APIView):
    """Fetch autofill default values for a selected Opportunity.
    
    Edit Isolation Guarantee: These autofill values populate the notice form
    without mutating the master Company or Opportunity records.
    """
    permission_classes = DRIVE_PERMS

    def get(self, request, pk, *args, **kwargs):
        try:
            data = notice_service.get_opportunity_autofill_data(int(pk))
            return Response(data, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Error generating autofill data for opportunity %s", pk)
            return Response(safe_error_payload(e), status=status.HTTP_400_BAD_REQUEST)


class PlacementNoticeNextSerialAPIView(APIView):
    """Fetch the next institutional Placement Notice serial number."""
    permission_classes = DRIVE_PERMS

    def get(self, request, *args, **kwargs):
        sr_no = notice_service.generate_next_serial_number("Placement")
        return Response({"sr_no": sr_no}, status=status.HTTP_200_OK)


class PlacementNoticeDraftListCreateAPIView(APIView):
    """List private drafts or create/update a Notice draft."""
    permission_classes = DRIVE_PERMS

    def get(self, request, *args, **kwargs):
        if request.user.is_superuser:
            drafts = Notice.objects.filter(status="DRAFT", notice_type="Placement").order_by("-updated_at")
        else:
            drafts = Notice.objects.filter(
                status="DRAFT",
                notice_type="Placement",
                created_by=request.user,
            ).order_by("-updated_at")

        serializer = NoticeDetailSerializer(drafts, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        serializer = NoticeDraftSaveSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        draft_id = request.data.get("id") or request.data.get("draft_id")
        ip_addr = get_client_ip(request)

        try:
            notice = notice_service.save_notice_draft(
                user=request.user,
                draft_id=draft_id,
                data=serializer.validated_data,
                ip_address=ip_addr,
            )
            return Response(
                {
                    "message": "Draft saved successfully.",
                    "notice": NoticeDetailSerializer(notice).data,
                },
                status=status.HTTP_201_CREATED if not draft_id else status.HTTP_200_OK,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Error saving notice draft")
            return Response(safe_error_payload(e), status=status.HTTP_400_BAD_REQUEST)


class PlacementNoticeDraftDetailAPIView(APIView):
    """Retrieve, update, or delete a specific Notice draft."""
    permission_classes = DRIVE_PERMS

    def get(self, request, pk, *args, **kwargs):
        notice = get_object_or_404(Notice, pk=pk, status="DRAFT", notice_type="Placement")
        if notice.created_by and notice.created_by != request.user and not request.user.is_superuser:
            return Response(
                {"error": "Access denied. You cannot view another user's private draft."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(NoticeDetailSerializer(notice).data)

    def patch(self, request, pk, *args, **kwargs):
        serializer = NoticeDraftSaveSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        ip_addr = get_client_ip(request)
        try:
            notice = notice_service.save_notice_draft(
                user=request.user,
                draft_id=pk,
                data=serializer.validated_data,
                ip_address=ip_addr,
            )
            return Response({
                "message": "Draft updated.",
                "notice": NoticeDetailSerializer(notice).data,
            })
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk, *args, **kwargs):
        notice = get_object_or_404(Notice, pk=pk, status="DRAFT", notice_type="Placement")
        if notice.created_by and notice.created_by != request.user and not request.user.is_superuser:
            return Response(
                {"error": "Access denied. You cannot delete another user's draft."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ip_addr = get_client_ip(request)
        NoticeAuditLog.objects.create(
            notice=notice,
            action="DELETED_DRAFT",
            performed_by=request.user,
            performed_by_name=request.user.full_name if hasattr(request.user, "full_name") else "",
            performed_by_email=request.user.email if hasattr(request.user, "email") else "",
            details={"deleted_notice_id": notice.id, "subject": notice.subject},
            ip_address=ip_addr,
        )
        notice.delete()
        return Response({"message": "Draft deleted successfully."}, status=status.HTTP_200_OK)


class PlacementNoticePublishAPIView(APIView):
    """Publish a Draft Notice as Version 1 or create Version N+1 for updates."""
    permission_classes = DRIVE_PERMS

    def post(self, request, pk, *args, **kwargs):
        serializer = NoticePublishSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        ip_addr = get_client_ip(request)
        try:
            notice, version = notice_service.publish_notice_service(
                user=request.user,
                notice_id=pk,
                data=serializer.validated_data,
                ip_address=ip_addr,
            )
            return Response({
                "message": f"Notice published successfully (Version {version.version_number}).",
                "notice": NoticeDetailSerializer(notice).data,
                "version": NoticeVersionSerializer(version).data,
            }, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Error publishing notice %s", pk)
            return Response(safe_error_payload(e), status=status.HTTP_400_BAD_REQUEST)


class PlacementNoticeListAPIView(APIView):
    """List published/all placement notices with optional filtering."""
    permission_classes = DRIVE_OR_READ_PERMS

    def get(self, request, *args, **kwargs):
        qs = Notice.objects.filter(notice_type="Placement").order_by("-updated_at")
        status_filter = request.query_params.get("status")
        batch_filter = request.query_params.get("batch")
        q_filter = request.query_params.get("q")

        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        if batch_filter:
            qs = qs.filter(batch__iexact=batch_filter)
        if q_filter:
            qs = qs.filter(subject__icontains=q_filter)

        serializer = NoticeDetailSerializer(qs[:100], many=True)
        return Response(serializer.data)


class PlacementNoticeDetailAPIView(APIView):
    """Retrieve full details of a specific Placement Notice."""
    permission_classes = DRIVE_OR_READ_PERMS

    def get(self, request, pk, *args, **kwargs):
        notice = get_object_or_404(Notice, pk=pk, notice_type="Placement")
        return Response(NoticeDetailSerializer(notice).data)


class PlacementNoticeVersionListAPIView(APIView):
    """List all immutable historical versions and changelogs of a Notice."""
    permission_classes = DRIVE_OR_READ_PERMS

    def get(self, request, pk, *args, **kwargs):
        notice = get_object_or_404(Notice, pk=pk, notice_type="Placement")
        versions = notice.versions.all().order_by("-version_number")
        serializer = NoticeVersionSerializer(versions, many=True)
        return Response(serializer.data)


class PlacementNoticeVersionDetailAPIView(APIView):
    """Retrieve an immutable historical version snapshot of a Notice."""
    permission_classes = DRIVE_OR_READ_PERMS

    def get(self, request, pk, version_number, *args, **kwargs):
        version = get_object_or_404(NoticeVersion, notice_id=pk, version_number=version_number)
        serializer = NoticeVersionSerializer(version)
        return Response(serializer.data)


class PlacementNoticeCloneAPIView(APIView):
    """Clone an existing Notice into a new independent Notice Draft."""
    permission_classes = DRIVE_PERMS

    def post(self, request, pk, *args, **kwargs):
        ip_addr = get_client_ip(request)
        try:
            new_notice = notice_service.clone_notice_as_new(
                user=request.user,
                source_notice_id=pk,
                ip_address=ip_addr,
            )
            return Response({
                "message": "Notice cloned successfully as a new draft.",
                "notice": NoticeDetailSerializer(new_notice).data,
            }, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Error cloning notice %s", pk)
            return Response(safe_error_payload(e), status=status.HTTP_400_BAD_REQUEST)


class PlacementNoticeAuditLogsAPIView(APIView):
    """Retrieve append-only audit trail for a Placement Notice."""
    permission_classes = DRIVE_PERMS

    def get(self, request, pk, *args, **kwargs):
        notice = get_object_or_404(Notice, pk=pk, notice_type="Placement")
        logs = notice.audit_logs.all().order_by("-timestamp")
        serializer = NoticeAuditLogSerializer(logs, many=True)
        return Response(serializer.data)


class PlacementNoticeAIExtractAPIView(APIView):
    """Safely extract structured fields from raw circular/email text.
    
    Security: Treated strictly as untrusted input. Direct publishing is prohibited.
    """
    permission_classes = DRIVE_PERMS

    def post(self, request, *args, **kwargs):
        raw_text = request.data.get("text", "").strip()
        if not raw_text:
            return Response({"error": "Text content is required for AI extraction."}, status=status.HTTP_400_BAD_REQUEST)

        extracted = notice_service.safe_ai_extract_notice(raw_text)
        return Response(extracted, status=status.HTTP_200_OK)
