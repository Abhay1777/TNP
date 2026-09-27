"""Secure parser for Excel (.xlsx, .xls) and CSV company import files."""

import csv
import io
import re
import zipfile
from typing import Any, Dict, List, Tuple

import openpyxl
import xlrd
from django.core.files.uploadedfile import UploadedFile

from placements.bulk_import.constants import (
    CANONICAL_COLUMNS,
    MAX_CELL_LENGTH,
    MAX_FILE_SIZE_BYTES,
    MAX_ROWS,
)


class FileValidationError(Exception):
    """Raised when file fails structural or security inspection."""
    pass


def sanitize_formula_injection(val: Any) -> Any:
    """Sanitize cells starting with spreadsheet formula execution triggers (=, +, -, @)."""
    if isinstance(val, str):
        val_stripped = val.strip()
        if len(val_stripped) > 0 and val_stripped[0] in ("=", "+", "-", "@"):
            # Prefix with a safe single quote or strip if purely formula
            return "'" + val_stripped
    return val


def detect_file_type_and_verify(file_obj: UploadedFile) -> str:
    """Detect and verify actual file type via magic bytes, rejecting mismatches."""
    file_size = getattr(file_obj, "size", 0)
    if file_size > MAX_FILE_SIZE_BYTES:
        raise FileValidationError(
            f"File size ({file_size / (1024 * 1024):.2f} MB) exceeds maximum allowed {MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f} MB."
        )

    file_obj.seek(0)
    header_bytes = file_obj.read(8)
    file_obj.seek(0)

    filename_lower = file_obj.name.lower() if file_obj.name else ""

    # Magic byte check:
    # XLSX: PK\x03\x04 (standard zip header)
    if header_bytes.startswith(b"PK\x03\x04"):
        if not (filename_lower.endswith(".xlsx") or filename_lower.endswith(".xlsm")):
            raise FileValidationError("File content is a ZIP/XLSX archive but file extension is not .xlsx.")
        return "xlsx"

    # XLS: \xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1 (OLE CFB header)
    if header_bytes.startswith(b"\xd0\xcf\x11\xe0"):
        if not filename_lower.endswith(".xls"):
            raise FileValidationError("File content is an OLE/XLS workbook but file extension is not .xls.")
        return "xls"

    # Otherwise test for CSV
    if filename_lower.endswith(".csv"):
        return "csv"

    raise FileValidationError(
        "Unsupported or unrecognizable file format. Only official .xlsx, .xls, and .csv files are supported."
    )


def verify_zip_safety(file_obj: UploadedFile):
    """Guard against zip-bomb and decompression bomb attacks in XLSX files."""
    file_obj.seek(0)
    try:
        with zipfile.ZipFile(file_obj, "r") as z:
            total_uncompressed = sum(info.file_size for info in z.infolist())
            # If uncompressed size is greater than 100MB or compression ratio > 30x
            compressed_size = getattr(file_obj, "size", 1) or 1
            if total_uncompressed > 100 * 1024 * 1024:
                raise FileValidationError("Decompressed file size exceeds safe limit (100MB).")
            if total_uncompressed / max(compressed_size, 1) > 40:
                raise FileValidationError("Suspicious zip compression ratio detected (potential decompression bomb).")
    except zipfile.BadZipFile:
        raise FileValidationError("Corrupted or malformed XLSX archive.")
    finally:
        file_obj.seek(0)


def auto_map_columns(headers: List[str]) -> Dict[str, str]:
    """Map detected raw headers to canonical column names."""
    canonical_lookup = {
        re.sub(r"[^a-zA-Z0-9&]", "", col).lower(): col for col in CANONICAL_COLUMNS
    }

    mapping = {}
    for raw_header in headers:
        normalized_raw = re.sub(r"[^a-zA-Z0-9&]", "", str(raw_header)).lower()
        if normalized_raw in canonical_lookup:
            mapping[raw_header] = canonical_lookup[normalized_raw]
        else:
            # Common synonyms / fallbacks
            synonyms = {
                "srno": "Sr. No.",
                "sno": "Sr. No.",
                "company": "Name of the Company",
                "companyname": "Name of the Company",
                "eligibility": "Eligibility Criteria",
                "role": "Designation",
                "profile": "Designation",
                "position": "Designation",
                "ctc": "Emolument (CTC)",
                "salary": "Emolument (CTC)",
                "package": "Emolument (CTC)",
                "website": "Company Website",
                "url": "Company Website",
                "type": "Placement / Internship",
                "placementinternship": "Placement / Internship",
                "offers": "No Of Offers",
                "noofoffers": "No Of Offers",
                "branches": "Eligible Department",
                "eligibledepartments": "Eligible Department",
                "process": "Selection Process",
            }
            if normalized_raw in synonyms:
                mapping[raw_header] = synonyms[normalized_raw]
            else:
                mapping[raw_header] = raw_header

    return mapping


