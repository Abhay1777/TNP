"""Official 36-column Excel Template Generator for Bulk Company Import."""

import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from placements.bulk_import.constants import CANONICAL_COLUMNS, DEPARTMENT_COLUMNS


def generate_company_import_template() -> io.BytesIO:
    """Generate an official .xlsx workbook containing all 36 canonical headers,

    sample demonstration rows, and styling aligned with TCET institutional guidelines.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Company_Import_Template"

    # Header styling: Navy fill (#1B365D), white bold text, centered
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")
    
    # Department header styling: Royal Blue fill (#2C5282)
    dept_header_fill = PatternFill(start_color="2C5282", end_color="2C5282", fill_type="solid")

    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )

    # 1. Write Header Row
    for col_idx, col_name in enumerate(CANONICAL_COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border

        if col_name in DEPARTMENT_COLUMNS:
            cell.fill = dept_header_fill
        else:
            cell.fill = header_fill

    ws.row_dimensions[1].height = 28

    # 2. Sample Data Rows (Sample demonstration values, not persisted automatically)
    sample_rows = [
        [
            1, "2027", "Tata Consultancy Services", "Min 60% in 10th, 12th & Engg, No Live Backlogs",
            "Yes", "Yes", "No", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "No", "No",
            "Assistant System Engineer", "Tech",
            "Ninja Developer", "Digital Specialist", "Prime Innovator", "", "",
            "Java", "Python", "SQL", "Data Structures", "Cloud Fundamentals", "", "", "",
            "7.5 LPA", "Online Test -> Technical Interview -> HR Round",
            "https://www.tcs.com", "Placement", "COMP, IT, AI&DS, AI&ML, CSE, E&CS, E&TC, IOT", 50,
        ],
        [
            2, "2027", "JPMorgan Chase & Co.", "Min 7.5 CGPA, No active KT",
            "Yes", "Yes", "No", "Yes", "Yes", "No", "No", "No", "Yes", "No", "No",
            "Software Engineer Intern", "Tech",
            "Summer Technology Analyst", "", "", "", "",
            "Algorithms", "Problem Solving", "C++", "Java", "System Design", "", "", "",
            "₹50,000/month", "Coding Assessment -> Superday Interview",
            "https://www.jpmorganchase.com", "Internship", "COMP, IT, AI&DS, AI&ML, CSE", 15,
        ],
        [
            3, "2026", "Deloitte USI", "Min 6.5 CGPA across all semesters",
            "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes",
            "Business Technology Analyst", "Both",
            "Advisory Analyst", "Consulting Analyst", "", "", "",
            "Communication", "Analytics", "SQL", "Excel", "Python", "", "", "",
            "₹6,50,000", "Aptitude -> Group Discussion -> Interview",
            "https://www.deloitte.com", "Placement", "All Departments", 30,
        ],
    ]

    sample_font = Font(name="Calibri", size=10)
    sample_alignment = Alignment(vertical="center")

    for row_idx, row_data in enumerate(sample_rows, start=2):
        ws.row_dimensions[row_idx].height = 20
        for col_idx, value in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = sample_font
            cell.alignment = sample_alignment
            cell.border = thin_border

    # 3. Auto-fit column widths
    for col_idx in range(1, len(CANONICAL_COLUMNS) + 1):
        col_letter = get_column_letter(col_idx)
        header_len = len(CANONICAL_COLUMNS[col_idx - 1])
        ws.column_dimensions[col_letter].width = max(header_len + 4, 12)

    # Specific column width improvements
    ws.column_dimensions["A"].width = 10  # Sr. No.
    ws.column_dimensions["B"].width = 12  # Batch
    ws.column_dimensions["C"].width = 32  # Name of the Company
    ws.column_dimensions["D"].width = 40  # Eligibility Criteria
    ws.column_dimensions["P"].width = 28  # Designation
    ws.column_dimensions["AE"].width = 18 # Emolument (CTC)
    ws.column_dimensions["AF"].width = 38 # Selection Process
    ws.column_dimensions["AG"].width = 28 # Company Website
    ws.column_dimensions["AI"].width = 40 # Eligible Department

    # 4. Instructions worksheet
    instructions_ws = wb.create_sheet(title="Instructions")
    instructions = [
        ("TCET Training & Placement Automation - Bulk Import Guidelines", True),
        ("", False),
        ("1. Required Fields:", True),
        ("   - 'Name of the Company', 'Batch', and 'Designation' must be provided on every row.", False),
        ("2. Department Columns (AI&DS to MECH):", True),
        ("   - Enter 'Yes', 'Y', '1', or 'True' if students from that branch are eligible; otherwise 'No'.", False),
        ("3. Tech / Non-Tech Choices:", True),
        ("   - Allowed values: 'Tech', 'Non-Tech', or 'Both'.", False),
        ("4. Placement / Internship Choices:", True),
        ("   - Allowed values: 'Placement', 'Internship', or 'Both'.", False),
        ("5. Emolument (CTC):", True),
        ("   - Supported formats: '7.5 LPA', '₹6 LPA', '600000', '₹25,000/month', etc.", False),
        ("6. Website:", True),
        ("   - Provide a valid corporate URL, e.g. 'https://www.company.com' or 'www.company.com'.", False),
        ("7. Important Note:", True),
        ("   - Uploading this template will only create a preview session. No records are saved", False),
        ("     to the database until you review the validation report and click Confirm Import.", False),
    ]

    for r_idx, (text, is_bold) in enumerate(instructions, start=1):
        cell = instructions_ws.cell(row=r_idx, column=1, value=text)
        cell.font = Font(name="Calibri", size=11, bold=is_bold, color="1B365D" if is_bold else "000000")

    instructions_ws.column_dimensions["A"].width = 85

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
