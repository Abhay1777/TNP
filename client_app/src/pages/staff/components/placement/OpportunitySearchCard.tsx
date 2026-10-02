import React, { useState, useEffect, useCallback, useRef } from "react";
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
  IconButton,
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
  selectedOpportunity?: OpportunityItem | null;
  selectedOppId?: number | null;
  onClearSelection?: () => void;
}

const OpportunitySearchCard: React.FC<OpportunitySearchCardProps> = ({
  onSelectOpportunity,
  selectedOpportunity,
  selectedOppId,
  onClearSelection,
}) => {
  const [searchQuery, setSearchQuery] = useState(selectedOpportunity?.company_name || "");
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [results, setResults] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  // isEditing is true when search mode is active, false when an opportunity is selected
  const [isEditing, setIsEditing] = useState(!selectedOpportunity && !selectedOppId);

  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external selectedOpportunity changes
  useEffect(() => {
    if (selectedOpportunity) {
      setSearchQuery(selectedOpportunity.company_name);
      setIsEditing(false);
      setResults([]);
      setHasSearched(false);
    } else {
      setSearchQuery("");
      setIsEditing(true);
      setResults([]);
      setHasSearched(false);
    }
  }, [selectedOpportunity]);

  const fetchOpportunities = useCallback(
    async (query: string, batch: string, type: string) => {
      const q = query.trim();
      const b = batch.trim();
      const t = type !== "All" ? type.trim() : "";

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

  // Debounced search trigger (300ms) only when in editing mode
  useEffect(() => {
    if (!isEditing && selectedOpportunity) {
      return;
    }
    const timer = setTimeout(() => {
      fetchOpportunities(searchQuery, selectedBatch, typeFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedBatch, typeFilter, isEditing, selectedOpportunity, fetchOpportunities]);

  const handleRetry = () => {
    fetchOpportunities(searchQuery, selectedBatch, typeFilter);
  };

  const handleInputClickOrFocus = () => {
    if (!isEditing) {
      setIsEditing(true);
      if (searchQuery.trim()) {
        fetchOpportunities(searchQuery, selectedBatch, typeFilter);
      }
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setIsEditing(true);
    setResults([]);
    setHasSearched(false);
    setSelectedBatch("");
    setTypeFilter("All");
    if (onClearSelection) {
      onClearSelection();
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSelect = (opp: OpportunityItem) => {
    setIsEditing(false);
    setSearchQuery(opp.company_name);
    setResults([]);
    setHasSearched(false);
    onSelectOpportunity(opp);
  };

  const effectiveSelectedId = selectedOpportunity?.id || selectedOppId;

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
              Search Company / Placement Opportunity
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b" }}>
              {selectedOpportunity && !isEditing
                ? "Click the search bar to edit or search for a different company"
                : "Search by company name, role, skill, or batch to auto-fill notice fields"}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Search Input & Optional Filters Row */}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          flexWrap: "wrap",
          alignItems: "center",
          mb: isEditing || !selectedOpportunity ? 2 : 0,
          width: "100%",
        }}
      >
        <TextField
          inputRef={inputRef}
          size="small"
          placeholder="Search company, role, skill, batch (e.g. Infosys, Software, Java, 2027)..."
          value={searchQuery}
          onChange={(e) => {
            if (!isEditing) setIsEditing(true);
            setSearchQuery(e.target.value);
          }}
          onClick={handleInputClickOrFocus}
          onFocus={handleInputClickOrFocus}
          sx={{
            flex: 1,
            minWidth: { xs: "100%", sm: 280 },
            "& .MuiOutlinedInput-root": {
              bgcolor: !isEditing && selectedOpportunity ? "#f8fafc" : "#ffffff",
              cursor: !isEditing && selectedOpportunity ? "pointer" : "text",
              fontWeight: !isEditing && selectedOpportunity ? 600 : 400,
              color: !isEditing && selectedOpportunity ? "#1e293b" : "inherit",
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "#3b82f6",
              },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon size={18} color={selectedOpportunity && !isEditing ? "#2563eb" : "#94a3b8"} />
              </InputAdornment>
            ),
            endAdornment: (searchQuery || selectedOpportunity) ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  sx={{ p: 0.5, color: "#64748b", "&:hover": { color: "#0f172a" } }}
                  aria-label="Clear selection and search"
                >
                  <X size={16} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />

        {/* Filters visible only in Search / Editing mode */}
        {(isEditing || !selectedOpportunity) && (
          <>
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
          </>
        )}
      </Box>

      {/* When Opportunity is Selected and not currently editing: Show clean Selected Opportunity Summary */}
      {selectedOpportunity && !isEditing && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 2.5,
            bgcolor: "#eff6ff",
            border: "1px solid #bfdbfe",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: "#dbeafe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#1d4ed8",
                flexShrink: 0,
              }}
            >
              <Building2 size={22} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>
                Selected Opportunity
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e3a8a", lineHeight: 1.2 }}>
                {selectedOpportunity.company_name}
              </Typography>
              <Typography variant="body2" sx={{ color: "#2563eb", fontWeight: 500, mt: 0.3 }}>
                {selectedOpportunity.designation} • Batch {selectedOpportunity.batch}
                {selectedOpportunity.placement_internship ? ` • ${selectedOpportunity.placement_internship}` : ""}
                {selectedOpportunity.emolument_display && selectedOpportunity.emolument_display !== "Not specified"
                  ? ` • ${selectedOpportunity.emolument_display}`
                  : ""}
              </Typography>
              {selectedOpportunity.eligible_departments && selectedOpportunity.eligible_departments.length > 0 && (
                <Typography variant="caption" sx={{ color: "#64748b", display: "block", mt: 0.5 }}>
                  Eligible: {selectedOpportunity.eligible_departments.join(", ")}
                </Typography>
              )}
            </Box>
          </Box>
          <Chip
            label="Notice auto-filled below"
            size="small"
            sx={{ bgcolor: "#dbeafe", color: "#1e40af", fontWeight: 600, fontSize: "12px" }}
          />
        </Box>
      )}

      {/* Results & Status Section (Shown when in search/editing mode) */}
      {(isEditing || !selectedOpportunity) && (
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
                }}
              >
                {results.map((opp) => {
                  const isSelected = effectiveSelectedId === opp.id;

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
                      onClick={() => handleSelect(opp)}
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
                Try: Infosys • Software • Java • Batch 2027
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default OpportunitySearchCard;
