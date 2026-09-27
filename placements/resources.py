"""Import-Export resources for Company and PlacementOpportunity models."""

from import_export import resources, fields
from import_export.widgets import ForeignKeyWidget
from placements.models import Company, PlacementOpportunity


class CompanyResource(resources.ModelResource):
    class Meta:
        model = Company
        fields = (
            "id",
            "name",
            "canonical_name",
            "tier",
            "industry_sector",
            "website",
            "linkedin_url",
            "headquarters",
            "created_at",
        )
        export_order = fields
        import_id_fields = ("canonical_name",)


class PlacementOpportunityResource(resources.ModelResource):
    company = fields.Field(
        column_name="company",
        attribute="company",
        widget=ForeignKeyWidget(Company, "name"),
    )

    class Meta:
        model = PlacementOpportunity
        fields = (
            "id",
            "company",
            "batch",
            "designation",
            "placement_internship",
            "tech_non_tech",
            "emolument_raw",
            "eligibility_criteria",
            "selection_process",
            "no_of_offers",
            "created_at",
        )
        export_order = fields
        import_id_fields = ("id",)
