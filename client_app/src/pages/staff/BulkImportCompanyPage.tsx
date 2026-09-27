import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  ArrowRight,
  ArrowLeft,
  Pencil,
  Eye,
  RefreshCw,
  Building2,
  History,
  X,
  FileText,
  ShieldCheck,
  Check,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SERVER_URL } from "@/constant";

// --- Types ---
type ImportSession = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  duplicate_rows: number;
  error_rows: number;
  processed_rows: number;
  column_mapping: Record<string, string>;
  duplicate_policy: string;
  summary: Record<string, any>;
  created_at: string;
  expires_at: string;
  completed_at?: string;
};

type ImportedRow = {
  id: number;
  row_number: number;
  source_sr_no: string;
  raw_data: Record<string, any>;
  normalized_data: {
    company_name?: string;
    batch?: string;
    batch_raw?: string;
    designation?: string;
    eligibility_criteria?: string;
    department_flags?: Record<string, boolean>;
    eligible_departments?: string[];
    eligible_department_text?: string;
    tech_nontech?: string;
    placement_internship?: string;
    job_profiles?: string[];
    skills?: string[];
    emolument_value?: number | null;
    emolument_unit?: string;
    emolument_raw?: string;
    selection_process?: string;
    website?: string;
    number_of_offers?: number | null;
  };
  status: "VALID" | "WARNING" | "DUPLICATE" | "ERROR";
  validation_messages: Array<{
    field: string;
    code: string;
    message: string;
    severity: "error" | "warning" | "info";
    value: any;
  }>;
  duplicate_info: {
    is_duplicate?: boolean;
    type?: string;
    similarity?: number;
    existing_match?: string;
    message?: string;
  };
  is_selected: boolean;
};

