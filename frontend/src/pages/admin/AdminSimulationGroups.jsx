import { useEffect, useState } from "react";
import { apiGet } from "../../utils/apiClient";
import {
  Typography,
  Box,
  Toolbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Button,
  TableFooter,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from "@mui/material";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SettingsIcon from "@mui/icons-material/Settings";
import AdminCreateSimulationGroup from "./AdminCreateSimulationGroup";
import GroupDetails from "./GroupDetails";

const createData = (
  groupName,
  accessCode,
  status,
  id,
  empathyMode,
  evaluationFramework
) => {
  return {
    groupName,
    accessCode,
    status,
    id,
    empathyMode,
    evaluationFramework,
  };
};

const evaluationFrameworkLabels = {
  CARE: "CARE Measure",
  CARE_RELAXED: "CARE Measure (Relaxed)",
  PRISM: "PRISM (SDT-informed)",
  PRISM_RELAXED: "PRISM (SDT-informed, Relaxed)",
  NURSE: "NURSE Framework",
  NURSE_RELAXED: "NURSE Framework (Relaxed)",
};

function getSimulationGroupInfo(groupsArray) {
  return groupsArray.map((group) => {
    const hasEmpathyOverride =
      group.empathy_prompt_override || group.empathy_tool_override;

    return createData(
      `${group.group_name}`,
      `${group.group_access_code}`,
      `${group.group_student_access}`,
      `${group.simulation_group_id}`,
      hasEmpathyOverride ? "Override" : "Default",
      hasEmpathyOverride
        ? evaluationFrameworkLabels[group.empathy_tool_override] || "Not set"
        : "Global default"
    );
  });
}

export const AdminSimulationGroups = () => {
  const [rows, setRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [loading, setLoading] = useState(true);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openDetailsDialog, setOpenDetailsDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Fetch groups from the server
  const refreshGroups = async () => {
    setLoading(true);
    try {
      const data = await apiGet("admin/simulation_groups");
      setRows(getSimulationGroupInfo(data));
    } catch (error) {
      console.error("Error fetching simulation groups:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshGroups(); // Initial fetch
  }, []);

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const filteredRows = rows.filter((row) =>
    row.groupName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleGroupClick = (group) => {
    setSelectedGroup(group);
    setOpenDetailsDialog(true);
  };

  const handleCopyAccessCode = async (accessCode) => {
    try {
      await navigator.clipboard.writeText(accessCode);
    } catch (error) {
      console.error("Error copying access code:", error);
    }
  };

  const handleCloseDetailsDialog = () => {
    setOpenDetailsDialog(false);
    setSelectedGroup(null);
  };

  const handleOpenCreateDialog = () => {
    setOpenCreateDialog(true);
  };

  const handleCloseCreateDialog = () => {
    setOpenCreateDialog(false);
  };

  return (
    <Box component="main" sx={{ flexGrow: 1, p: 2, marginTop: 0.5 }}>
      <Toolbar />
      <Paper
        sx={{
          width: "100%",
          overflow: "hidden",
          mt: 1,
          borderRadius: 4,
          p: 4,
          maxHeight: "85vh",
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.05)",
        }}
      >
        <Box
          sx={{
            pb: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexDirection: { xs: "column", sm: "row" },
            gap: 3,
          }}
        >
          <Box textAlign={{ xs: "center", sm: "left" }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                fontSize: "1.25rem",
                color: "#111827",
                mb: 0.5,
              }}
            >
              Simulation Groups
            </Typography>
            <Typography variant="body2" sx={{ color: "#6b7280" }}>
              Manage and monitor active training cohorts
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={handleOpenCreateDialog}
            endIcon={<AddCircleIcon />}
            sx={{
              backgroundColor: "#10b981",
              textTransform: "none",
              fontWeight: 600,
              px: 3,
              py: 1.25,
              borderRadius: "12px",
              fontSize: "0.95rem",
              boxShadow:
                "0 2px 4px -1px rgba(0,0,0,0.05), 0 4px 10px -1px rgba(0,0,0,0.1)",
              "&:hover": {
                backgroundColor: "#059669",
                boxShadow:
                  "0 4px 10px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.05)",
              },
            }}
          >
            Create Group
          </Button>
        </Box>
        <TableContainer
          sx={{
            maxHeight: "60vh",
            overflowY: "auto",
            px: { xs: 0.5, sm: 1 },
          }}
        >
          <TextField
            label="Search groups"
            variant="outlined"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Filter by name..."
            sx={{
              my: 2,
              width: "100%",
              maxWidth: 420,
              "& .MuiOutlinedInput-root": {
                borderRadius: "12px",
                backgroundColor: "#f9fafb",
                "& fieldset": { borderColor: "#e5e7eb" },
                "&:hover fieldset": { borderColor: "#10b981" },
                "&.Mui-focused": {
                  backgroundColor: "white",
                  boxShadow: "0 0 0 3px rgba(16,185,129,0.15)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#10b981",
                  borderWidth: 2,
                },
              },
              "& .MuiInputLabel-root.Mui-focused": { color: "#059669" },
            }}
            InputProps={{ sx: { fontSize: 14 } }}
            InputLabelProps={{ sx: { fontSize: 14 } }}
          />
          <Table aria-label="simulation group table" stickyHeader>
            {!loading ? (
              <>
                <TableHead>
                  <TableRow sx={{ backgroundColor: "#f9fafb" }}>
                    <TableCell
                      sx={{
                        width: "35%",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#374151",
                        borderBottom: "2px solid #e5e7eb",
                      }}
                    >
                      Group Name
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#374151",
                        borderBottom: "2px solid #e5e7eb",
                      }}
                    >
                      Access Code
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#374151",
                        borderBottom: "2px solid #e5e7eb",
                      }}
                    >
                      Status
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#374151",
                        borderBottom: "2px solid #e5e7eb",
                      }}
                    >
                      Empathy Config
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#374151",
                        borderBottom: "2px solid #e5e7eb",
                      }}
                    >
                      Evaluation Framework
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        width: 72,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#374151",
                        borderBottom: "2px solid #e5e7eb",
                      }}
                    >
                      Settings
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((row, index) => (
                      <TableRow
                        key={index}
                        sx={{
                          transition: "background-color .15s, box-shadow .2s",
                          "&:hover": { backgroundColor: "#f0fdf4" },
                        }}
                      >
                        <TableCell
                          sx={{
                            fontSize: "0.95rem",
                            color: "#111827",
                            fontWeight: 500,
                          }}
                        >
                          {row.groupName}
                        </TableCell>
                        <TableCell
                          sx={{
                            fontSize: "0.85rem",
                            color: "#4b5563",
                            fontFamily:
                              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          }}
                        >
                          <Box
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 0.5,
                              "& .copy-access-code": { opacity: 0 },
                              "&:hover .copy-access-code, &:focus-within .copy-access-code": {
                                opacity: 1,
                              },
                            }}
                          >
                            <span>{row.accessCode}</span>
                            <Tooltip title="Copy access code">
                              <IconButton
                                aria-label={`Copy access code ${row.accessCode}`}
                                className="copy-access-code"
                                size="small"
                                onClick={() => handleCopyAccessCode(row.accessCode)}
                                sx={{
                                  color: "#059669",
                                  transition: "opacity .15s",
                                }}
                              >
                                <ContentCopyIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "6px 12px",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              letterSpacing: ".05em",
                              textTransform: "uppercase",
                              borderRadius: "9999px",
                              backgroundColor:
                                row.status === "true" ? "#10b981" : "#d1d5db",
                              color:
                                row.status === "true" ? "white" : "#374151",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                            }}
                          >
                            {row.status === "true" ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell
                          sx={{
                            fontSize: "0.85rem",
                            color: "#374151",
                            fontWeight: 500,
                          }}
                        >
                          {row.empathyMode}
                        </TableCell>
                        <TableCell
                          sx={{
                            fontSize: "0.85rem",
                            color: "#374151",
                            fontWeight: 500,
                          }}
                        >
                          {row.evaluationFramework}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Open group settings">
                            <IconButton
                              aria-label={`Open settings for ${row.groupName}`}
                              onClick={() => handleGroupClick(row)}
                              size="small"
                              sx={{ color: "#4b5563" }}
                            >
                              <SettingsIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </>
            ) : (
              <TableBody>
                <TableRow>
                  <TableCell
                    colSpan={6}
                    sx={{
                      py: 8,
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    Loading groups...
                  </TableCell>
                </TableRow>
              </TableBody>
            )}
            <TableFooter>
              <TableRow>
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25]}
                  component="div"
                  count={filteredRows.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  sx={{
                    fontSize: 14,
                    minWidth: 400,
                    ".MuiTablePagination-toolbar": { px: 0 },
                    ".MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows":
                      {
                        fontSize: "0.65rem",
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#6b7280",
                      },
                  }}
                />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialog for Creating New Simulation Group */}
      <Dialog
        open={openCreateDialog}
        onClose={handleCloseCreateDialog}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: "20px" } }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          Create New Simulation Group
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <AdminCreateSimulationGroup
            setSelectedComponent={() => {
              setOpenCreateDialog(false);
              refreshGroups();
            }}
          />
        </DialogContent>
        <DialogActions sx={{ pb: 2, pr: 3 }}>
          <Button
            onClick={handleCloseCreateDialog}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog for Group Details */}
      <Dialog
        open={openDetailsDialog}
        onClose={handleCloseDetailsDialog}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: "20px" } }}
      >
        <DialogContent sx={{ p: 0 }}>
          {selectedGroup && (
            <GroupDetails
              group={selectedGroup}
              onBack={() => {
                handleCloseDetailsDialog();
                refreshGroups();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default AdminSimulationGroups;
