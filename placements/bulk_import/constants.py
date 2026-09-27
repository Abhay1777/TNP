"""Constants and canonical schemas for the 36-column Bulk Company Import."""

# The exact 36 supported columns in official order
CANONICAL_COLUMNS = [
    "Sr. No.",
    "Batch",
    "Name of the Company",
    "Eligibility Criteria",
    "AI&DS",
    "AI&ML",
    "CIVIL",
    "COMP",
    "CSE",
    "E&CS",
    "E&TC",
    "IOT",
    "IT",
    "MME",
    "MECH",
    "Designation",
    "Tech / Non-Tech",
    "Job Profile 1",
    "Job Profile 2",
    "Job Profile 3",
    "Job Profile 4",
    "Job Profile 5",
    "Skillset Required 1",
    "Skillset Required 2",
    "Skillset Required 3",
    "Skillset Required 4",
    "Skillset Required 5",
    "Skillset Required 6",
    "Skillset Required 7",
    "Skillset Required 8",
    "Emolument (CTC)",
    "Selection Process",
    "Company Website",
    "Placement / Internship",
    "Eligible Department",
    "No Of Offers",
]

# The 11 departmental flags
DEPARTMENT_COLUMNS = [
    "AI&DS",
    "AI&ML",
    "CIVIL",
    "COMP",
    "CSE",
    "E&CS",
    "E&TC",
    "IOT",
    "IT",
    "MME",
    "MECH",
]

# Columns strictly required for row validity
REQUIRED_COLUMNS = [
    "Name of the Company",
    "Batch",
    "Designation",
]

# Controlled normalization choices
TECH_CHOICES = {
    "tech": "Tech",
    "technical": "Tech",
    "tech job": "Tech",
    "it": "Tech",
    "non-tech": "Non-Tech",
    "non tech": "Non-Tech",
    "non-technical": "Non-Tech",
    "nontechnical": "Non-Tech",
    "business": "Non-Tech",
    "both": "Both",
    "tech & non-tech": "Both",
    "hybrid": "Both",
}

PLACEMENT_INTERNSHIP_CHOICES = {
    # ── Standard values ──────────────────────────────────────────────────────
    "placement": "Placement",
    "full-time": "Placement",
    "full time": "Placement",
    "job": "Placement",
    "off-campus": "Placement",
    "off campus": "Placement",
    # ── Internship ────────────────────────────────────────────────────────────
    "internship": "Internship",
    "intern": "Internship",
    "summer internship": "Internship",
    "ojt": "Internship",
    "on-job training": "Internship",
    "on job training": "Internship",
    # ── TCET-specific AEDP / PLI terms ───────────────────────────────────────
    # AEDP = Associate Engineer Development Programme (Placement track)
    "aedp": "Placement",
    "aedp placement": "Placement",
    "aedp & placement": "Placement",
    "aedp &placement": "Placement",
    "aedp cum placement": "Placement",
    "aedp and placement": "Placement",
    # PLI = Pre-placement Internship → leads to Placement offer
    "pli": "Placement",
    "pre-placement internship": "Placement",
    "placement via internship": "Placement",
    # AEDP Cum PLI = both tracks, treat as Both
    "aedp cum pli": "Both",
    "aedp & pli": "Both",
    "aedp &pli": "Both",
    "aedp and pli": "Both",
    # AEDP Cum Internship
    "aedp cum internship": "Internship",
    "aedp cum intern": "Internship",
    # Combined placement + internship
    "placement & internship": "Both",
    "placement and internship": "Both",
    "placement + internship": "Both",
    "internship & placement": "Both",
    "internship cum placement": "Both",
    "internship and placement": "Both",
    "both": "Both",
    "placement/internship": "Both",
    "internship/placement": "Both",
    # International / Pooled / Special
    "international placement": "Placement",
    "off campus placement": "Placement",
    "off-campus placement": "Placement",
    "pooled campus": "Placement",
    "pooled campus placement": "Placement",
    "pli cum placement": "Placement",
    "pli and international placement": "Placement",
    "pli & international placement": "Placement",
    "pli cum international placement": "Placement",
    # Webinar / info session (not a real placement type, normalize to Placement)
    "webinar": "Placement",
    "seminar": "Placement",
}

# Upload security constraints
MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_ROWS = 5000
MAX_CELL_LENGTH = 10000
SESSION_EXPIRATION_HOURS = 4

# Duplicate policies
DUPLICATE_POLICIES = ["skip", "update", "keep_separate"]
FUZZY_MATCH_THRESHOLD = 0.85