const BulkImportCompanyPage: React.FC = () => {
  const navigate = useNavigate();

  // Wizard state: 1 = Upload, 2 = Mapping, 3 = Preview, 4 = Confirmation, 5 = Complete
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session state
  const [session, setSession] = useState<ImportSession | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Preview state
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  // Row Details & Edit Modals
  const [activeDetailRow, setActiveDetailRow] = useState<ImportedRow | null>(null);
  const [activeEditRow, setActiveEditRow] = useState<ImportedRow | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Confirmation state
  const [duplicatePolicy, setDuplicatePolicy] = useState<string>("skip");
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [confirmResult, setConfirmResult] = useState<any>(null);

  // History state
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<ImportSession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // 1. Download official template
  const handleDownloadTemplate = () => {
    window.open(`${SERVER_URL}/api/staff/bulk-import/template/`, "_blank");
  };

  // 2. Handle File Upload
  const handleFileUpload = async (uploadedFile: File) => {
    setSelectedFile(uploadedFile);
    setUploadError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", uploadedFile);

    try {
      const res = await apiFetch("/api/staff/bulk-import/upload/", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "File upload and validation failed.");
      }

      setSession(data.session);
      setDetectedHeaders(data.detected_headers || []);
      setColumnMapping(data.column_mapping || {});
      setCurrentStep(2); // Move to Column Mapping
    } catch (err: any) {
      setUploadError(err.message || "Failed to process file.");
    } finally {
      setIsUploading(false);
    }
  };

  // 3. Fetch Preview Rows
  const fetchPreviewRows = async (page: number = 1, filter: string = statusFilter, query: string = searchQuery) => {
    if (!session) return;
    setIsLoadingPreview(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "25",
        status: filter,
      });
      if (query.trim()) {
        params.append("search", query.trim());
      }

      const res = await apiFetch(`/api/staff/bulk-import/session/${session.id}/preview/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load preview rows.");
      const data = await res.json();

      setRows(data.rows || []);
      setTotalPages(data.total_pages || 1);
      setCurrentPage(data.current_page || 1);
      setTotalItems(data.total_items || 0);

      // Update counters in session if provided
      if (data.counts && session) {
        setSession({
          ...session,
          total_rows: data.counts.total,
          valid_rows: data.counts.valid,
          warning_rows: data.counts.warning,
          duplicate_rows: data.counts.duplicate,
          error_rows: data.counts.error,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (currentStep === 3 && session) {
      fetchPreviewRows(1, statusFilter, searchQuery);
    }
  }, [currentStep, statusFilter]);

  // 4. Handle Inline Edit Save
  const handleSaveRowEdit = async () => {
    if (!session || !activeEditRow) return;
    setIsSavingEdit(true);

    try {
      const res = await apiFetch(`/api/staff/bulk-import/session/${session.id}/row/${activeEditRow.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: editFormData }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update row.");
      }

      const data = await res.json();
      // Update local row
      setRows((prev) => prev.map((r) => (r.id === activeEditRow.id ? data.row : r)));
      if (data.session_counts && session) {
        setSession({
          ...session,
          valid_rows: data.session_counts.valid,
          warning_rows: data.session_counts.warning,
          duplicate_rows: data.session_counts.duplicate,
          error_rows: data.session_counts.error,
        });
      }
      setActiveEditRow(null);
    } catch (err: any) {
      alert(err.message || "Failed to save correction.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 5. Handle Final Confirmation
  const handleConfirmImport = async () => {
    if (!session) return;
    setIsConfirming(true);

    try {
      const res = await apiFetch(`/api/staff/bulk-import/session/${session.id}/confirm/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duplicate_policy: duplicatePolicy,
          async_mode: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Confirmation failed.");
      }

      setConfirmResult(data.summary || {});
      setCurrentStep(5); // Complete
    } catch (err: any) {
      alert(err.message || "Failed to commit import.");
    } finally {
      setIsConfirming(false);
    }
  };

  // 6. Handle Session Cancel
  const handleCancelSession = async () => {
    if (!session) return;
    if (!confirm("Are you sure you want to cancel this import session? Staging data will be deleted.")) return;

    try {
      await apiFetch(`/api/staff/bulk-import/session/${session.id}/cancel/`, { method: "POST" });
      setSession(null);
      setSelectedFile(null);
      setCurrentStep(1);
    } catch (err) {
      console.error(err);
    }
  };

  // 7. Load Import History
  const fetchImportHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await apiFetch("/api/staff/bulk-import/history/");
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header & Institutional Breadcrumb */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
              <span>TCET Training & Placement Cell</span>
              <span>•</span>
              <span>Admin Database Management</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="text-blue-700" size={28} />
              Bulk Import Company Data
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Import 500–1000+ company and placement records at once. Upload Excel or CSV files and review before importing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setShowHistory(true);
                fetchImportHistory();
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300"
            >
              <History size={16} />
              Import History
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition-colors"
            >
              <Download size={16} />
              Download Excel Template
            </button>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto relative">
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />
            
            {[
              { num: 1, label: "Upload File" },
              { num: 2, label: "Column Mapping" },
              { num: 3, label: "Data Preview" },
              { num: 4, label: "Confirmation" },
              { num: 5, label: "Complete" },
            ].map((step) => {
              const isPast = currentStep > step.num;
              const isCurrent = currentStep === step.num;
              return (
                <div key={step.num} className="flex flex-col items-center relative z-10 bg-white px-2">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                      isPast
                        ? "bg-emerald-600 text-white"
                        : isCurrent
                        ? "bg-blue-700 text-white ring-4 ring-blue-100"
                        : "bg-slate-100 text-slate-400 border border-slate-300"
                    }`}
                  >
                    {isPast ? <Check size={18} /> : step.num}
                  </div>
                  <span
                    className={`text-xs mt-1.5 font-medium ${
                      isCurrent ? "text-blue-900 font-semibold" : isPast ? "text-slate-700" : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STEP 1: UPLOAD FILE */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-center">
                <FileSpreadsheet className="mx-auto h-12 w-12 text-blue-600" />
                <h3 className="mt-2 text-lg font-semibold text-slate-900">Upload Spreadsheet</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Select your completed 36-column Excel (.xlsx, .xls) or CSV file.
                </p>
              </div>

              {uploadError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-800 text-sm">
                  <AlertCircle className="shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="font-semibold">Upload Failed: </span>
                    {uploadError}
                  </div>
                </div>
              )}

              {/* Drag & Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isUploading
                    ? "border-blue-300 bg-blue-50/50 cursor-wait"
                    : "border-slate-300 hover:border-blue-500 hover:bg-slate-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />

                <div className="flex flex-col items-center">
                  <Upload className={`h-10 w-10 ${isUploading ? "text-blue-500 animate-bounce" : "text-slate-400"}`} />
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    {isUploading ? "Inspecting & validating file..." : "Click to select a file or drag and drop here"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Supports .xlsx, .xls, and .csv (up to 15MB)</p>
                </div>
              </div>

              {/* Selected File Indicator */}
              {selectedFile && !isUploading && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                  <FileText size={15} className="shrink-0" />
                  <span className="font-medium truncate">{selectedFile.name}</span>
                  <span className="ml-auto text-xs text-emerald-600 shrink-0">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}

              {/* Security & Feature Notice */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 space-y-2">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  Zero Database Write Guarantee
                </div>
                <p>
                  Uploading your file creates a temporary staging session only. No company or placement opportunity records
                  will be written to the database until you review the validation report and confirm the import.
                </p>
                <div className="flex items-center gap-4 text-slate-500 pt-1">
                  <span>• Required: Name, Batch, Designation</span>
                  <span>• 11 Department Flags</span>
                  <span>• Automatic Duplicate Detection</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: COLUMN MAPPING */}
        {/* ========================================================================= */}
        {currentStep === 2 && session && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Step 2: Verify Column Mapping</h3>
                <p className="text-sm text-slate-500">
                  Detected {detectedHeaders.length} columns from {session.file_name}. Confirm required fields are mapped.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCancelSession}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition-colors"
                >
                  Proceed to Preview
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Session Stats Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500 font-medium">Total Rows Parsed</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{session.total_rows}</div>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                <div className="text-xs text-emerald-700 font-medium">Valid Records</div>
                <div className="text-2xl font-bold text-emerald-800 mt-1">{session.valid_rows}</div>
              </div>
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <div className="text-xs text-amber-700 font-medium">Warnings / Duplicates</div>
                <div className="text-2xl font-bold text-amber-800 mt-1">
                  {session.warning_rows + session.duplicate_rows}
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="text-xs text-red-700 font-medium">Errors (Action Required)</div>
                <div className="text-2xl font-bold text-red-800 mt-1">{session.error_rows}</div>
              </div>
            </div>

            {/* Mappings Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Uploaded File Header</th>
                    <th className="py-3 px-4">Mapped Canonical Field</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {detectedHeaders.map((header) => {
                    const mappedField = columnMapping[header] || header;
                    const isRequired = ["Name of the Company", "Batch", "Designation"].includes(mappedField);
                    return (
                      <tr key={header} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-medium text-slate-900">{header}</td>
                        <td className="py-2.5 px-4 text-blue-700 font-semibold">{mappedField}</td>
                        <td className="py-2.5 px-4">
                          {isRequired ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Required Field
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              Optional Field
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: PREVIEW & INLINE CORRECTION */}
        {/* ========================================================================= */}
        {currentStep === 3 && session && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Step 3: Staging Data Review</h3>
                <p className="text-sm text-slate-500">
                  Review validated records before database commitment. You can filter, search, and inline-edit errors.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  disabled={session.error_rows > 0}
                  className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg shadow-sm transition-colors ${
                    session.error_rows > 0
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800 text-white"
                  }`}
                >
                  Proceed to Confirmation
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Metrics Pills / Filter Tabs */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { key: "all", label: `All Records (${session.total_rows})`, color: "bg-slate-100 text-slate-700" },
                { key: "VALID", label: `Valid (${session.valid_rows})`, color: "bg-emerald-100 text-emerald-800" },
                { key: "WARNING", label: `Warnings (${session.warning_rows})`, color: "bg-amber-100 text-amber-800" },
                { key: "DUPLICATE", label: `Duplicates (${session.duplicate_rows})`, color: "bg-purple-100 text-purple-800" },
                { key: "ERROR", label: `Errors (${session.error_rows})`, color: "bg-red-100 text-red-800 font-bold" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setStatusFilter(tab.key);
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === tab.key
                      ? "ring-2 ring-blue-600 shadow-sm font-semibold " + tab.color
                      : "opacity-75 hover:opacity-100 " + tab.color
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  fetchPreviewRows(1, statusFilter, e.target.value);
                }}
                placeholder="Search by company or role..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Staging Data Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-sm text-slate-700 border-collapse">
                  <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3 w-16">Row #</th>
                      <th className="py-3 px-3">Company Name</th>
                      <th className="py-3 px-3">Batch</th>
                      <th className="py-3 px-3">Designation</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3">CTC</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isLoadingPreview ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <RefreshCw className="animate-spin inline-block mr-2" size={18} />
                          Loading preview rows...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          No rows match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => {
                        const norm = row.normalized_data || {};
                        const statusColors = {
                          VALID: "bg-emerald-100 text-emerald-800 border-emerald-200",
                          WARNING: "bg-amber-100 text-amber-800 border-amber-200",
                          DUPLICATE: "bg-purple-100 text-purple-800 border-purple-200",
                          ERROR: "bg-red-100 text-red-800 border-red-200",
                        };

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-xs text-slate-500">
                              {row.row_number}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {norm.company_name || <span className="text-red-500 italic">Missing</span>}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs text-slate-600">
                              {norm.batch || norm.batch_raw || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-slate-800">
                              {norm.designation || <span className="text-red-500 italic">Missing</span>}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">
                              {norm.placement_internship || "Placement"}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-700">
                              {norm.emolument_raw || (norm.emolument_value ? `${norm.emolument_value} ${norm.emolument_unit}` : "-")}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                                  statusColors[row.status]
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right space-x-1">
                              <button
                                onClick={() => setActiveDetailRow(row)}
                                title="View All 36 Fields"
                                className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  setActiveEditRow(row);
                                  setEditFormData({
                                    "Name of the Company": norm.company_name || "",
                                    Batch: norm.batch_raw || norm.batch || "",
                                    Designation: norm.designation || "",
                                    "Eligibility Criteria": norm.eligibility_criteria || "",
                                    "Emolument (CTC)": norm.emolument_raw || "",
                                    "Company Website": norm.website || "",
                                    "Placement / Internship": norm.placement_internship || "",
                                  });
                                }}
                                title="Inline Edit"
                                className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded"
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-t border-slate-200 text-xs text-slate-600">
                <div>
                  Showing Page <span className="font-semibold">{currentPage}</span> of{" "}
                  <span className="font-semibold">{totalPages}</span> ({totalItems} items)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => {
                      const p = currentPage - 1;
                      setCurrentPage(p);
                      fetchPreviewRows(p);
                    }}
                    className="px-3 py-1.5 rounded bg-white border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => {
                      const p = currentPage + 1;
                      setCurrentPage(p);
                      fetchPreviewRows(p);
                    }}
                    className="px-3 py-1.5 rounded bg-white border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: DUPLICATE POLICY & FINAL CONFIRMATION */}
        {/* ========================================================================= */}
        {currentStep === 4 && session && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6 max-w-3xl mx-auto">
            <div className="border-b border-slate-200 pb-4">
              <h3 className="text-xl font-bold text-slate-900">Step 4: Import Confirmation & Policy</h3>
              <p className="text-sm text-slate-500 mt-1">
                Configure duplicate handling and confirm safe transactional write to the database.
              </p>
            </div>

            {/* Summary Cards */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
              <div className="text-sm font-semibold text-slate-900">Import Verification Summary</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">Total Valid Rows</div>
                  <div className="text-xl font-bold text-emerald-700">{session.valid_rows}</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">With Warnings</div>
                  <div className="text-xl font-bold text-amber-700">{session.warning_rows}</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">Duplicates Detected</div>
                  <div className="text-xl font-bold text-purple-700">{session.duplicate_rows}</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">Errors</div>
                  <div className="text-xl font-bold text-red-700">{session.error_rows}</div>
                </div>
              </div>
            </div>

            {/* Duplicate Policy Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-900">
                Duplicate Handling Policy
              </label>
              <div className="space-y-2">
                {[
                  {
                    value: "skip",
                    title: "Skip Duplicates (Recommended)",
                    desc: "Existing company opportunities matching same batch and designation will not be overwritten.",
                  },
                  {
                    value: "update",
                    title: "Update Existing Records",
                    desc: "Safely update non-critical opportunity details (CTC, skills, criteria) without altering audit logs or applicant data.",
                  },
                  {
                    value: "keep_separate",
                    title: "Keep Separate",
                    desc: "Insert all rows as new records even if matching company and batch exist.",
                  },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                      duplicatePolicy === opt.value
                        ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="duplicate_policy"
                      value={opt.value}
                      checked={duplicatePolicy === opt.value}
                      onChange={(e) => setDuplicatePolicy(e.target.value)}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{opt.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Security Guarantee Notice */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="shrink-0 mt-0.5 text-emerald-600" size={16} />
              <div>
                <strong>Atomic Persistence Guarantee: </strong>
                All records will be committed inside an atomic database transaction. If any critical database error occurs,
                the entire batch will be rolled back safely with no partial writes.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300"
              >
                Back to Preview
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isConfirming}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isConfirming ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} />
                    Processing Import...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    Confirm & Commit Import
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 5: IMPORT COMPLETE & REPORT */}
        {/* ========================================================================= */}
        {currentStep === 5 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-2xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 className="text-2xl font-bold text-slate-900">Import Completed Successfully!</h3>
              <p className="text-sm text-slate-500 mt-1">
                The company and placement opportunity records have been safely written to the database.
              </p>
            </div>

            {confirmResult && (
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-left space-y-2 text-sm">
                <div className="font-semibold text-slate-900 border-b border-slate-200 pb-2">
                  Import Execution Report
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">New Companies Created:</span>
                  <span className="font-bold text-slate-900">{confirmResult.created_companies || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">New Opportunities Created:</span>
                  <span className="font-bold text-slate-900">{confirmResult.created_opportunities || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Updated Records:</span>
                  <span className="font-bold text-slate-900">
                    {(confirmResult.updated_companies || 0) + (confirmResult.updated_opportunities || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Skipped Records:</span>
                  <span className="font-bold text-slate-900">{confirmResult.skipped_count || 0}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => navigate("/staff/placement_companies")}
                className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition-colors"
              >
                View Company Directory
              </button>
              <button
                onClick={() => {
                  setSession(null);
                  setSelectedFile(null);
                  setConfirmResult(null);
                  setCurrentStep(1);
                }}
                className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300"
              >
                Import Another File
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROW DETAIL DRAWER (36 Canonical Fields Grouped Logically) */}
        {/* ========================================================================= */}
        {activeDetailRow && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
            <div className="w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="text-blue-700" size={20} />
                  <h3 className="text-lg font-bold text-slate-900">
                    Row {activeDetailRow.row_number}: {activeDetailRow.normalized_data.company_name}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveDetailRow(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Validation Alerts */}
              {activeDetailRow.validation_messages.length > 0 && (
                <div className="space-y-2">
                  {activeDetailRow.validation_messages.map((m, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                        m.severity === "error"
                          ? "bg-red-50 text-red-800 border-red-200"
                          : m.severity === "warning"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-blue-50 text-blue-800 border-blue-200"
                      }`}
                    >
                      {m.severity === "error" ? (
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      )}
                      <div>
                        <strong>{m.field}: </strong>
                        {m.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Group 1: Basic Information */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                  1. Basic Information
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Company Name:</span>
                    <p className="font-semibold text-slate-900">{activeDetailRow.normalized_data.company_name}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Batch:</span>
                    <p className="font-semibold text-slate-900">{activeDetailRow.normalized_data.batch}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Designation / Role:</span>
                    <p className="font-semibold text-slate-900">{activeDetailRow.normalized_data.designation}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Category / Type:</span>
                    <p className="font-semibold text-slate-900">{activeDetailRow.normalized_data.placement_internship}</p>
                  </div>
                </div>
              </div>

              {/* Group 2: Eligibility & Department Flags */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                  2. Eligibility & Department Coverage
                </h4>
                <div className="text-xs space-y-2">
                  <div>
                    <span className="text-slate-500">Eligibility Criteria:</span>
                    <p className="font-medium text-slate-800 bg-slate-50 p-2 rounded border border-slate-200">
                      {activeDetailRow.normalized_data.eligibility_criteria || "None specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Eligible Department Description:</span>
                    <p className="font-medium text-slate-800">{activeDetailRow.normalized_data.eligible_department_text || "All"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Branch Flags (11 Columns):</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {activeDetailRow.normalized_data.department_flags &&
                        Object.entries(activeDetailRow.normalized_data.department_flags).map(([dept, isChecked]) => (
                          <span
                            key={dept}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isChecked
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {dept}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 3: Compensation & Profiles */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                  3. Compensation & Profiles
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Emolument (CTC Raw):</span>
                    <p className="font-semibold text-slate-900">{activeDetailRow.normalized_data.emolument_raw || "-"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Parsed Value & Unit:</span>
                    <p className="font-semibold text-blue-700">
                      {activeDetailRow.normalized_data.emolument_value
                        ? `${activeDetailRow.normalized_data.emolument_value} (${activeDetailRow.normalized_data.emolument_unit})`
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Tech / Non-Tech:</span>
                    <p className="font-semibold text-slate-900">{activeDetailRow.normalized_data.tech_nontech}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Number of Offers:</span>
                    <p className="font-semibold text-slate-900">{activeDetailRow.normalized_data.number_of_offers ?? "N/A"}</p>
                  </div>
                </div>

                {activeDetailRow.normalized_data.job_profiles && activeDetailRow.normalized_data.job_profiles.length > 0 && (
                  <div className="text-xs pt-1">
                    <span className="text-slate-500">Job Profiles (1-5):</span>
                    <ul className="list-disc list-inside mt-0.5 text-slate-800">
                      {activeDetailRow.normalized_data.job_profiles.map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Group 4: Skills & Selection Process */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                  4. Skills & Process
                </h4>
                <div className="text-xs space-y-2">
                  <div>
                    <span className="text-slate-500">Skillset Required (1-8):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeDetailRow.normalized_data.skills && activeDetailRow.normalized_data.skills.length > 0 ? (
                        activeDetailRow.normalized_data.skills.map((s, idx) => (
                          <span key={idx} className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic">None specified</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Selection Process:</span>
                    <p className="font-medium text-slate-800">{activeDetailRow.normalized_data.selection_process || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Company Website:</span>
                    <p className="font-medium text-blue-700">
                      {activeDetailRow.normalized_data.website ? (
                        <a href={activeDetailRow.normalized_data.website} target="_blank" rel="noreferrer" className="underline">
                          {activeDetailRow.normalized_data.website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={() => setActiveDetailRow(null)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg"
                >
                  Close Drawer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* INLINE EDIT MODAL */}
        {/* ========================================================================= */}
        {activeEditRow && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-bold text-slate-900">
                  Edit Row #{activeEditRow.row_number}
                </h3>
                <button onClick={() => setActiveEditRow(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    value={editFormData["Name of the Company"] || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, "Name of the Company": e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Year *</label>
                    <input
                      type="text"
                      value={editFormData["Batch"] || ""}
                      onChange={(e) => setEditFormData({ ...editFormData, Batch: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Designation *</label>
                    <input
                      type="text"
                      value={editFormData["Designation"] || ""}
                      onChange={(e) => setEditFormData({ ...editFormData, Designation: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Emolument (CTC)</label>
                  <input
                    type="text"
                    value={editFormData["Emolument (CTC)"] || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, "Emolument (CTC)": e.target.value })}
                    placeholder="e.g. 7.5 LPA or ₹25,000/month"
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Eligibility Criteria</label>
                  <textarea
                    rows={2}
                    value={editFormData["Eligibility Criteria"] || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, "Eligibility Criteria": e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Website URL</label>
                  <input
                    type="text"
                    value={editFormData["Company Website"] || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, "Company Website": e.target.value })}
                    placeholder="https://www.company.com"
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  onClick={() => setActiveEditRow(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRowEdit}
                  disabled={isSavingEdit}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                >
                  {isSavingEdit ? "Saving..." : "Save & Revalidate"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* IMPORT HISTORY DRAWER */}
        {/* ========================================================================= */}
        {showHistory && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
            <div className="w-full max-w-3xl bg-white h-full shadow-2xl overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <History className="text-blue-700" size={20} />
                  <h3 className="text-lg font-bold text-slate-900">Bulk Import History</h3>
                </div>
                <button onClick={() => setShowHistory(false)} className="p-1 text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>

              {isLoadingHistory ? (
                <div className="py-12 text-center text-slate-500">
                  <RefreshCw className="animate-spin inline-block mr-2" size={18} />
                  Loading history...
                </div>
              ) : historyList.length === 0 ? (
                <div className="py-12 text-center text-slate-500">No past imports found.</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 uppercase font-semibold text-slate-600 border-b">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">File Name</th>
                        <th className="py-2.5 px-3">Total Rows</th>
                        <th className="py-2.5 px-3">Created</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {historyList.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-500 font-mono">
                            {new Date(h.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{h.file_name}</td>
                          <td className="py-2.5 px-3">{h.total_rows}</td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-700">
                            {h.summary?.created_opportunities ?? h.processed_rows ?? 0}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                h.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : h.status === "CANCELLED"
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {h.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default BulkImportCompanyPage;
