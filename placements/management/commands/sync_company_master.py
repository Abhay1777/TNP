"""
Management command: sync_company_master

Performs additive-safe reconciliation from an XLSX source file into the
Company (Master) and PlacementOpportunity tables.

Reconciliation policy:
  MATCH       -- row already exists; no action.
  UPDATE      -- company exists but website is blank; fill it.
  NEW_OPP     -- company exists; create the missing PlacementOpportunity.
  NEW_COMPANY -- company doesn't exist; create Company + PlacementOpportunity.
  SKIP_BLANK  -- row missing required fields (company/batch/designation); skip.

Usage:
  # Dry run (no DB writes, reports what would change)
  python manage.py sync_company_master --dry-run

  # Live run with default XLSX path
  python manage.py sync_company_master

  # Custom XLSX path
  python manage.py sync_company_master --xlsx /path/to/file.xlsx

  # Override batch label for all rows
  python manage.py sync_company_master --batch-override BE_2026
"""

import re
from pathlib import Path
from typing import Any

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from placements.bulk_import.constants import (
    DEPARTMENT_COLUMNS,
    PLACEMENT_INTERNSHIP_CHOICES,
    TECH_CHOICES,
)
from placements.models import Company, PlacementOpportunity

DEFAULT_XLSX = Path(__file__).resolve().parents[3] / "Industry Database Batch 2026.xlsx"


