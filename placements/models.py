"""Placement drives — companies, offers, selection progress (T-19).

Replaces the model layer of `staff/` (misnamed: it was domain-shaped all
along) and `placement_officer/` (a reporting app that happened to own the
category rules).

### Why `db_table` is pinned to the old names

These models are **moved, not recreated**. The rows are live — four batches of
students, their offers and their salaries. So the tables keep their existing
names and the move is state-only: `placements/migrations/0001_initial.py` uses
`SeparateDatabaseAndState` to tell Django the models live here now while
issuing no DDL at all.

That leaves table names carrying an app label that no longer exists, which is
ugly. It is also free of risk, which matters more: renaming a live table is a
deploy-ordering hazard (old code is still running while the rename lands) and
buys nothing but tidiness. If you want the names changed, do it as its own
migration, with the stack down, once this has settled.

Fields are copied **verbatim**. The types are wrong in ways the audit
documents — `min_cgpa` and `salary` are `CharField`s, so eligibility cannot be
filtered in SQL and the consolidation report classifies every offer as "Normal"
(§6.2). Fixing them is T-25. Doing it here, mid-port, would mean a data
migration hiding inside a refactor.
"""

from django.db import models


class Notice(models.Model):
    """The announcement published for a drive."""

    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("PUBLISHED", "Published"),
        ("ARCHIVED", "Archived"),
    ]

    subject = models.CharField(max_length=255)
    date = models.DateField()
    intro = models.TextField()
    about = models.TextField(blank=True, default="")
    company_registration_link = models.URLField(blank=True, default="")
    note = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=255)
    deadline = models.DateField(blank=True, null=True)

    # Parity fields matching InternshipNotice / official TCET notice template
    sr_no = models.CharField(max_length=100, blank=True, default="")
    to = models.CharField(max_length=255, blank=True, default="")
    eligibility_criteria = models.TextField(blank=True, default="")
    roles = models.TextField(blank=True, default="")
    skill_required = models.TextField(blank=True, default="")
    documents_to_carry = models.TextField(blank=True, default="")
    walk_in_interview = models.TextField(blank=True, default="")
    from_field = models.CharField(max_length=255, blank=True, default="")
    from_designation = models.CharField(max_length=255, blank=True, default="")
    notice_type = models.CharField(max_length=50, default="Placement")

    # Workflow, Domain Separation & Version Tracking Fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT", db_index=True)
    batch = models.CharField(max_length=50, blank=True, default="")
    company = models.ForeignKey(
        "placements.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notices",
    )
    opportunity = models.ForeignKey(
        "placements.PlacementOpportunity",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notices",
    )
    version_count = models.PositiveIntegerField(default=1)
    cloned_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clones",
    )
    created_by = models.ForeignKey(
        "base.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_notices",
    )
    updated_by = models.ForeignKey(
        "base.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_notices",
    )
    custom_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        db_table = "staff_notice"

    def __str__(self):
        return f"{self.subject} ({self.notice_type} - {self.status})"


class NoticeVersion(models.Model):
    """Immutable historical snapshot of a published Placement Notice."""

    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name="versions")
    version_number = models.PositiveIntegerField()
    title_or_subject = models.CharField(max_length=255)
    snapshot = models.JSONField(default=dict)
    changes_summary = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        "base.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notice_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_current = models.BooleanField(default=True)

    class Meta:
        db_table = "placements_notice_version"
        unique_together = ("notice", "version_number")
        ordering = ["-version_number"]

    def __str__(self):
        return f"Notice #{self.notice_id} v{self.version_number} - {self.title_or_subject}"


