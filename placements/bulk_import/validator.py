"""Row-level normalization, validation, and duplicate detection engine."""

import difflib
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from placements.bulk_import.constants import (
    CANONICAL_COLUMNS,
    DEPARTMENT_COLUMNS,
    FUZZY_MATCH_THRESHOLD,
    PLACEMENT_INTERNSHIP_CHOICES,
    REQUIRED_COLUMNS,
    TECH_CHOICES,
)
from placements.models import Company, CompanyRegistration, PlacementOpportunity


def parse_boolean_flag(val: Any) -> bool:
    """Normalize various truthy values into standard boolean."""
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val != 0
    s = str(val).strip().lower()
    return s in ("yes", "y", "1", "true", "checked", "✔", "applicable", "ok", "t")


def normalize_batch(batch_str: Any) -> Tuple[str, str]:
    """Normalize batch representation while retaining raw value.

    Handles formats like:
      - '2026'            → '2026'
      - '2025/2026'       → '2026'  (take the graduating / end year)
      - 'BE_2026'         → '2026'
      - '2025-26'         → '2026'  (expand short year suffix)

    Returns (batch_normalized, batch_raw).
    """
    if batch_str is None:
        return "", ""
    raw = str(batch_str).strip()

    # Find ALL 4-digit years in the string; pick the last (graduating year)
    years = re.findall(r"\b(20\d{2})\b", raw)
    if years:
        normalized = years[-1]  # last year = graduating batch
        return normalized, raw

    # Handle short suffix formats like '2025-26' or '25-26'
    short_match = re.search(r"\b20(\d{2})[-/](\d{2})\b", raw)
    if short_match:
        normalized = "20" + short_match.group(2)
        return normalized, raw

    # Fall back to raw value if no year pattern found
    return raw, raw


def parse_emolument_ctc(raw_ctc: Any) -> Tuple[Optional[float], str, str]:
    """Parse CTC/emolument into (value, unit, raw_str).

    Examples:
    '7.5 LPA' -> (7.5, 'LPA', '7.5 LPA')
    '₹25,000/month' -> (25000.0, 'MONTHLY_STIPEND', '₹25,000/month')
    '600000' -> (6.0, 'LPA', '600000')
    """
    if raw_ctc is None or str(raw_ctc).strip() == "":
        return None, "", ""
    raw_str = str(raw_ctc).strip()
    clean_str = raw_str.replace(",", "").replace("₹", "").replace("Rs.", "").replace("INR", "").strip()

    # Case 1: Monthly stipend pattern (e.g. /month, pm, stipend)
    if re.search(r"(?:/month|/m|pm|per month|stipend)", clean_str, re.IGNORECASE):
        num_match = re.search(r"(\d+(?:\.\d+)?)", clean_str)
        if num_match:
            try:
                val = float(num_match.group(1))
                return val, "MONTHLY_STIPEND", raw_str
            except ValueError:
                pass

    # Case 2: Explicit LPA pattern (e.g. 7.5 LPA, 7.5L)
    lpa_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|l)\b", clean_str, re.IGNORECASE)
    if lpa_match:
        try:
            val = float(lpa_match.group(1))
            return val, "LPA", raw_str
        except ValueError:
            pass

    # Case 3: Raw numeric rupee amount (e.g. 600000 or 6.5)
    num_match = re.search(r"^(\d+(?:\.\d+)?)$", clean_str)
    if num_match:
        try:
            val = float(num_match.group(1))
            if val >= 100000:
                # Convert raw rupees e.g. 600000 -> 6.0 LPA
                return round(val / 100000.0, 2), "LPA", raw_str
            elif val <= 100:
                # Likely given as direct LPA e.g. 6 or 7.5
                return val, "LPA", raw_str
            else:
                return val, "INR", raw_str
        except ValueError:
            pass

    return None, "OTHER", raw_str


