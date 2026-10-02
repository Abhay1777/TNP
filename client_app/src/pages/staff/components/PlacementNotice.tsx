/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Container,
  TextField,
  Button,
  Typography,
  Grid,
  Paper,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
  Box,
  Chip,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  Save,
  Send,
  Copy,
  History,
  ShieldCheck,
  FolderOpen,
  Printer,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { getCookie } from "../../../utils";
import Notice, { NoticeData, NoticeTableRow } from "../../placement_officer/components/notice";
import toast from "react-hot-toast";
import { useReactToPrint } from "react-to-print";

// Modals & Subcomponents
import OpportunitySearchCard, { OpportunityItem } from "./placement/OpportunitySearchCard";
import NoticeVersionHistoryModal from "./placement/NoticeVersionHistoryModal";
import NoticeAuditLogsModal from "./placement/NoticeAuditLogsModal";
import SavedDraftsModal from "./placement/SavedDraftsModal";

const emptyRow = (): NoticeTableRow => ({ type: "Regular", salary: "", position: "" });

const PlacementNotice: React.FC = () => {
  // --- Selected Opportunity Context ---
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityItem | null>(null);
  const [noticeId, setNoticeId] = useState<number | null>(null);
  const [noticeStatus, setNoticeStatus] = useState<"NEW" | "DRAFT" | "PUBLISHED">("NEW");
  const [versionCount, setVersionCount] = useState<number>(1);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // --- Form State ---
  const [formData, setFormData] = useState({
    srNo: "",
    to: "",
    subject: "",
    date: new Date().toISOString().split("T")[0],
    intro: "",
    about: "",
    eligibility_criteria: "",
    Documents_to_Carry: "1. Updated Resume (2 copies)\n2. College ID Card & Government ID\n3. Marksheets (10th, 12th/Diploma, All semesters)\n4. Passport size photographs (2 copies)",
    Walk_in_interview: "Online Assessment followed by Technical and HR Interviews.",
    Company_registration_Link: "",
    College_registration_Link: "",
    Note: "Students must report on time in formal attire. Late entries will not be permitted.",
    From: "Dr. Zahir Aalam",
    From_designation: "Dean (TP&IL)",
    location: "TCET Campus / Online",
    deadline: "",
    batch: "",
  });

  // Dynamic job-offer rows (Type / CTC / Position)
  const [tableRows, setTableRows] = useState<NoticeTableRow[]>([emptyRow()]);

  // Dynamic Skill Chips
  const [skillInput, setSkillInput] = useState<string>("");
  const [skillTags, setSkillTags] = useState<string[]>([]);

  // Modals state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);

  // Printing & Live Preview Ref
  const contentRef = useRef<HTMLDivElement>(null);
  const reactPrintFn = useReactToPrint({ contentRef });

  // Initial next serial number on mount
  useEffect(() => {
    api
      .get("/api/staff/placement-notices/next-serial-number/")
      .then((res) => {
        if (res.data?.sr_no && !formData.srNo) {
          setFormData((prev) => ({ ...prev, srNo: res.data.sr_no }));
        }
      })
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setIsDirty(true);
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- Table Row Handlers ---
  const handleRowChange = (index: number, field: keyof NoticeTableRow, value: string) => {
    setIsDirty(true);
    const updated = tableRows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setTableRows(updated);
  };

  const addRow = () => {
    setIsDirty(true);
    setTableRows([...tableRows, emptyRow()]);
  };

  const removeRow = (index: number) => {
    if (tableRows.length === 1) return;
    setIsDirty(true);
    setTableRows(tableRows.filter((_, i) => i !== index));
  };

  // --- Skills Handlers ---
  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skillTags.includes(trimmed)) {
      setIsDirty(true);
      setSkillTags([...skillTags, trimmed]);
      setSkillInput("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setIsDirty(true);
    setSkillTags(skillTags.filter((s) => s !== skillToRemove));
  };

  // --- Opportunity Selection Handler ---
  const handleSelectOpportunity = async (opp: OpportunityItem) => {
    if (isDirty && selectedOpportunity && selectedOpportunity.id !== opp.id) {
      if (!window.confirm("Switching opportunity will replace notice draft content. Do you want to continue?")) {
        return;
      }
    }

    setSelectedOpportunity(opp);
    setLoading(true);
    try {
      const res = await api.get(`/api/staff/placement/opportunities/${opp.id}/autofill/`);
      const auto = res.data;

      // Cleanly replace previously auto-filled values without leaking prior company data
      setFormData({
        srNo: auto.sr_no || "",
        date: auto.date || new Date().toISOString().split("T")[0],
        to: auto.to || "",
        subject: auto.subject || "",
        intro: auto.intro || "",
        about: auto.about || "",
        eligibility_criteria: auto.eligibility_criteria || "",
        Documents_to_Carry: auto.documents_to_carry || "1. Updated Resume (2 copies)\n2. College ID Card & Government ID\n3. Marksheets (10th, 12th/Diploma, All semesters)\n4. Passport size photographs (2 copies)",
        Walk_in_interview: auto.walk_in_interview || "Online Assessment followed by Technical and HR Interviews.",
        Company_registration_Link: auto.company_registration_link || opp.company_website || "",
        College_registration_Link: "",
        Note: auto.note || "Students must report on time in formal attire. Late entries will not be permitted.",
        From: auto.from_field || "Dr. Zahir Aalam",
        From_designation: auto.from_designation || "Dean (TP&IL)",
        location: auto.location || "TCET Campus / Online",
        deadline: "",
        batch: auto.batch || opp.batch || "",
      });

      setTableRows(auto.table_data && auto.table_data.length > 0 ? auto.table_data : [emptyRow()]);

      const skills = opp.skills && opp.skills.length > 0
        ? opp.skills
        : auto.skill_required
        ? auto.skill_required.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      setSkillTags(skills);

      setIsDirty(true);
      toast.success(`Auto-filled notice details for ${opp.company_name} (${opp.designation})!`);
    } catch (err) {
      console.error("Autofill failed:", err);
      toast.error("Failed to autofill opportunity details.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearOpportunity = () => {
    setSelectedOpportunity(null);
    setFormData((prev) => ({
      ...prev,
      subject: "",
      intro: "",
      about: "",
      eligibility_criteria: "",
      Company_registration_Link: "",
      batch: "",
    }));
    setTableRows([emptyRow()]);
    setSkillTags([]);
    setIsDirty(true);
  };

  // --- Load an Existing Notice or Draft ---
  const loadNoticeById = async (id: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/staff/placement-notices/${id}/`);
      const n = res.data;

      setNoticeId(n.id);
      setNoticeStatus(n.status);
      setVersionCount(n.version_count || 1);

      setFormData({
        srNo: n.sr_no || "",
        to: n.to || "",
        subject: n.subject || "",
        date: n.date || "",
        intro: n.intro || "",
        about: n.about || "",
        eligibility_criteria: n.eligibility_criteria || "",
        Documents_to_Carry: n.documents_to_carry || "",
        Walk_in_interview: n.walk_in_interview || "",
        Company_registration_Link: n.company_registration_link || "",
        College_registration_Link: n.custom_data?.college_registration_link || "",
        Note: n.note || "",
        From: n.from_field || "",
        From_designation: n.from_designation || "",
        location: n.location || "",
        deadline: n.deadline || "",
        batch: n.batch || "",
      });

      if (n.table_data && n.table_data.length > 0) {
        setTableRows(n.table_data);
      }

      if (n.skill_required) {
        const skills = n.skill_required.split(",").map((s: string) => s.trim()).filter(Boolean);
        setSkillTags(skills);
      }

      setIsDirty(false);
      toast.success(`Loaded notice #${n.id} (${n.status})`);
    } catch (err) {
      toast.error("Failed to load notice details.");
    } finally {
      setLoading(false);
    }
  };

  // --- Reset to New Blank Notice ---
  const handleResetNewNotice = () => {
    if (isDirty && !window.confirm("Start new notice? Any unsaved edits will be discarded.")) {
      return;
    }

    setNoticeId(null);
    setNoticeStatus("NEW");
    setVersionCount(1);
    setSelectedOpportunity(null);
    setSkillTags([]);
    setTableRows([emptyRow()]);
    setFormData({
      srNo: "",
      to: "",
      subject: "",
      date: new Date().toISOString().split("T")[0],
      intro: "",
      about: "",
      eligibility_criteria: "",
      Documents_to_Carry: "1. Updated Resume (2 copies)\n2. College ID Card & Government ID\n3. Marksheets (10th, 12th/Diploma, All semesters)\n4. Passport size photographs (2 copies)",
      Walk_in_interview: "Online Assessment followed by Technical and HR Interviews.",
      Company_registration_Link: "",
      College_registration_Link: "",
      Note: "Students must report on time in formal attire. Late entries will not be permitted.",
      From: "Dr. Zahir Aalam",
      From_designation: "Dean (TP&IL)",
      location: "TCET Campus / Online",
      deadline: "",
      batch: "",
    });

    api
      .get("/api/staff/placement-notices/next-serial-number/")
      .then((res) => {
        if (res.data?.sr_no) {
          setFormData((prev) => ({ ...prev, srNo: res.data.sr_no }));
        }
      })
      .catch(() => {});

    setIsDirty(false);
  };

  // --- Save Draft Handler ---
  const handleSaveDraft = async () => {
    const csrfToken = getCookie("csrftoken");
    const validRows = tableRows.filter((r) => r.type.trim() || r.salary.trim() || r.position.trim());

    const payload = {
      id: noticeId || undefined,
      opportunity_id: selectedOpportunity?.id || undefined,
      company_id: selectedOpportunity?.company_id || undefined,
      batch: formData.batch || selectedOpportunity?.batch || "",
      subject: formData.subject,
      date: formData.date,
      to: formData.to,
      intro: formData.intro,
      about: formData.about,
      eligibility_criteria: formData.eligibility_criteria,
      skill_required: skillTags.join(", "),
      documents_to_carry: formData.Documents_to_Carry,
      walk_in_interview: formData.Walk_in_interview,
      company_registration_link: formData.Company_registration_Link,
      college_registration_link: formData.College_registration_Link,
      note: formData.Note,
      from_field: formData.From,
      from_designation: formData.From_designation,
      location: formData.location,
      deadline: formData.deadline || null,
      sr_no: formData.srNo,
      table_data: validRows,
    };

    setLoading(true);
    try {
      const res = await api.post("/api/staff/placement-notices/drafts/", payload, {
        headers: { "X-CSRFToken": csrfToken || "" },
      });

      const saved = res.data.notice;
      setNoticeId(saved.id);
      setNoticeStatus("DRAFT");
      setIsDirty(false);
      toast.success("Draft saved successfully!");
    } catch (err: any) {
      console.error("Error saving draft:", err);
      toast.error(err.response?.data?.error || "Failed to save draft.");
    } finally {
      setLoading(false);
    }
  };

  // --- Publish Handler (Version 1 or Version N+1) ---
  const handlePublish = async () => {
    // Basic pre-publish validations
    if (!formData.subject.trim()) {
      toast.error("Notice Subject is required.");
      return;
    }
    if (!formData.to.trim()) {
      toast.error("Notice Recipient (To) is required.");
      return;
    }
    if (!formData.intro.trim()) {
      toast.error("Notice Introduction is required.");
      return;
    }
    if (!formData.eligibility_criteria.trim()) {
      toast.error("Eligibility Criteria is required.");
      return;
    }

    const csrfToken = getCookie("csrftoken");
    const validRows = tableRows.filter((r) => r.type.trim() || r.salary.trim() || r.position.trim());

    // If notice does not exist in backend yet, save draft first to obtain ID
    let currentId = noticeId;
    if (!currentId) {
      try {
        const draftRes = await api.post(
          "/api/staff/placement-notices/drafts/",
          {
            opportunity_id: selectedOpportunity?.id,
            subject: formData.subject,
            date: formData.date,
            to: formData.to,
            intro: formData.intro,
            about: formData.about,
            eligibility_criteria: formData.eligibility_criteria,
            skill_required: skillTags.join(", "),
            documents_to_carry: formData.Documents_to_Carry,
            walk_in_interview: formData.Walk_in_interview,
            company_registration_link: formData.Company_registration_Link,
            note: formData.Note,
            from_field: formData.From,
            from_designation: formData.From_designation,
            location: formData.location,
            deadline: formData.deadline || null,
            sr_no: formData.srNo,
            table_data: validRows,
          },
          { headers: { "X-CSRFToken": csrfToken || "" } }
        );
        currentId = draftRes.data.notice.id;
        setNoticeId(currentId);
      } catch (err: any) {
        toast.error("Failed to initialize draft before publish.");
        return;
      }
    }

    const publishPayload = {
      subject: formData.subject,
      date: formData.date,
      to: formData.to,
      intro: formData.intro,
      about: formData.about,
      eligibility_criteria: formData.eligibility_criteria,
      skill_required: skillTags.join(", "),
      documents_to_carry: formData.Documents_to_Carry,
      walk_in_interview: formData.Walk_in_interview,
      company_registration_link: formData.Company_registration_Link,
      note: formData.Note,
      from_field: formData.From,
      from_designation: formData.From_designation,
      location: formData.location,
      deadline: formData.deadline || null,
      sr_no: formData.srNo,
      table_data: validRows,
    };

    setLoading(true);
    try {
      const res = await api.post(`/api/staff/placement-notices/${currentId}/publish/`, publishPayload, {
        headers: { "X-CSRFToken": csrfToken || "" },
      });

      const published = res.data.notice;
      const ver = res.data.version;

      setNoticeStatus("PUBLISHED");
      setVersionCount(published.version_count);
      setIsDirty(false);
      toast.success(`Notice published successfully as Version ${ver.version_number}!`);
    } catch (err: any) {
      console.error("Publish failed:", err);
      toast.error(err.response?.data?.error || "Publishing failed. Please check form values.");
    } finally {
      setLoading(false);
    }
  };

  // --- Clone as New Notice Handler ---
  const handleCloneAsNew = async () => {
    if (!noticeId) {
      toast.error("Please save or load a notice first before cloning.");
      return;
    }

    const csrfToken = getCookie("csrftoken");
    setLoading(true);
    try {
      const res = await api.post(
        `/api/staff/placement-notices/${noticeId}/clone/`,
        {},
        { headers: { "X-CSRFToken": csrfToken || "" } }
      );

      const cloned = res.data.notice;
      setNoticeId(cloned.id);
      setNoticeStatus("DRAFT");
      setVersionCount(1);
      setFormData((prev) => ({
        ...prev,
        subject: cloned.subject,
        srNo: cloned.sr_no,
        date: cloned.date,
      }));
      setIsDirty(false);
      toast.success(`Cloned as new independent draft Notice #${cloned.id}!`);
    } catch (err: any) {
      toast.error("Failed to clone notice.");
    } finally {
      setLoading(false);
    }
  };

  // --- Construct Live Preview Data Object (Matches official Notice letterhead template) ---
  const livePreviewData: NoticeData = useMemo(() => {
    const validRows = tableRows.filter((r) => r.type.trim() || r.salary.trim() || r.position.trim());
    return {
      srNo: formData.srNo,
      to: formData.to,
      subject: formData.subject,
      date: formData.date,
      intro: formData.intro,
      about: formData.about,
      eligibility_criteria: formData.eligibility_criteria,
      roles: JSON.stringify(validRows),
      tableData: validRows.length > 0 ? validRows : [emptyRow()],
      skill_required: skillTags.join(", "),
      Documents_to_Carry: formData.Documents_to_Carry,
      Walk_in_interview: formData.Walk_in_interview,
      Company_registration_Link: formData.Company_registration_Link,
      Note: formData.Note,
      From: formData.From,
      From_designation: formData.From_designation,
      location: formData.location,
      deadline: formData.deadline,
      noticeId: noticeId ? String(noticeId) : "Draft",
    };
  }, [formData, tableRows, skillTags, noticeId]);

  // --- Missing Information Quality Indicators ---
  const qualityChecklist = useMemo(() => {
    const items = [];
    if (!formData.subject.trim()) items.push({ label: "Notice Subject is missing", critical: true });
    if (!formData.to.trim()) items.push({ label: "Recipient (To) is missing", critical: true });
    if (!formData.eligibility_criteria.trim()) items.push({ label: "Eligibility criteria is missing", critical: true });
    if (tableRows.every((r) => !r.salary.trim() && !r.position.trim())) items.push({ label: "Job position & salary not specified", critical: false });
    if (!formData.Company_registration_Link.trim()) items.push({ label: "Company registration link is empty", critical: false });
    if (skillTags.length === 0) items.push({ label: "No skill tags added", critical: false });
    return items;
  }, [formData, tableRows, skillTags]);

  return (
    <Container maxWidth="xl" sx={{ py: 3, px: { xs: 1, sm: 2, md: 3 }, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
      {/* Top Workspace Header & Actions Bar */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 3,
          border: "1px solid #e2e8f0",
          background: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: "#0f172a" }}>
              Placement Notice Studio
            </Typography>
            {noticeStatus === "PUBLISHED" ? (
              <Chip
                icon={<CheckCircle2 size={14} />}
                label={`Published (v${versionCount})`}
                color="success"
                size="small"
                sx={{ fontWeight: 700 }}
              />
            ) : noticeStatus === "DRAFT" ? (
              <Chip
                label={`Draft Saved (#${noticeId})`}
                size="small"
                sx={{ bgcolor: "#fef3c7", color: "#92400e", fontWeight: 700 }}
              />
            ) : (
              <Chip label="New Notice Draft" size="small" sx={{ bgcolor: "#f1f5f9", fontWeight: 600 }} />
            )}
            {isDirty && (
              <Chip label="Unsaved Changes" size="small" color="warning" variant="outlined" sx={{ height: 22 }} />
            )}
          </Box>
          <Typography variant="caption" sx={{ color: "#64748b" }}>
            Automated Staff Placement Workflow • 4-Layer Domain Isolation • Immutable Versioning
          </Typography>
        </Box>

        {/* Global Action Bar */}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FolderOpen size={16} />}
            onClick={() => setDraftsOpen(true)}
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            Saved Drafts
          </Button>

          {noticeId && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<History size={16} />}
                onClick={() => setHistoryOpen(true)}
                sx={{ textTransform: "none", borderRadius: 2 }}
              >
                Version History {versionCount > 1 && `(${versionCount})`}
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ShieldCheck size={16} />}
                onClick={() => setAuditOpen(true)}
                sx={{ textTransform: "none", borderRadius: 2 }}
              >
                Audit Trail
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<Copy size={16} />}
                onClick={handleCloneAsNew}
                disabled={loading}
                sx={{ textTransform: "none", borderRadius: 2 }}
              >
                Clone as New
              </Button>
            </>
          )}

          <Button
            size="small"
            variant="text"
            startIcon={<RotateCcw size={16} />}
            onClick={handleResetNewNotice}
            sx={{ textTransform: "none" }}
          >
            Reset Form
          </Button>
        </Box>
      </Paper>

      {/* Step 1: Intelligent Opportunity Search */}
      <OpportunitySearchCard
        onSelectOpportunity={handleSelectOpportunity}
        selectedOpportunity={selectedOpportunity}
        selectedOppId={selectedOpportunity?.id}
        onClearSelection={handleClearOpportunity}
      />

      {/* Step 2: Placement Notice Form Editor */}
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3, md: 3.5 }, mb: 4, borderRadius: 3, border: "1px solid #e2e8f0", bgcolor: "#ffffff", width: "100%", boxSizing: "border-box" }}>
        {/* Form Section A: Communication Meta */}
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e293b", mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
              Communication & Institutional Meta
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Serial Number"
                  name="srNo"
                  value={formData.srNo}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  helperText="Generated institutional sequence"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Notice Date"
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Recipient (To)"
                  name="to"
                  value={formData.to}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  placeholder="e.g. All concerned Students of 2027 Batch (COMP, IT, AI&DS)"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  required
                  placeholder="e.g. Campus Recruitment Drive - Tata Consultancy Services for 2027 Batch"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Job Location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Deadline to Register"
                  name="deadline"
                  value={formData.deadline}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  placeholder="e.g. 30.09.2026 by 10.00 am"
                  helperText="Date & time (e.g. 30.09.2026 by 10.00 am)"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            {/* Form Section B: Introduction & Company Snapshot */}
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e293b", mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
              Introduction & Company Background
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <TextField
                  label="Introduction Text"
                  name="intro"
                  value={formData.intro}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="About Company (Snapshot for Notice)"
                  name="about"
                  value={formData.about}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={3}
                  size="small"
                  helperText="Snapshot saved immutably with this notice"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            {/* Form Section C: Repeatable Job Positions Table */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 1 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
                Job Positions & CTC (Repeatable Table)
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="primary"
                startIcon={<Plus size={14} />}
                onClick={addRow}
                sx={{ textTransform: "none", borderRadius: 1.5 }}
              >
                Add Position
              </Button>
            </Box>

            <Table size="small" sx={{ mb: 3, border: "1px solid #e2e8f0", borderRadius: 2 }}>
              <TableHead sx={{ bgcolor: "#f8fafc" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: "25%" }}>Offer Type</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: "30%" }}>CTC / Stipend</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: "35%" }}>Position / Role</TableCell>
                  <TableCell sx={{ width: "10%" }} align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.type}
                        onChange={(e) => handleRowChange(index, "type", e.target.value)}
                        placeholder="e.g. Regular / Dream"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.salary}
                        onChange={(e) => handleRowChange(index, "salary", e.target.value)}
                        placeholder="e.g. ₹7.5 LPA"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.position}
                        onChange={(e) => handleRowChange(index, "position", e.target.value)}
                        placeholder="e.g. Software Engineer"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeRow(index)}
                        disabled={tableRows.length === 1}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Divider sx={{ my: 3 }} />

            {/* Form Section D: Eligibility & Skills */}
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e293b", mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
              Eligibility Criteria & Skills
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <TextField
                  label="Eligibility Criteria"
                  name="eligibility_criteria"
                  value={formData.eligibility_criteria}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={3}
                  size="small"
                />
              </Grid>

              {/* Skills Chip Input */}
              <Grid item xs={12}>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600, display: "block", mb: 1 }}>
                  Required Skills (Type and press Enter or click Add)
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
                  <TextField
                    size="small"
                    placeholder="e.g. Python, Spring Boot, React, SQL"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSkill();
                      }
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="outlined"
                    onClick={handleAddSkill}
                    disabled={!skillInput.trim()}
                    sx={{ textTransform: "none", borderRadius: 2 }}
                  >
                    Add Skill
                  </Button>
                </Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                  {skillTags.map((skill, i) => (
                    <Chip
                      key={i}
                      label={skill}
                      size="small"
                      onDelete={() => handleRemoveSkill(skill)}
                      sx={{ bgcolor: "#eff6ff", color: "#1d4ed8", fontWeight: 600 }}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            {/* Form Section E: Selection Process & Logistics */}
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e293b", mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
              Selection Process, Logistics & Links
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <TextField
                  label="Selection Process"
                  name="Walk_in_interview"
                  value={formData.Walk_in_interview}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Documents to Carry"
                  name="Documents_to_Carry"
                  value={formData.Documents_to_Carry}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={3}
                  size="small"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Company Registration Link"
                  name="Company_registration_Link"
                  value={formData.Company_registration_Link}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  placeholder="https://careers.company.com/apply"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Important Note for Students"
                  name="Note"
                  value={formData.Note}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Signatory Name"
                  name="From"
                  value={formData.From}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Signatory Designation"
                  name="From_designation"
                  value={formData.From_designation}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                />
              </Grid>
            </Grid>

            {/* Quality / Missing Info Alerts */}
            {qualityChecklist.length > 0 && (
              <Box sx={{ mb: 3 }}>
                {qualityChecklist.map((item, idx) => (
                  <Alert
                    key={idx}
                    severity={item.critical ? "error" : "warning"}
                    icon={<AlertTriangle size={16} />}
                    sx={{ mb: 1, py: 0.5, borderRadius: 2, fontSize: "12px" }}
                  >
                    {item.label}
                  </Alert>
                ))}
              </Box>
            )}

            {/* Bottom Form Action Buttons */}
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", pt: 2, borderTop: "1px solid #f1f5f9" }}>
              <Button
                variant="outlined"
                color="primary"
                startIcon={loading ? <CircularProgress size={16} /> : <Save size={16} />}
                onClick={handleSaveDraft}
                disabled={loading}
                sx={{ textTransform: "none", borderRadius: 2, px: 3, fontWeight: 600 }}
              >
                Save Draft
              </Button>

              <Button
                variant="contained"
                color={noticeStatus === "PUBLISHED" ? "secondary" : "primary"}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />}
                onClick={handlePublish}
                disabled={loading}
                sx={{ textTransform: "none", borderRadius: 2, px: 3.5, fontWeight: 700 }}
              >
                {noticeStatus === "PUBLISHED" ? `Update Notice (Create v${versionCount + 1})` : "Publish Notice (v1)"}
              </Button>

              <Button
                variant="outlined"
                color="inherit"
                startIcon={<Printer size={16} />}
                onClick={() => reactPrintFn()}
                sx={{ textTransform: "none", borderRadius: 2, ml: "auto" }}
              >
                Print / Save PDF
              </Button>
            </Box>
      </Paper>

      {/* Step 3: Live Institutional Document Preview (at the bottom) */}
      <Paper
        elevation={0}
        sx={{
          mb: 4,
          borderRadius: 3,
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          bgcolor: "#ffffff",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Preview Section Header */}
        <Box
          sx={{
            p: 2.5,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
            bgcolor: "#fafbfd",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: "#22c55e",
                boxShadow: "0 0 0 4px rgba(34, 197, 94, 0.2)",
              }}
            />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#0f172a" }}>
                Live Institutional Preview
              </Typography>
              <Typography variant="caption" sx={{ color: "#64748b" }}>
                Official TCET institutional notice document • Updates live as you edit
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Printer size={16} />}
            onClick={() => reactPrintFn()}
            sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, px: 2.5 }}
          >
            Print Preview
          </Button>
        </Box>

        {/* Wide Document Canvas Viewer */}
        <Box
          sx={{
            bgcolor: "#525659",
            p: { xs: 1.5, sm: 3, md: 4 },
            display: "flex",
            justifyContent: "center",
            overflowX: "auto",
            minHeight: 500,
            boxSizing: "border-box",
          }}
        >
          <Box sx={{ width: "100%", maxWidth: "960px" }}>
            <Notice formData={livePreviewData} ref={contentRef} isPlacement={true} />
          </Box>
        </Box>
      </Paper>

      {/* Auxiliary Modals */}
      <NoticeVersionHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        noticeId={noticeId}
        onSelectVersionSnapshot={(snap) => {
          setFormData((prev) => ({
            ...prev,
            srNo: snap.sr_no || prev.srNo,
            to: snap.to || prev.to,
            subject: snap.subject || prev.subject,
            date: snap.date || prev.date,
            intro: snap.intro || prev.intro,
            about: snap.about || prev.about,
            eligibility_criteria: snap.eligibility_criteria || prev.eligibility_criteria,
            Documents_to_Carry: snap.documents_to_carry || prev.Documents_to_Carry,
            Walk_in_interview: snap.walk_in_interview || prev.Walk_in_interview,
            Company_registration_Link: snap.company_registration_link || prev.Company_registration_Link,
            Note: snap.note || prev.Note,
            From: snap.from_field || prev.From,
            From_designation: snap.from_designation || prev.From_designation,
            location: snap.location || prev.location,
            deadline: snap.deadline || prev.deadline,
          }));
          if (snap.table_data) setTableRows(snap.table_data);
          if (snap.skill_required) {
            setSkillTags(snap.skill_required.split(",").map((s: string) => s.trim()).filter(Boolean));
          }
          setIsDirty(true);
          toast.success("Loaded snapshot into editor.");
        }}
      />

      <NoticeAuditLogsModal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        noticeId={noticeId}
      />

      <SavedDraftsModal
        open={draftsOpen}
        onClose={() => setDraftsOpen(false)}
        onSelectDraft={(id) => loadNoticeById(id)}
        onNewNotice={handleResetNewNotice}
      />
    </Container>
  );
};

export default PlacementNotice;