class NoticeAuditLog(models.Model):
    """Append-only audit trail for Placement Notice lifecycle events."""

    ACTION_CHOICES = [
        ("CREATED_DRAFT", "Created Draft"),
        ("UPDATED_DRAFT", "Updated Draft"),
        ("PUBLISHED", "Published"),
        ("UPDATED_VERSION", "Updated Version"),
        ("CLONED", "Cloned as New Notice"),
        ("ARCHIVED", "Archived"),
        ("DELETED_DRAFT", "Deleted Draft"),
    ]

    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name="audit_logs")
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    version_number = models.PositiveIntegerField(null=True, blank=True)
    performed_by = models.ForeignKey(
        "base.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notice_audit_logs",
    )
    performed_by_name = models.CharField(max_length=255, blank=True, default="")
    performed_by_email = models.CharField(max_length=255, blank=True, default="")
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "placements_notice_auditlog"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"Audit #{self.id} Notice #{self.notice_id}: {self.action} by {self.performed_by_email or 'System'}"


class CompanyRegistration(models.Model):
    """A company running a placement drive for one batch."""

    name = models.CharField(max_length=255)
    batch = models.CharField(max_length=50)

    # ⚠️ Eligibility thresholds as strings (audit §6.2). "Students with CGPA >=
    # this company's minimum" therefore cannot be expressed in SQL and runs in
    # Python over the whole table. T-25.
    min_tenth_marks = models.CharField(max_length=10)
    min_higher_secondary_marks = models.CharField(max_length=10)
    min_cgpa = models.CharField(max_length=10)

    accepted_kt = models.BooleanField(default=False)
    domain = models.CharField(max_length=100)
    departments = models.CharField(max_length=255)

    is_aedp_or_pli = models.BooleanField(default=False)
    is_aedp_or_ojt = models.BooleanField(default=False)
    selected_departments = models.JSONField(default=list)
    notice = models.OneToOneField(Notice, on_delete=models.CASCADE)

    class Meta:
        db_table = "staff_companyregistration"
        constraints = [
            models.UniqueConstraint(fields=["name", "batch"], name="unique_name_batch")
        ]

    def __str__(self):
        return f"{self.name} - {self.batch}"


class JobOffer(models.Model):
    """A role a company is hiring for on a drive."""

    form = models.ForeignKey(
        CompanyRegistration, related_name="job_offers", on_delete=models.CASCADE
    )
    role = models.CharField(max_length=255)
    # ⚠️ A string, and with no unit recorded anywhere. Read as LPA by the
    # dashboard's salary bands and as rupees by the consolidation report's
    # employee_type — so every offer reads "Normal" there. Both behaviours are
    # pinned in tests/test_characterisation_reports.py. T-25.
    salary = models.CharField(max_length=50)
    skills = models.TextField()  # comma-separated or JSON if structured

    class Meta:
        db_table = "staff_joboffer"

    def __str__(self):
        return f"{self.role} ({self.form.name}, {self.form.batch})"


class CategoryRule(models.Model):
    """Thresholds that decide which category a student falls into.

    ⚠️ `category` here uses `Category_1`…`Category_4` while
    `Student.current_category` accepts `Category 1`…`No category`. The rule
    engine writes a value the eligibility ladder cannot match, so a categorised
    student is refused every drive. Pinned in
    tests/test_characterisation_categorisation.py; fixed by T-29.
    """

    CATEGORY_CHOICES = [
        ("Category_1", "Category 1"),
        ("Category_2", "Category 2"),
        ("Category_3", "Category 3"),
        ("Category_4", "Category 4"),
    ]
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    batch = models.CharField(max_length=50)  # e.g. BE_2023, BE_2024
    minimum_academic_attendance = models.FloatField(null=True, blank=True)
    minimum_academic_performance = models.FloatField(null=True, blank=True)
    minimum_training_attendance = models.FloatField(null=True, blank=True)
    minimum_training_performance = models.FloatField(null=True, blank=True)

    class Meta:
        db_table = "placement_officer_categoryrule"
        unique_together = ("category", "batch")
        # ⚠️ Alphabetical on the label, which is the only reason the ladder
        # evaluates Category_1 before Category_2. Renaming the categories
        # silently reorders it. T-29 should add an explicit rank column.
        ordering = ["category"]

    def __str__(self):
        return f"{self.category} - {self.batch}"


