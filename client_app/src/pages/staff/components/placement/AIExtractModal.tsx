import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  CircularProgress,
  Paper,
  Divider,
  IconButton,
  Alert,
} from "@mui/material";
import { Sparkles, X, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

interface AIExtractModalProps {
  open: boolean;
  onClose: () => void;
  onApplyExtractedData: (data: Record<string, any>) => void;
}

const AIExtractModal: React.FC<AIExtractModalProps> = ({ open, onClose, onApplyExtractedData }) => {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<Record<string, any> | null>(null);

  const handleExtract = async () => {
    if (!inputText.trim()) {
      toast.error("Please paste the placement circular or company communication text.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/api/staff/placement-notices/ai-extract/", { text: inputText });
      setExtractedData(res.data);
      toast.success("Content extracted! Please review below before applying.");
    } catch (err) {
      toast.error("Extraction failed. Please check your text and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (extractedData) {
      onApplyExtractedData(extractedData);
      onClose();
      toast.success("Extracted fields populated into notice form.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ m: 0, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "8px",
              background: "linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={20} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "18px", color: "#0f172a" }}>
              AI Notice Content Extraction Assist
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b" }}>
              Safely extract structured fields from company emails and placement circulars
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 3 }}>
        <Alert
          severity="info"
          icon={<ShieldAlert size={18} />}
          sx={{ mb: 2.5, borderRadius: 2, fontSize: "12px" }}
        >
          <strong>Security & Privacy Guard:</strong> AI extraction parses untrusted text into editable draft fields. It will <strong>never directly publish</strong> a notice. You must review and confirm all extracted fields.
        </Alert>

        <TextField
          multiline
          rows={6}
          fullWidth
          label="Paste Circular or Email Text Here"
          placeholder="e.g. Campus Recruitment Drive for Tata Consultancy Services. Role: Software Engineer, CTC: 8.5 LPA, Eligibility: COMP/IT/AI&DS with CGPA 7.0+..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          sx={{ mb: 2.5 }}
        />

        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2.5 }}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={16} />}
            disabled={loading || !inputText.trim()}
            onClick={handleExtract}
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            {loading ? "Extracting..." : "Extract Structured Fields"}
          </Button>
        </Box>

        {extractedData && (
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2.5, bgcolor: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <CheckCircle2 size={18} color="#16a34a" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#1e293b" }}>
                Review Extracted Fields (Draft Snapshot)
              </Typography>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, fontSize: "13px" }}>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Extracted Position</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#1e293b" }}>
                  {extractedData.table_data?.[0]?.position || "None detected"}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Extracted CTC / Salary</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#16a34a" }}>
                  {extractedData.table_data?.[0]?.salary || "None detected"}
                </Typography>
              </Box>

              <Box sx={{ gridColumn: "span 2" }}>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Registration Link</Typography>
                <Typography variant="body2" sx={{ color: "#2563eb", wordBreak: "break-all" }}>
                  {extractedData.company_registration_link || "None detected"}
                </Typography>
              </Box>

              <Box sx={{ gridColumn: "span 2" }}>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Eligibility Criteria</Typography>
                <Typography variant="body2" sx={{ color: "#334155" }}>
                  {extractedData.eligibility_criteria || "None detected"}
                </Typography>
              </Box>

              <Box sx={{ gridColumn: "span 2" }}>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Skills Required</Typography>
                <Typography variant="body2" sx={{ color: "#334155" }}>
                  {extractedData.skill_required || "None detected"}
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        {extractedData && (
          <Button
            variant="contained"
            color="primary"
            endIcon={<ArrowRight size={16} />}
            onClick={handleApply}
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            Apply to Notice Form
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AIExtractModal;
