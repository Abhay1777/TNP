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
import { ShieldCheck, X, Clock, User } from "lucide-react";
import { api } from "@/lib/api";

interface AuditLogItem {
  id: number;
  action: string;
  version_number?: number;
  performed_by_name?: string;
  performed_by_email?: string;
  timestamp: string;
  details?: Record<string, any>;
  ip_address?: string;
}

interface NoticeAuditLogsModalProps {
  open: boolean;
  onClose: () => void;
  noticeId: number | null;
}

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  CREATED_DRAFT: { bg: "#fef3c7", color: "#92400e" },
  UPDATED_DRAFT: { bg: "#f1f5f9", color: "#334155" },
  PUBLISHED: { bg: "#ecfdf5", color: "#065f46" },
  UPDATED_VERSION: { bg: "#eff6ff", color: "#1d4ed8" },
  CLONED: { bg: "#f3e8ff", color: "#6b21a8" },
  DELETED_DRAFT: { bg: "#fee2e2", color: "#991b1b" },
};

const NoticeAuditLogsModal: React.FC<NoticeAuditLogsModalProps> = ({ open, onClose, noticeId }) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && noticeId) {
      setLoading(true);
      api
        .get(`/api/staff/placement-notices/${noticeId}/audit-logs/`)
        .then((res) => {
          setLogs(res.data || []);
        })
        .catch((err) => {
          console.error("Error fetching audit logs:", err);
          setLogs([]);
        })
        .finally(() => setLoading(false));
    }
  }, [open, noticeId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ m: 0, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "8px",
              bgcolor: "#ecfdf5",
              color: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={20} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "18px", color: "#0f172a" }}>
              Notice Audit Trail
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b" }}>
              Immutable server-side activity log
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
              Loading audit records...
            </Typography>
          </Box>
        ) : logs.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              No audit records found for this notice.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxHeight: 380, overflowY: "auto" }}>
            {logs.map((log) => {
              const dateStr = new Date(log.timestamp).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
              const actionStyle = ACTION_COLORS[log.action] || { bg: "#f1f5f9", color: "#475569" };

              return (
                <Paper
                  key={log.id}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: "1px solid #e2e8f0",
                    bgcolor: "#ffffff",
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Chip
                      label={log.action.replace("_", " ")}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: "11px",
                        fontWeight: 700,
                        bgcolor: actionStyle.bg,
                        color: actionStyle.color,
                      }}
                    />
                    {log.version_number && (
                      <Chip
                        label={`v${log.version_number}`}
                        size="small"
                        sx={{ height: 20, fontSize: "10px", bgcolor: "#f8fafc" }}
                      />
                    )}
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#475569", fontSize: "12px", mb: 0.5 }}>
                    <User size={13} />
                    <span>
                      <strong>{log.performed_by_name || log.performed_by_email || "Authorized Staff"}</strong>
                      {log.performed_by_email && log.performed_by_name ? ` (${log.performed_by_email})` : ""}
                    </span>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#94a3b8", fontSize: "11px" }}>
                    <Clock size={13} />
                    <span>{dateStr}</span>
                    {log.ip_address && <span>• IP: {log.ip_address}</span>}
                  </Box>
                </Paper>
              );
            })}
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

export default NoticeAuditLogsModal;