def parse_uploaded_file(file_obj: UploadedFile) -> Tuple[List[str], Dict[str, str], List[Dict[str, Any]]]:
    """Parse an uploaded XLSX, XLS, or CSV file and return (headers, column_mapping, raw_rows)."""
    file_type = detect_file_type_and_verify(file_obj)

    raw_rows: List[Dict[str, Any]] = []
    headers: List[str] = []

    if file_type == "xlsx":
        verify_zip_safety(file_obj)
        file_obj.seek(0)
        wb = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
        # Select first visible sheet or active
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        
        # Read header row
        try:
            raw_headers = next(rows_iter)
        except StopIteration:
            raise FileValidationError("The uploaded spreadsheet contains no data or header row.")

        headers = [str(h).strip() if h is not None else f"Column_{i+1}" for i, h in enumerate(raw_headers)]

        row_count = 0
        for row_vals in rows_iter:
            # Check if row is completely empty
            if not any(v is not None and str(v).strip() != "" for v in row_vals):
                continue

            row_count += 1
            if row_count > MAX_ROWS:
                raise FileValidationError(f"Row count exceeds maximum permitted limit of {MAX_ROWS} rows.")

            row_dict = {}
            for col_idx, h in enumerate(headers):
                val = row_vals[col_idx] if col_idx < len(row_vals) else None
                if isinstance(val, str) and len(val) > MAX_CELL_LENGTH:
                    val = val[:MAX_CELL_LENGTH]
                row_dict[h] = sanitize_formula_injection(val)

            raw_rows.append(row_dict)

        wb.close()

    elif file_type == "xls":
        file_obj.seek(0)
        content = file_obj.read()
        try:
            wb = xlrd.open_workbook(file_contents=content)
        except Exception as e:
            raise FileValidationError(f"Could not parse XLS workbook: {str(e)}")

        ws = wb.sheet_by_index(0)
        if ws.nrows < 1:
            raise FileValidationError("The uploaded XLS workbook contains no header row.")

        headers = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]

        row_count = 0
        for r in range(1, ws.nrows):
            row_vals = [ws.cell_value(r, c) for c in range(ws.ncols)]
            if not any(v is not None and str(v).strip() != "" for v in row_vals):
                continue

            row_count += 1
            if row_count > MAX_ROWS:
                raise FileValidationError(f"Row count exceeds maximum permitted limit of {MAX_ROWS} rows.")

            row_dict = {}
            for c, h in enumerate(headers):
                val = row_vals[c]
                if isinstance(val, float) and val.is_integer():
                    val = int(val)
                val_str = str(val)
                if len(val_str) > MAX_CELL_LENGTH:
                    val = val_str[:MAX_CELL_LENGTH]
                row_dict[h] = sanitize_formula_injection(val)

            raw_rows.append(row_dict)

    elif file_type == "csv":
        file_obj.seek(0)
        content_bytes = file_obj.read()
        
        # Encoding detection / fallback
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                text = content_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise FileValidationError("Could not decode CSV text content with standard UTF-8 or Latin-1 encodings.")

        f = io.StringIO(text)
        reader = csv.reader(f)

        try:
            raw_headers = next(reader)
        except StopIteration:
            raise FileValidationError("The uploaded CSV file is empty.")

        headers = [str(h).strip() for h in raw_headers]

        row_count = 0
        for row_vals in reader:
            if not any(v.strip() != "" for v in row_vals):
                continue

            row_count += 1
            if row_count > MAX_ROWS:
                raise FileValidationError(f"Row count exceeds maximum permitted limit of {MAX_ROWS} rows.")

            row_dict = {}
            for col_idx, h in enumerate(headers):
                val = row_vals[col_idx] if col_idx < len(row_vals) else ""
                val_str = str(val)
                if len(val_str) > MAX_CELL_LENGTH:
                    val = val_str[:MAX_CELL_LENGTH]
                row_dict[h] = sanitize_formula_injection(val)

            raw_rows.append(row_dict)

    column_mapping = auto_map_columns(headers)
    return headers, column_mapping, raw_rows