def _normalize(s: Any) -> str:
    """Lowercase, strip, collapse internal whitespace for fuzzy key matching."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s).strip().lower())


def _cell(row: tuple, idx) -> str:
    if idx is None or idx >= len(row):
        return ""
    v = row[idx]
    return str(v).strip() if v is not None else ""


def _col_idx(headers: list, name: str):
    """Find column index by exact or prefix case-insensitive match."""
    name_n = _normalize(name)
    for i, h in enumerate(headers):
        if _normalize(h) == name_n:
            return i
    # Prefix fallback (first 6 chars)
    for i, h in enumerate(headers):
        if _normalize(h).startswith(name_n[:6]):
            return i
    return None


class Command(BaseCommand):
    help = "Additive-safe sync of the Company Master database from an XLSX source file."

    def add_arguments(self, parser):
        parser.add_argument(
            "--xlsx",
            type=str,
            default=str(DEFAULT_XLSX),
            help="Path to the source XLSX file.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Report changes without writing to the database.",
        )
        parser.add_argument(
            "--batch-override",
            type=str,
            default="",
            help="Override the batch value for all rows (e.g. BE_2026).",
        )

    def handle(self, *args, **options):
        xlsx_path = Path(options["xlsx"])
        dry_run: bool = options["dry_run"]
        batch_override: str = options["batch_override"].strip()

        if not xlsx_path.exists():
            raise CommandError(f"XLSX file not found: {xlsx_path}")

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "\n" + ("DRY RUN -- " if dry_run else "")
                + f"Company Master Sync from {xlsx_path.name}"
            )
        )

        # ── Load XLSX ─────────────────────────────────────────────────────
        wb = openpyxl.load_workbook(str(xlsx_path), read_only=True, data_only=True)
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        wb.close()

        # Auto-detect header row (skip title rows with < 5 non-empty cells)
        header_row_idx = None
        raw_headers: list = []
        for i, row in enumerate(all_rows):
            non_empty = [c for c in row if c is not None and str(c).strip()]
            if len(non_empty) >= 5:
                header_row_idx = i
                raw_headers = [str(c).strip() if c is not None else "" for c in row]
                break

        if header_row_idx is None:
            raise CommandError(
                "Could not detect header row in XLSX (need >= 5 non-empty cells)."
            )

        data_rows = all_rows[header_row_idx + 1:]
        self.stdout.write(
            f"  Source rows: {len(data_rows)} (header at row index {header_row_idx})"
        )

        # ── Column resolution ─────────────────────────────────────────────
        COL_COMPANY = _col_idx(raw_headers, "Name of the Company")
        COL_BATCH = _col_idx(raw_headers, "Batch")
        COL_DESIGNATION = _col_idx(raw_headers, "Designation")
        COL_WEBSITE = _col_idx(raw_headers, "Company Website")
        COL_PLACEMENT = _col_idx(raw_headers, "Placement")
        COL_ELIGIBLE_DEPT = _col_idx(raw_headers, "Eligible Department")
        COL_EMOLUMENT = _col_idx(raw_headers, "Emolument")
        COL_OFFERS = _col_idx(raw_headers, "No Of Offers")
        COL_ELIGIBILITY = _col_idx(raw_headers, "Eligibility Criteria")
        COL_SELECTION = _col_idx(raw_headers, "Selection Process")
        COL_TECH = _col_idx(raw_headers, "Tech")

        skill_cols = [
            idx for i in range(1, 9)
            if (idx := _col_idx(raw_headers, f"Skillset Required {i}")) is not None
        ]
        profile_cols = [
            idx for i in range(1, 6)
            if (idx := _col_idx(raw_headers, f"Job Profile {i}")) is not None
        ]
        dept_col_map = {
            dept: idx
            for dept in DEPARTMENT_COLUMNS
            if (idx := _col_idx(raw_headers, dept)) is not None
        }

        # ── Load existing DB into fast-lookup dicts ────────────────────────
        existing_companies = {
            _normalize(c.name): c for c in Company.objects.all()
        }
        existing_opps = {
            (
                _normalize(o.company.name),
                _normalize(o.batch),
                _normalize(o.designation),
                o.placement_internship.lower(),
            ): o
            for o in PlacementOpportunity.objects.select_related("company").all()
        }

        self.stdout.write(
            f"  DB state: {len(existing_companies)} companies, "
            f"{len(existing_opps)} opportunities"
        )

        # ── Reconciliation pass ────────────────────────────────────────────
        stats = {
            "match": 0, "update": 0, "new_opp": 0,
            "new_company": 0, "skip_blank": 0,
        }
        actions = []

        for row_num, row in enumerate(data_rows, start=header_row_idx + 2):
            company_name = _cell(row, COL_COMPANY)
            batch = batch_override or _cell(row, COL_BATCH)
            designation = _cell(row, COL_DESIGNATION)
            website = _cell(row, COL_WEBSITE)
            raw_type = _cell(row, COL_PLACEMENT)
            placement_type = PLACEMENT_INTERNSHIP_CHOICES.get(
                _normalize(raw_type), "Placement"
            )

            skills = [_cell(row, i) for i in skill_cols if _cell(row, i)]
            job_profiles = [_cell(row, i) for i in profile_cols if _cell(row, i)]
            dept_flags = {
                dept: (_cell(row, cidx).strip().lower() == "yes")
                for dept, cidx in dept_col_map.items()
            }
            eligible_departments = [
                dept for dept, flag in dept_flags.items() if flag
            ] or [
                d.strip()
                for d in _cell(row, COL_ELIGIBLE_DEPT).split(",")
                if d.strip()
            ]
            emolument_raw = _cell(row, COL_EMOLUMENT)
            selection_process = _cell(row, COL_SELECTION)
            eligibility_criteria = _cell(row, COL_ELIGIBILITY)
            tech_nontech = TECH_CHOICES.get(_normalize(_cell(row, COL_TECH)), "Tech")

            offers_str = _cell(row, COL_OFFERS)
            try:
                number_of_offers = int(float(offers_str)) if offers_str else None
            except (ValueError, TypeError):
                number_of_offers = None

            if not company_name or not batch or not designation:
                stats["skip_blank"] += 1
                continue

            comp_key = _normalize(company_name)
            opp_key = (
                comp_key,
                _normalize(batch),
                _normalize(designation),
                placement_type.lower(),
            )

            existing_company = existing_companies.get(comp_key)
            existing_opp = existing_opps.get(opp_key)

            # Common opportunity field defaults
            opp_fields = dict(
                tech_nontech=tech_nontech,
                placement_internship=placement_type,
                eligibility_criteria=eligibility_criteria,
                eligible_departments=eligible_departments,
                department_flags={
                    d: ("Yes" if f else "No") for d, f in dept_flags.items()
                },
                job_profiles=job_profiles,
                skills=skills,
                emolument_raw=emolument_raw,
                selection_process=selection_process,
                number_of_offers=number_of_offers,
            )

            if existing_company and existing_opp:
                if website and not existing_company.website:
                    stats["update"] += 1
                    actions.append(
                        ("UPDATE", row_num, company_name, {"website": website})
                    )
                else:
                    stats["match"] += 1

            elif existing_company and not existing_opp:
                stats["new_opp"] += 1
                actions.append((
                    "NEW_OPP", row_num, company_name,
                    {"company": existing_company, "batch": batch,
                     "designation": designation, **opp_fields},
                ))

            else:
                # New company + new opportunity
                stats["new_company"] += 1
                actions.append((
                    "NEW_COMPANY", row_num, company_name,
                    {"website": website, "batch": batch,
                     "designation": designation, **opp_fields},
                ))

        # ── Summary report ─────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 65)
        self.stdout.write("RECONCILIATION SUMMARY")
        self.stdout.write("=" * 65)
        self.stdout.write(
            f"  MATCH       (no action):              {stats['match']:>5}"
        )
        self.stdout.write(
            f"  UPDATE      (website fill):           {stats['update']:>5}"
        )
        self.stdout.write(
            f"  NEW_OPP     (new opportunity):        {stats['new_opp']:>5}"
        )
        self.stdout.write(
            f"  NEW_COMPANY (new company + opp):      {stats['new_company']:>5}"
        )
        self.stdout.write(
            f"  SKIP_BLANK  (missing required cols):  {stats['skip_blank']:>5}"
        )
        self.stdout.write("=" * 65)

        total_writes = stats["update"] + stats["new_opp"] + stats["new_company"]

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "\nDRY RUN -- no changes written to the database."
                )
            )
            self.stdout.write(
                f"Would execute {total_writes} write operation(s).\n"
            )
            for action_type, row_num, company, _detail in actions:
                self.stdout.write(
                    f"  [{action_type:<12}] Row {row_num:>4}: {company[:55]!r}"
                )
            return

        if total_writes == 0:
            self.stdout.write(
                self.style.SUCCESS("\nDatabase is already up to date. No writes needed.")
            )
            return

        # ── Live write (atomic transaction) ───────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\nApplying changes..."))
        written = {"update": 0, "new_opp": 0, "new_company": 0}

        try:
            with transaction.atomic():
                for action_type, _row_num, company_name, detail in actions:
                    if action_type == "UPDATE":
                        co = existing_companies[_normalize(company_name)]
                        co.website = detail["website"][:255]
                        co.save(update_fields=["website", "updated_at"])
                        written["update"] += 1

                    elif action_type == "NEW_OPP":
                        PlacementOpportunity.objects.create(
                            company=detail["company"],
                            batch=detail["batch"][:50],
                            designation=detail["designation"][:500],
                            tech_nontech=detail["tech_nontech"][:20],
                            placement_internship=detail["placement_internship"][:20],
                            eligibility_criteria=detail["eligibility_criteria"],
                            eligible_departments=detail["eligible_departments"],
                            department_flags=detail["department_flags"],
                            job_profiles=detail["job_profiles"],
                            skills=detail["skills"],
                            emolument_raw=detail["emolument_raw"],
                            selection_process=detail["selection_process"],
                            number_of_offers=detail["number_of_offers"],
                        )
                        written["new_opp"] += 1

                    elif action_type == "NEW_COMPANY":
                        new_co = Company.objects.create(
                            name=company_name[:255],
                            website=(detail.get("website") or "")[:255],
                        )
                        existing_companies[_normalize(company_name)] = new_co
                        PlacementOpportunity.objects.create(
                            company=new_co,
                            batch=detail["batch"][:50],
                            designation=detail["designation"][:500],
                            tech_nontech=detail["tech_nontech"][:20],
                            placement_internship=detail["placement_internship"][:20],
                            eligibility_criteria=detail["eligibility_criteria"],
                            eligible_departments=detail["eligible_departments"],
                            department_flags=detail["department_flags"],
                            job_profiles=detail["job_profiles"],
                            skills=detail["skills"],
                            emolument_raw=detail["emolument_raw"],
                            selection_process=detail["selection_process"],
                            number_of_offers=detail["number_of_offers"],
                        )
                        written["new_company"] += 1

        except Exception as exc:
            raise CommandError(
                f"Database write failed (transaction rolled back): {exc}"
            ) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSync complete: "
                f"{written['update']} website update(s), "
                f"{written['new_opp']} new opportunity record(s), "
                f"{written['new_company']} new company record(s)."
            )
        )