def validate_and_normalize_website(url_str: Any) -> Tuple[str, bool]:
    """Validate URL syntax safely without outbound SSRF. Returns (normalized_url, is_valid)."""
    if not url_str or str(url_str).strip() == "":
        return "", True
    url = str(url_str).strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    # Safe regex validation
    url_pattern = re.compile(
        r"^https?://"
        r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"
        r"localhost|"
        r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
        r"(?::\d+)?"
        r"(?:/?|[/?]\S+)$",
        re.IGNORECASE,
    )
    is_valid = bool(url_pattern.match(url))
    return url, is_valid


def check_department_consistency(flags_dict: Dict[str, bool], eligible_dept_text: str) -> bool:
    """Check consistency between 11 individual flags and the Eligible Department string."""
    if not eligible_dept_text or eligible_dept_text.strip() == "":
        return True
    
    text_upper = eligible_dept_text.upper()
    if "ALL" in text_upper:
        return True

    # Identify branches checked in flags
    flag_checked = {d for d, checked in flags_dict.items() if checked}

    # Identify branches mentioned in text
    text_branches = set()
    for dept in DEPARTMENT_COLUMNS:
        # Standardize matching e.g. AI&DS, AIDS, etc.
        token = dept.replace("&", "")
        if dept in text_upper or token in text_upper:
            text_branches.add(dept)

    if not flag_checked and not text_branches:
        return True

    # If flags were checked and text lists completely different branches
    if flag_checked and text_branches and not (flag_checked & text_branches):
        return False

    return True


class ExistingCompaniesCache:
    """Pre-loaded database cache for high-performance duplicate detection."""

    def __init__(self):
        self.companies: List[Tuple[int, str]] = list(
            Company.objects.values_list("id", "name")
        )
        self.existing_names_lower: Dict[str, int] = {
            name.strip().lower(): cid for cid, name in self.companies
        }
        # Also include legacy CompanyRegistration names
        for cr_id, cr_name in CompanyRegistration.objects.values_list("id", "name"):
            clean = cr_name.strip().lower()
            if clean not in self.existing_names_lower:
                self.existing_names_lower[clean] = -cr_id  # negative for legacy

        # Opportunities: set of (company_name_lower, batch_normalized, designation_lower)
        self.existing_opportunities: Set[Tuple[str, str, str]] = set()
        for cname, batch, desig in PlacementOpportunity.objects.values_list(
            "company__name", "batch", "designation"
        ):
            self.existing_opportunities.add(
                (cname.strip().lower(), batch.strip().lower(), desig.strip().lower())
            )
        for cr_name, cr_batch in CompanyRegistration.objects.values_list("name", "batch"):
            self.existing_opportunities.add(
                (cr_name.strip().lower(), cr_batch.strip().lower(), "")
            )


