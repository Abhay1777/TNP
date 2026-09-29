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
  Alert,
} from "@mui/material";
import {
  Search as SearchIcon,
  Building2,
  X,
  RotateCcw,
} from "lucide-react";
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchOpportunities = useCallback(
    async (query: string, batch: string, type: string) => {
      const q = query.trim();
      const b = batch.trim();
      const t = type !== "All" ? type.trim() : "";

      // Empty search guard: do not fetch without any keyword or filter
      if (!q && !b && !t) {
        setResults([]);
        setHasSearched(false);
        setSearchError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setSearchError(null);
      try {
        const params: Record<string, string> = {};
        if (q) params.q = q;
        if (b) params.batch = b;
        if (t) params.type = t;

        const res = await api.get("/api/staff/placement/opportunities/search/", { params });
        setResults(res.data || []);
        setHasSearched(true);
      } catch (err) {
        console.error("Error searching placement opportunities:", err);
        setSearchError("Unable to search placement opportunities.");
        setResults([]);
        setHasSearched(true);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced search trigger (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOpportunities(searchQuery, selectedBatch, typeFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedBatch, typeFilter, fetchOpportunities]);

  const handleRetry = () => {
    fetchOpportunities(searchQuery, selectedBatch, typeFilter);
  };

  const handleClearInput = () => {
    setSearchQuery("");
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        mb: 3,
        borderRadius: 3,
        border: "1px solid #e2e8f0",
        bgcolor: "#ffffff",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          mb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              bgcolor: "#eff6ff",
              border: "1px solid #bfdbfe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#2563eb",
            }}
          >
            <SearchIcon size={18} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
              Search Company or Placement Opportunity
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b" }}>
              Search company, role, skill, batch to select and auto-fill notice details
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
            sx={{ textTransform: "none", borderRadius: 2, fontSize: "12px" }}
          >
            Clear Selected
          </Button>
        )}
      </Box>

      {/* Search Input & Quick Filters Row */}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          flexWrap: "wrap",
          alignItems: "center",
          mb: 2,
          width: "100%",
        }}
      >
        <TextField
          size="small"
          placeholder="Search company, role, skill, batch (e.g. TCS, Software, Java, 2027)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flex: 1, minWidth: { xs: "100%", sm: 280 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon size={18} color="#94a3b8" />
              </InputAdornment>
            ),
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <Button
                  size="small"
                  onClick={handleClearInput}
                  sx={{ minWidth: "auto", p: 0.5, color: "#94a3b8" }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </Button>
              </InputAdornment>
            ) : null,
          }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="batch-filter-label">Batch</InputLabel>
          <Select
            labelId="batch-filter-label"
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

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="type-filter-label">Type</InputLabel>
          <Select
            labelId="type-filter-label"
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

      {/* Results & Status Section */}
      <Box sx={{ width: "100%", boxSizing: "border-box" }}>
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 3, gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              Searching placement opportunities...
            </Typography>
          </Box>
        ) : searchError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" startIcon={<RotateCcw size={14} />} onClick={handleRetry}>
                Retry
              </Button>
            }
            sx={{ borderRadius: 2 }}
          >
            {searchError}
          </Alert>
        ) : results.length > 0 ? (
          <Box sx={{ width: "100%" }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "#64748b", display: "block", mb: 1 }}>
              Search Results ({results.length})
            </Typography>

            {/* Compact Search Results List */}
            <Box
              sx={{
                maxHeight: 280,
                overflowY: "auto",
                overflowX: "hidden",
                border: "1px solid #e2e8f0",
                borderRadius: 2,
                bgcolor: "#ffffff",
                divideY: "1px solid #f1f5f9",
              }}
            >
              {results.map((opp) => {
                const isSelected = selectedOppId === opp.id;

                // Build secondary meta string (e.g. "Software Engineer • 2027 • Placement")
                const metaParts: string[] = [];
                if (opp.designation && opp.designation !== "Role not specified") {
                  metaParts.push(opp.designation);
                }
                if (opp.batch) {
                  metaParts.push(opp.batch);
                }
                if (opp.placement_internship) {
                  metaParts.push(opp.placement_internship);
                }
                const metaLine = metaParts.join(" • ");

                const ctc =
                  opp.emolument_display && opp.emolument_display !== "Not specified"
                    ? opp.emolument_display
                    : null;

                const depts =
                  opp.eligible_departments && opp.eligible_departments.length > 0
                    ? `Eligible: ${opp.eligible_departments.slice(0, 4).join(", ")}${
                        opp.eligible_departments.length > 4 ? ` +${opp.eligible_departments.length - 4}` : ""
                      }`
                    : null;

                const skillsText =
                  opp.skills && opp.skills.length > 0
                    ? `Skills: ${opp.skills.slice(0, 3).join(", ")}`
                    : null;

                return (
                  <Box
                    key={opp.id}
                    onClick={() => onSelectOpportunity(opp)}
                    sx={{
                      p: 1.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 2,
                      cursor: "pointer",
                      borderLeft: isSelected ? "4px solid #2563eb" : "4px solid transparent",
                      bgcolor: isSelected ? "#eff6ff" : "#ffffff",
                      transition: "all 0.15s ease",
                      borderBottom: "1px solid #f1f5f9",
                      "&:hover": {
                        bgcolor: isSelected ? "#dbeafe" : "#f8fafc",
                      },
                      "&:last-child": {
                        borderBottom: "none",
                      },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Line 1: Company Name + Aliases */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.3 }}>
                        <Building2 size={16} color="#2563eb" style={{ flexShrink: 0 }} />
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            color: "#0f172a",
                            fontSize: "14px",
                          }}
                        >
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

                      {/* Line 2: Role • Batch • Type */}
                      {metaLine && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: "#475569",
                            fontSize: "13px",
                            fontWeight: 500,
                            mb: 0.3,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {metaLine}
                        </Typography>
                      )}

                      {/* Line 3: Compensation • Eligible Branches / Skills */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                        {ctc && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: "#059669",
                              fontWeight: 700,
                              fontSize: "12px",
                              bgcolor: "#ecfdf5",
                              px: 0.8,
                              py: 0.2,
                              borderRadius: 1,
                            }}
                          >
                            {ctc}
                          </Typography>
                        )}
                        {depts && (
                          <Typography variant="caption" sx={{ color: "#64748b", fontSize: "12px" }}>
                            {depts}
                          </Typography>
                        )}
                        {!depts && skillsText && (
                          <Typography variant="caption" sx={{ color: "#64748b", fontSize: "12px" }}>
                            {skillsText}
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* Action Button */}
                    <Button
                      size="small"
                      variant={isSelected ? "contained" : "outlined"}
                      color="primary"
                      sx={{
                        textTransform: "none",
                        fontSize: "12px",
                        py: 0.4,
                        px: 1.5,
                        borderRadius: 1.5,
                        flexShrink: 0,
                      }}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ) : hasSearched ? (
          <Box
            sx={{
              textAlign: "center",
              py: 2.5,
              px: 2,
              bgcolor: "#f8fafc",
              borderRadius: 2,
              border: "1px dashed #cbd5e1",
            }}
          >
            <Typography variant="body2" sx={{ color: "#475569", fontWeight: 500 }}>
              No matching companies or placement opportunities found.
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.5 }}>
              Try searching by company name, role, skill, or batch.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              py: 2,
              px: 2,
              bgcolor: "#f8fafc",
              borderRadius: 2,
              border: "1px dashed #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Typography variant="body2" sx={{ color: "#64748b", fontSize: "13px" }}>
              Search for a company or placement opportunity to auto-fill the notice details.
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              Try: TCS • Software • Java • Batch 2027
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default OpportunitySearchCard;