class Company(models.Model):
    """Normalized Company Master record (T-BulkImport).
    
    Independent of individual batch drives or single offers. Holds college-wide
    company identity, website, and aliases for duplicate matching.
    """

    name = models.CharField(max_length=255, unique=True, db_index=True)
    website = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    aliases = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "placements_company"
        ordering = ["name"]

    def __str__(self):
        return self.name


class PlacementOpportunity(models.Model):
    """Placement or internship hiring opportunity for a specific company and batch (T-BulkImport)."""

    TECH_CHOICES = [
        ("Tech", "Tech"),
        ("Non-Tech", "Non-Tech"),
        ("Both", "Both"),
    ]
    TYPE_CHOICES = [
        ("Placement", "Placement"),
        ("Internship", "Internship"),
        ("Both", "Both"),
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="opportunities")
    batch = models.CharField(max_length=50, db_index=True)
    designation = models.CharField(max_length=500)
    tech_nontech = models.CharField(max_length=20, choices=TECH_CHOICES, default="Tech")
    placement_internship = models.CharField(max_length=20, choices=TYPE_CHOICES, default="Placement")
    eligibility_criteria = models.TextField(blank=True, default="")
    eligible_departments = models.JSONField(default=list, blank=True)
    department_flags = models.JSONField(default=dict, blank=True)
    job_profiles = models.JSONField(default=list, blank=True)
    skills = models.JSONField(default=list, blank=True)
    emolument_raw = models.TextField(blank=True, default="")
    emolument_value = models.FloatField(null=True, blank=True)
    emolument_unit = models.CharField(max_length=50, blank=True, default="")
    selection_process = models.TextField(blank=True, default="")
    number_of_offers = models.IntegerField(null=True, blank=True)
    source_sr_no = models.CharField(max_length=100, blank=True, default="")
    company_registration = models.ForeignKey(
        CompanyRegistration,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="linked_opportunities",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "placements_opportunity"
        indexes = [
            models.Index(fields=["batch", "company"]),
            models.Index(fields=["batch", "designation"]),
        ]

    def __str__(self):
        return f"{self.company.name} - {self.designation} ({self.batch})"


class ImportSession(models.Model):
    """Temporary import tracking session associated with an authorized uploader (T-BulkImport)."""

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("PARSED", "Parsed"),
        ("VALIDATING", "Validating"),
        ("VALIDATED", "Validated"),
        ("PROCESSING", "Processing"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
        ("CANCELLED", "Cancelled"),
    ]

    import uuid
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uploaded_by = models.ForeignKey("base.User", on_delete=models.CASCADE, related_name="company_import_sessions")
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20)
    file_size = models.PositiveIntegerField(default=0)
    file_path = models.CharField(max_length=500, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    warning_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    processed_rows = models.PositiveIntegerField(default=0)
    column_mapping = models.JSONField(default=dict, blank=True)
    duplicate_policy = models.CharField(max_length=20, default="skip")
    summary = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "placements_importsession"
        ordering = ["-created_at"]

    def __str__(self):
        return f"ImportSession {self.id} ({self.status}) - {self.file_name}"


class ImportedRow(models.Model):
    """Temporary staging row for a bulk import session before administrator confirmation (T-BulkImport)."""

    STATUS_CHOICES = [
        ("VALID", "Valid"),
        ("WARNING", "Warning"),
        ("DUPLICATE", "Duplicate"),
        ("ERROR", "Error"),
    ]

    session = models.ForeignKey(ImportSession, on_delete=models.CASCADE, related_name="rows")
    row_number = models.PositiveIntegerField()
    source_sr_no = models.CharField(max_length=100, blank=True, default="")
    raw_data = models.JSONField(default=dict)
    normalized_data = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="VALID")
    validation_messages = models.JSONField(default=list, blank=True)
    duplicate_info = models.JSONField(default=dict, blank=True)
    is_selected = models.BooleanField(default=True)

    class Meta:
        db_table = "placements_importedrow"
        ordering = ["row_number"]
        indexes = [
            models.Index(fields=["session", "row_number"]),
            models.Index(fields=["session", "status"]),
        ]

    def __str__(self):
        return f"Row {self.row_number} [{self.status}] (Session: {self.session_id})"