def validate_row(
    row_num: int,
    raw_data: Dict[str, Any],
    column_mapping: Dict[str, str],
    cache: ExistingCompaniesCache,
    seen_in_batch: Set[Tuple[str, str, str]],
) -> Dict[str, Any]:
    """Validate and normalize a single row according to the 36-column specification."""
    # Map raw columns to canonical fields
    mapped: Dict[str, Any] = {}
    for raw_k, val in raw_data.items():
        canonical_k = column_mapping.get(raw_k, raw_k)
        mapped[canonical_k] = val

    validation_messages = []
    normalized = {}

    # 1. Sr. No. (Reference only, never primary key)
    source_sr_no = str(mapped.get("Sr. No.", "") or "").strip()

    # 2. Company Name (Required)
    raw_company_name = str(mapped.get("Name of the Company", "") or "").strip()
    if not raw_company_name:
        validation_messages.append({
            "field": "Name of the Company",
            "code": "REQUIRED_FIELD_MISSING",
            "message": "Company Name is required.",
            "severity": "error",
            "value": raw_company_name,
        })
    company_name = raw_company_name
    normalized["company_name"] = company_name

    # 3. Batch (Required)
    raw_batch = mapped.get("Batch")
    batch_norm, batch_raw = normalize_batch(raw_batch)
    if not batch_norm:
        validation_messages.append({
            "field": "Batch",
            "code": "REQUIRED_FIELD_MISSING",
            "message": "Batch year is required.",
            "severity": "error",
            "value": str(raw_batch),
        })
    normalized["batch"] = batch_norm
    normalized["batch_raw"] = batch_raw

    # 4. Designation (Required)
    designation = str(mapped.get("Designation", "") or "").strip()
    if not designation:
        validation_messages.append({
            "field": "Designation",
            "code": "REQUIRED_FIELD_MISSING",
            "message": "Designation/Role is required.",
            "severity": "error",
            "value": designation,
        })
    normalized["designation"] = designation[:500]

    # 5. Eligibility Criteria
    eligibility_criteria = str(mapped.get("Eligibility Criteria", "") or "").strip()
    normalized["eligibility_criteria"] = eligibility_criteria

    # 6. Department Flags (11 columns)
    department_flags = {}
    eligible_depts_list = []
    for dept in DEPARTMENT_COLUMNS:
        flag = parse_boolean_flag(mapped.get(dept))
        department_flags[dept] = flag
        if flag:
            eligible_depts_list.append(dept)

    normalized["department_flags"] = department_flags
    normalized["eligible_departments"] = eligible_depts_list

    # 7. Eligible Department consistency check
    raw_eligible_dept = str(mapped.get("Eligible Department", "") or "").strip()
    normalized["eligible_department_text"] = raw_eligible_dept
    if not check_department_consistency(department_flags, raw_eligible_dept):
        validation_messages.append({
            "field": "Eligible Department",
            "code": "DEPT_MISMATCH_WARNING",
            "message": "Eligibility Department Mismatch: The individual branch flags diverge from the Eligible Department text description.",
            "severity": "warning",
            "value": raw_eligible_dept,
        })

    # 8. Tech / Non-Tech
    raw_tech = str(mapped.get("Tech / Non-Tech", "") or "").strip().lower()
    tech_nontech = TECH_CHOICES.get(raw_tech, "Tech" if not raw_tech else "Tech")
    if raw_tech and raw_tech not in TECH_CHOICES:
        validation_messages.append({
            "field": "Tech / Non-Tech",
            "code": "NORMALIZED_WARNING",
            "message": f"Value '{mapped.get('Tech / Non-Tech')}' normalized to '{tech_nontech}'.",
            "severity": "info",
            "value": mapped.get("Tech / Non-Tech"),
        })
    normalized["tech_nontech"] = tech_nontech

    # 9. Placement / Internship
    raw_type_original = str(mapped.get("Placement / Internship", "") or "").strip()
    # Normalize for lookup: lowercase, collapse whitespace, remove extra spaces around /&
    raw_type = re.sub(r"\s+", " ", raw_type_original).strip().lower()
    # Also try stripping spaces around punctuation for variants like "AEDP &Placement"
    raw_type_clean = re.sub(r"\s*([/&])\s*", r" \1 ", raw_type).strip()
    placement_internship = (
        PLACEMENT_INTERNSHIP_CHOICES.get(raw_type)
        or PLACEMENT_INTERNSHIP_CHOICES.get(raw_type_clean)
        or "Placement"
    )
    if raw_type and raw_type not in PLACEMENT_INTERNSHIP_CHOICES and raw_type_clean not in PLACEMENT_INTERNSHIP_CHOICES:
        validation_messages.append({
            "field": "Placement / Internship",
            "code": "NORMALIZED_WARNING",
            "message": f"Value '{raw_type_original}' normalized to '{placement_internship}'.",
            "severity": "info",
            "value": raw_type_original,
        })
    normalized["placement_internship"] = placement_internship

    # 10. Job Profiles 1–5
    job_profiles = []
    for i in range(1, 6):
        p_val = str(mapped.get(f"Job Profile {i}", "") or "").strip()
        if p_val:
            job_profiles.append(p_val)
    normalized["job_profiles"] = job_profiles

    # 11. Skills 1–8
    skills = []
    for i in range(1, 9):
        s_val = str(mapped.get(f"Skillset Required {i}", "") or "").strip()
        if s_val:
            skills.append(s_val)
    normalized["skills"] = skills

    # 12. Emolument / CTC
    ctc_val, ctc_unit, ctc_raw = parse_emolument_ctc(mapped.get("Emolument (CTC)"))
    normalized["emolument_value"] = ctc_val
    normalized["emolument_unit"] = ctc_unit
    normalized["emolument_raw"] = ctc_raw

    # 13. Selection Process
    selection_process = str(mapped.get("Selection Process", "") or "").strip()
    normalized["selection_process"] = selection_process

    # 14. Company Website
    raw_website = mapped.get("Company Website")
    clean_website, url_valid = validate_and_normalize_website(raw_website)
    if not url_valid and raw_website:
        validation_messages.append({
            "field": "Company Website",
            "code": "INVALID_URL",
            "message": f"'{raw_website}' does not appear to be a valid URL.",
            "severity": "warning",
            "value": raw_website,
        })
    normalized["website"] = clean_website

    # 15. Number of Offers
    raw_offers = mapped.get("No Of Offers")
    num_offers = None
    if raw_offers is not None and str(raw_offers).strip() != "":
        try:
            num_offers = int(float(str(raw_offers).strip()))
            if num_offers < 0:
                validation_messages.append({
                    "field": "No Of Offers",
                    "code": "INVALID_NUMBER",
                    "message": "Number of Offers must be a non-negative number.",
                    "severity": "warning",
                    "value": raw_offers,
                })
                num_offers = None
        except ValueError:
            validation_messages.append({
                "field": "No Of Offers",
                "code": "INVALID_NUMBER",
                "message": f"Could not parse '{raw_offers}' as an integer number of offers.",
                "severity": "warning",
                "value": raw_offers,
            })
    normalized["number_of_offers"] = num_offers

    # 16. DUPLICATE DETECTION
    duplicate_info = {"is_duplicate": False, "type": None}
    comp_clean = company_name.lower().strip()
    opp_key = (comp_clean, batch_norm.lower(), designation.lower())

    if comp_clean:
        # Check opportunity duplicate
        if opp_key in cache.existing_opportunities or opp_key in seen_in_batch:
            duplicate_info = {
                "is_duplicate": True,
                "type": "opportunity",
                "similarity": 100,
                "existing_match": company_name,
                "message": f"Exact opportunity already exists for {company_name} ({designation}, Batch {batch_norm}).",
            }
            validation_messages.append({
                "field": "Designation",
                "code": "DUPLICATE_OPPORTUNITY",
                "message": duplicate_info["message"],
                "severity": "warning",
                "value": designation,
            })
        elif comp_clean in cache.existing_names_lower:
            # Exact company match
            duplicate_info = {
                "is_duplicate": True,
                "type": "company_exact",
                "similarity": 100,
                "existing_match": company_name,
                "message": f"Existing company record found: '{company_name}'.",
            }
        else:
            # Fuzzy match check
            best_ratio = 0.0
            best_match = None
            for existing_name in cache.existing_names_lower.keys():
                ratio = difflib.SequenceMatcher(None, comp_clean, existing_name).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = existing_name

            if best_ratio >= FUZZY_MATCH_THRESHOLD:
                duplicate_info = {
                    "is_duplicate": True,
                    "type": "company_fuzzy",
                    "similarity": round(best_ratio * 100, 1),
                    "existing_match": best_match.title(),
                    "message": f"Possible duplicate company ({round(best_ratio * 100)}% match with '{best_match.title()}').",
                }
                validation_messages.append({
                    "field": "Name of the Company",
                    "code": "FUZZY_DUPLICATE_COMPANY",
                    "message": duplicate_info["message"],
                    "severity": "warning",
                    "value": company_name,
                })

    seen_in_batch.add(opp_key)

    # Determine overall status
    has_errors = any(m["severity"] == "error" for m in validation_messages)
    has_warnings = any(m["severity"] == "warning" for m in validation_messages)

    if has_errors:
        status = "ERROR"
    elif duplicate_info["is_duplicate"]:
        status = "DUPLICATE"
    elif has_warnings:
        status = "WARNING"
    else:
        status = "VALID"

    return {
        "row_number": row_num,
        "source_sr_no": source_sr_no,
        "raw_data": raw_data,
        "normalized_data": normalized,
        "status": status,
        "validation_messages": validation_messages,
        "duplicate_info": duplicate_info,
    }
