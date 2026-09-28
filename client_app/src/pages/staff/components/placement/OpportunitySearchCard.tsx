import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  TextField,
  Typography,
  Chip,
  Paper,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
} from "@mui/material";
import { Search as SearchIcon, Building2, Briefcase, IndianRupee, GraduationCap, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";

export interface OpportunityItem {
  id: number;
  company_id: number;
  company_name: string;
  company_website?: string;
  company_description?: string;
  company_aliases?: string[];
  batch: string;
  designation: string;
  tech_nontech: string;
  placement_internship: string;
  eligibility_criteria: string;
  eligible_departments?: string[];
  department_flags?: Record<string, boolean>;
  skills?: string[];
  emolument_raw?: string;
  emolument_display: string;
  selection_process?: string;
  number_of_offers?: number;
}

interface OpportunitySearchCardProps {
  onSelectOpportunity: (opp: OpportunityItem) => void;
  selectedOppId?: number | null;
  onClearSelection?: () => void;
}

const OpportunitySearchCard: React.FC<OpportunitySearchCardProps> = ({
  onSelectOpportunity,
  selectedOppId,
  onClearSelection,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [results, setResults] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchOpportunities = useCallback(async (query: string, batch: string, type: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (query.trim()) params.q = query.trim();
      if (batch) params.batch = batch;
      if (type !== "All") params.type = type;

      const res = await api.get("/api/staff/placement/opportunities/search/", { params });
      setResults(res.data || []);
      setHasSearched(true);
    } catch (err) {
      console.error("Error searching placement opportunities:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOpportunities(searchQuery, selectedBatch, typeFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedBatch, typeFilter, fetchOpportunities]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        mb: 3,
        borderRadius: 3,
        border: "1px solid #e2e8f0",
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: "10px",
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <Sparkles size={20} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
              Intelligent Opportunity Search & Auto-Fill
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b" }}>
              Search company, role, skills, or batch to instantly auto-populate notice fields with edit isolation
            </Typography>
          </Box>
        </Box>

        {selectedOppId && onClearSelection && (
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={<X size={14} />}
            onClick={onClearSelection}
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            Clear Selected Opportunity
          </Button>
        )}
      </Box>

      {/* Search Filters Row */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by company (e.g. TCS), role, skill (e.g. Python), batch..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flex: 1, minWidth: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon size={18} color="#94a3b8" />
              </InputAdornment>
            ),
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <Button size="small" onClick={() => setSearchQuery("")} sx={{ minWidth: "auto", p: 0.5 }}>
                  <X size={14} />
                </Button>
              </InputAdornment>
            ) : null,
          }}
        />

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="batch-select-label">Batch</InputLabel>
          <Select
            labelId="batch-select-label"
            value={selectedBatch}
            label="Batch"
            onChange={(e) => setSelectedBatch(e.target.value)}
          >
            <MenuItem value="">All Batches</MenuItem>
            <MenuItem value="2028">Batch 2028</MenuItem>
            <MenuItem value="2027">Batch 2027</MenuItem>
            <MenuItem value="2026">Batch 2026</MenuItem>
            <MenuItem value="2025">Batch 2025</MenuItem>
            <MenuItem value="2024">Batch 2024</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="type-select-label">Type</InputLabel>
          <Select
            labelId="type-select-label"
            value={typeFilter}
            label="Type"
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <MenuItem value="All">All Types</MenuItem>
            <MenuItem value="Placement">Placement</MenuItem>
            <MenuItem value="Internship">Internship</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Results Section */}
      <Box sx={{ minHeight: loading ? 100 : results.length > 0 ? "auto" : 40 }}>
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 3, gap: 1.5 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              Searching placement opportunities...
            </Typography>
          </Box>
        ) : results.length > 0 ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5, maxHeight: 320, overflowY: "auto", pr: 0.5 }}>
            {results.map((opp) => {
              const isSelected = selectedOppId === opp.id;
              return (
                <Paper
                  key={opp.id}
                  elevation={0}
                  onClick={() => onSelectOpportunity(opp)}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    "&:hover": {
                      borderColor: isSelected ? "#1d4ed8" : "#94a3b8",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Building2 size={16} color="#3b82f6" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#1e293b" }}>
                          {opp.company_name}
                        </Typography>
                        {opp.company_aliases && opp.company_aliases.length > 0 && (
                          <Chip
                            label={opp.company_aliases[0]}
                            size="small"
                            sx={{ height: 18, fontSize: "10px", bgcolor: "#f1f5f9", fontWeight: 600 }}
                          />
                        )}
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                        <Briefcase size={14} color="#64748b" />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: "#334155" }}>
                          {opp.designation}
                        </Typography>
                      </Box>
                    </Box>

                    <Button
                      size="small"
                      variant={isSelected ? "contained" : "outlined"}
                      color="primary"
                      sx={{ textTransform: "none", fontSize: "12px", py: 0.3, px: 1.5, borderRadius: 1.5 }}
                    >
                      {isSelected ? "Selected" : "Auto-Fill"}
                    </Button>
                  </Box>

                  {/* Badges & Meta */}
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8, mt: 1 }}>
                    <Chip
                      icon={<GraduationCap size={12} />}
                      label={`Batch ${opp.batch}`}
                      size="small"
                      sx={{ height: 22, fontSize: "11px", bgcolor: "#f8fafc", color: "#475569" }}
                    />
                    <Chip
                      icon={<IndianRupee size={12} />}
                      label={opp.emolument_display}
                      size="small"
                      sx={{ height: 22, fontSize: "11px", bgcolor: "#ecfdf5", color: "#065f46", fontWeight: 600 }}
                    />
                    <Chip
                      label={opp.tech_nontech}
                      size="small"
                      sx={{ height: 22, fontSize: "11px", bgcolor: opp.tech_nontech === "Tech" ? "#eff6ff" : "#fef3c7", color: opp.tech_nontech === "Tech" ? "#1d4ed8" : "#92400e" }}
                    />
                  </Box>

                  {/* Branches */}
                  {opp.eligible_departments && opp.eligible_departments.length > 0 && (
                    <Typography variant="caption" sx={{ display: "block", color: "#64748b", mt: 1, fontSize: "11px" }}>
                      <strong>Eligible:</strong> {opp.eligible_departments.slice(0, 5).join(", ")}
                      {opp.eligible_departments.length > 5 ? ` +${opp.eligible_departments.length - 5} more` : ""}
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Box>
        ) : hasSearched ? (
          <Box sx={{ textAlign: "center", py: 2.5, bgcolor: "#f8fafc", borderRadius: 2, border: "1px dashed #cbd5e1" }}>
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              No placement opportunities found matching your criteria.
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Paper>
  );
};

export default OpportunitySearchCard;
