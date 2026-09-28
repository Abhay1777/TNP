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
import { History, X, CheckCircle2, Clock, User } from "lucide-react";
import { api } from "@/lib/api";

export interface VersionItem {
  id: number;
  version_number: number;
  title_or_subject: string;
  snapshot: Record<string, any>;
  changes_summary: Array<{ field: string; label?: string; old?: string; new?: string; description: string }>;
  created_by_email?: string;
  created_by_name?: string;
  created_at: string;
  is_current: boolean;
}

interface NoticeVersionHistoryModalProps {
  open: boolean;
  onClose: () => void;
  noticeId: number | null;
  onSelectVersionSnapshot?: (snapshot: Record<string, any>) => void;
}

const NoticeVersionHistoryModal: React.FC<NoticeVersionHistoryModalProps> = ({
  open,
  onClose,
  noticeId,
  onSelectVersionSnapshot,
}) => {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<VersionItem | null>(null);

  useEffect(() => {
    if (open && noticeId) {
      setLoading(true);
      api
        .get(`/api/staff/placement-notices/${noticeId}/versions/`)
        .then((res) => {
          const list = res.data || [];
          setVersions(list);
          if (list.length > 0) {
            setSelectedVersion(list[0]);
          }
        })
        .catch((err) => {
          console.error("Error fetching notice versions:", err);
          setVersions([]);
        })
        .finally(() => setLoading(false));
    }
  }, [open, noticeId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ m: 0, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "8px",
              bgcolor: "#eff6ff",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <History size={20} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "18px", color: "#0f172a" }}>
              Notice Version History & Changelog
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b" }}>
              Immutable historical snapshots and change detection trail
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 3 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6, gap: 1.5 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              Loading version history...
            </Typography>
          </Box>
        ) : versions.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 5 }}>
            <Typography variant="body1" sx={{ color: "#64748b" }}>
              No version snapshots found for this notice yet.
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              A permanent immutable snapshot is created each time a notice is published or updated.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1.3fr" }, gap: 3 }}>
            {/* Version List Timeline */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxHeight: 420, overflowY: "auto", pr: 1 }}>
              {versions.map((ver) => {
                const isSelected = selectedVersion?.id === ver.id;
                const dateStr = new Date(ver.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <Paper
                    key={ver.id}
                    elevation={0}
                    onClick={() => setSelectedVersion(ver)}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      bgcolor: isSelected ? "#eff6ff" : "#ffffff",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#1e293b" }}>
                          Version {ver.version_number}
                        </Typography>
                        {ver.is_current && (
                          <Chip
                            icon={<CheckCircle2 size={12} />}
                            label="Current Published"
                            size="small"
                            sx={{ height: 20, fontSize: "10px", bgcolor: "#ecfdf5", color: "#065f46", fontWeight: 700 }}
                          />
                        )}
                      </Box>
                    </Box>

                    <Typography variant="body2" sx={{ color: "#475569", fontWeight: 500, fontSize: "13px", mb: 1 }}>
                      {ver.title_or_subject}
                    </Typography>

                    {/* Changelog items preview */}
                    {ver.changes_summary && ver.changes_summary.length > 0 && (
                      <Box sx={{ bgcolor: isSelected ? "#dbeafe" : "#f8fafc", p: 1, borderRadius: 1.5, mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "#334155", display: "block" }}>
                          Changes in this version:
                        </Typography>
                        {ver.changes_summary.slice(0, 3).map((c, idx) => (
                          <Typography key={idx} variant="caption" sx={{ color: "#475569", display: "block", fontSize: "11px" }}>
                            • {c.description}
                          </Typography>
                        ))}
                      </Box>
                    )}

                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: "11px" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Clock size={12} />
                        <span>{dateStr}</span>
                      </Box>
                      {ver.created_by_name && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <User size={12} />
                          <span>{ver.created_by_name}</span>
                        </Box>
                      )}
                    </Box>
                  </Paper>
                );
              })}
            </Box>

            {/* Selected Version Snapshot Details */}
            {selectedVersion && (
              <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2.5, bgcolor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#0f172a" }}>
                    Version {selectedVersion.version_number} Snapshot Details
                  </Typography>
                  <Chip
                    label="Immutable Historical State"
                    size="small"
                    sx={{ height: 20, fontSize: "10px", bgcolor: "#e2e8f0", color: "#475569" }}
                  />
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxHeight: 330, overflowY: "auto", pr: 0.5 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Serial Number</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#1e293b" }}>
                      {selectedVersion.snapshot.sr_no || "N/A"}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Notice Date</Typography>
                    <Typography variant="body2" sx={{ color: "#1e293b" }}>
                      {selectedVersion.snapshot.date || "N/A"}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Positions & CTC</Typography>
                    {selectedVersion.snapshot.table_data && selectedVersion.snapshot.table_data.length > 0 ? (
                      selectedVersion.snapshot.table_data.map((row: any, i: number) => (
                        <Typography key={i} variant="body2" sx={{ color: "#1e293b" }}>
                          • {row.position} — <strong>{row.salary}</strong> ({row.type})
                        </Typography>
                      ))
                    ) : (
                      <Typography variant="body2" sx={{ color: "#94a3b8" }}>No position rows</Typography>
                    )}
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Eligibility Criteria</Typography>
                    <Typography variant="body2" sx={{ color: "#334155", fontSize: "12px" }}>
                      {selectedVersion.snapshot.eligibility_criteria || "N/A"}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Skills Required</Typography>
                    <Typography variant="body2" sx={{ color: "#334155", fontSize: "12px" }}>
                      {selectedVersion.snapshot.skill_required || "N/A"}
                    </Typography>
                  </Box>
                </Box>

                {onSelectVersionSnapshot && (
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    onClick={() => {
                      onSelectVersionSnapshot(selectedVersion.snapshot);
                      onClose();
                    }}
                    sx={{ mt: 2, textTransform: "none", borderRadius: 2 }}
                  >
                    Load Snapshot into Editor
                  </Button>
                )}
              </Paper>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NoticeVersionHistoryModal;
