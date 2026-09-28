import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Paper,
  Divider,
  IconButton,
} from "@mui/material";
import { FileText, X, Trash2, ArrowRight, Clock, Plus } from "lucide-react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

interface DraftItem {
  id: number;
  sr_no: string;
  subject: string;
  batch: string;
  company_name: string;
  date: string;
  updated_at: string;
}

interface SavedDraftsModalProps {
  open: boolean;
  onClose: () => void;
  onSelectDraft: (draftId: number) => void;
  onNewNotice: () => void;
}

const SavedDraftsModal: React.FC<SavedDraftsModalProps> = ({
  open,
  onClose,
  onSelectDraft,
  onNewNotice,
}) => {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDrafts = () => {
    setLoading(true);
    api
      .get("/api/staff/placement-notices/drafts/")
      .then((res) => {
        setDrafts(res.data || []);
      })
      .catch((err) => {
        console.error("Error fetching drafts:", err);
        setDrafts([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) {
      fetchDrafts();
    }
  }, [open]);

  const handleDeleteDraft = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this notice draft?")) return;

    try {
      await api.delete(`/api/staff/placement-notices/drafts/${id}/`);
      toast.success("Draft deleted.");
      fetchDrafts();
    } catch (err) {
      toast.error("Failed to delete draft.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ m: 0, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "8px",
              bgcolor: "#fef3c7",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FileText size={20} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "18px", color: "#0f172a" }}>
              Saved Placement Notice Drafts
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b" }}>
              Private work-in-progress notice drafts
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 2.5 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5, gap: 1.5 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              Loading drafts...
            </Typography>
          </Box>
        ) : drafts.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="body1" sx={{ color: "#64748b", mb: 2 }}>
              No saved drafts found.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Plus size={16} />}
              onClick={() => {
                onNewNotice();
                onClose();
              }}
              sx={{ textTransform: "none", borderRadius: 2 }}
            >
              Start New Notice
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxHeight: 380, overflowY: "auto" }}>
            {drafts.map((d) => {
              const updatedStr = new Date(d.updated_at).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <Paper
                  key={d.id}
                  elevation={0}
                  onClick={() => {
                    onSelectDraft(d.id);
                    onClose();
                  }}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: "1px solid #e2e8f0",
                    bgcolor: "#ffffff",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.15s ease",
                    "&:hover": {
                      borderColor: "#3b82f6",
                      bgcolor: "#f8fafc",
                    },
                  }}
                >
                  <Box sx={{ flex: 1, pr: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Chip
                        label={d.sr_no || `Draft #${d.id}`}
                        size="small"
                        sx={{ height: 20, fontSize: "10px", bgcolor: "#f1f5f9", fontWeight: 600 }}
                      />
                      {d.batch && (
                        <Chip
                          label={`Batch ${d.batch}`}
                          size="small"
                          sx={{ height: 20, fontSize: "10px", bgcolor: "#eff6ff", color: "#1d4ed8" }}
                        />
                      )}
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "#1e293b", mb: 0.5 }}>
                      {d.subject || "Untitled Draft"}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "#94a3b8", fontSize: "11px" }}>
                      <Clock size={12} />
                      <span>Last saved: {updatedStr}</span>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => handleDeleteDraft(e, d.id)}
                      title="Delete draft"
                    >
                      <Trash2 size={16} />
                    </IconButton>
                    <Button
                      size="small"
                      variant="outlined"
                      endIcon={<ArrowRight size={14} />}
                      sx={{ textTransform: "none", fontSize: "12px", borderRadius: 1.5 }}
                    >
                      Resume
                    </Button>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, justifyContent: "space-between" }}>
        <Button
          startIcon={<Plus size={16} />}
          onClick={() => {
            onNewNotice();
            onClose();
          }}
          sx={{ textTransform: "none" }}
        >
          New Notice
        </Button>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SavedDraftsModal;
