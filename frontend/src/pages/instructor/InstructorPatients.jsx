import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Box,
  Toolbar,
  Typography,
  Paper,
  Dialog,
  DialogContent,
  DialogTitle,
  Switch,
  Tooltip,
  Avatar,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { fetchUserAttributes } from "aws-amplify/auth";
import { apiGet, apiPost, apiPut } from "../../utils/apiClient";
import {
  MRT_TableContainer,
  useMaterialReactTable,
} from "material-react-table";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import InstructorNewPatient from "./InstructorNewPatient";
import InstructorEditPatients from "./InstructorEditPatients";
import { titleCase } from "../../utils/textFormatting";

function groupTitleCase(str) {
  if (typeof str !== "string") {
    return str;
  }
  const words = str.split(" ");
  return words
    .map((word, index) => {
      if (index === 0) {
        return word.toUpperCase(); // First word entirely in uppercase
      } else {
        return word.charAt(0).toUpperCase() + word.slice(1); // Only capitalize first letter, keep the rest unchanged
      }
    })
    .join(" ");
}

const InstructorPatients = ({ groupName, simulation_group_id }) => {
  const [data, setData] = useState([]);
  const [openNewPatientDialog, setOpenNewPatientDialog] = useState(false);
  const [openEditPatientDialog, setOpenEditPatientDialog] = useState(false);
  const [openDuplicatePatientDialog, setOpenDuplicatePatientDialog] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [duplicatePatient, setDuplicatePatient] = useState(null);
  const [duplicatePatientName, setDuplicatePatientName] = useState("");
  const [duplicateDestinationGroupId, setDuplicateDestinationGroupId] = useState("");
  const [instructorGroups, setInstructorGroups] = useState([]);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [profilePictures, setProfilePictures] = useState({});
  const [expandedPatient, setExpandedPatient] = useState(null);
  const [ingestionStatus, setIngestionStatus] = useState({});
  const [voiceSettings, setVoiceSettings] = useState({ adminVoiceEnabled: true, instructorVoiceEnabled: true });
  const [instructorVoiceEnabled, setInstructorVoiceEnabled] = useState(true);

  const handleExpandRow = async (patientId) => {
    if (expandedPatient === patientId) {
      setExpandedPatient(null); // Collapse if already expanded
      return;
    }

    try {
      const ingestionData = await apiGet("instructor/ingestion_status", {
        patient_id: patientId,
        simulation_group_id,
      });
      setIngestionStatus((prev) => ({ ...prev, [patientId]: ingestionData }));
    } catch (error) {
      console.error("Error fetching ingestion status:", error);
      toast.error("Failed to fetch ingestion status");
    }

    setExpandedPatient(patientId);
  };

  // Toast function to display success messages
  const showSuccessToast = (message) => {
    toast.success(message, {
      position: "top-center",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: "colored",
    });
  };

  const handleSwitchChange = async (patientId, currentStatus) => {
    // Update the LLM Completion state in `data`
    setData((prevData) =>
      prevData.map((patient) =>
        patient.patient_id === patientId
          ? { ...patient, llm_completion: !currentStatus }
          : patient
      )
    );

    try {
      await apiPut("instructor/toggle_llm_completion", undefined, {
        patient_id: patientId,
      });
    } catch (error) {
      console.error("Error updating LLM completion status:", error);
      toast.error("Failed to update LLM completion status");
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "patient_name",
        header: "Patient Name",
        Cell: ({ cell, row }) => (
          <Box display="flex" alignItems="center">
            <Avatar
              src={profilePictures[row.original.patient_id] || ""}
              alt={cell.getValue()}
              sx={{
                marginRight: 1,
                width: 40,
                height: 40,
                bgcolor: "#f0fdf4",
                color: "#065f46",
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            />
            <Typography
              variant="body1"
              sx={{ fontWeight: 500, color: "#111827" }}
            >
              {titleCase(cell.getValue())}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "patient_age",
        header: "Age",
      },
      {
        accessorKey: "patient_gender",
        header: "Gender",
      },
      {
        accessorKey: "llm_completion",
        header: "LLM Completion",
        Cell: ({ row }) => (
          <Tooltip title="Turn on/off if the LLM evaluates the student">
            <Switch
              checked={row.original.llm_completion ?? false}
              onChange={() =>
                handleSwitchChange(
                  row.original.patient_id,
                  row.original.llm_completion
                )
              }
              color="primary"
            />
          </Tooltip>
        ),
      },
      {
        accessorKey: "actions",
        header: "Actions",
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              onClick={() => handleEditClick(row.original)}
              sx={{
                backgroundColor: "#10b981",
                textTransform: "none",
                fontWeight: 600,
                borderRadius: "10px",
                "&:hover": { backgroundColor: "#059669" },
              }}
            >
              Edit
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleDuplicateClick(row.original)}
              sx={{
                color: "#047857",
                borderColor: "#10b981",
                textTransform: "none",
                fontWeight: 600,
                borderRadius: "10px",
                "&:hover": { borderColor: "#059669", backgroundColor: "#f0fdf4" },
              }}
            >
              Duplicate
            </Button>
          </Box>
        ),
      },
      {
        accessorKey: "ingestion_status",
        header: "Ingestion Status",
        Cell: ({ row }) => {
          const patientId = row.original.patient_id;
          const isExpanded = expandedPatient === patientId;
          const files = ingestionStatus[patientId] || {};

          return (
            <>
              <Button
                variant="contained"
                size="small"
                onClick={() => handleExpandRow(patientId)}
                sx={{
                  backgroundColor: "#10b981",
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: "8px",
                  "&:hover": { backgroundColor: "#059669" },
                }}
              >
                {isExpanded ? "Hide" : "Check"}
              </Button>
              {isExpanded && (
                <TableContainer
                  component={Paper}
                  sx={{
                    marginTop: 1,
                    borderRadius: "12px",
                    boxShadow: "0 2px 4px -1px rgba(0,0,0,0.05)",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: "#f9fafb" }}>
                        <TableCell
                          sx={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            letterSpacing: ".05em",
                            textTransform: "uppercase",
                            color: "#374151",
                          }}
                        >
                          File
                        </TableCell>
                        <TableCell
                          sx={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            letterSpacing: ".05em",
                            textTransform: "uppercase",
                            color: "#374151",
                          }}
                        >
                          Status
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(files).length > 0 ? (
                        Object.entries(files).map(([filename, status]) => (
                          <TableRow
                            key={filename}
                            hover
                            sx={{ "&:hover": { backgroundColor: "#f0fdf4" } }}
                          >
                            <TableCell
                              sx={{ fontSize: "0.8rem", color: "#111827" }}
                            >
                              {filename}
                            </TableCell>
                            <TableCell
                              sx={{ fontSize: "0.8rem", color: "#4b5563" }}
                            >
                              {status}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            align="center"
                            sx={{ py: 3, color: "#6b7280" }}
                          >
                            No files found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          );
        },
      },
    ],
    // Row expansion intentionally uses the latest handler without rebuilding
    // all table columns on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profilePictures, expandedPatient, ingestionStatus]
  );

  const table = useMaterialReactTable({
    autoResetPageIndex: false,
    columns,
    data,
    enableRowOrdering: true,
    enableSorting: false,
    initialState: { pagination: { pageSize: 1000, pageIndex: 1 } },
    muiRowDragHandleProps: ({ table }) => ({
      onDragEnd: () => {
        const { draggingRow, hoveredRow } = table.getState();
        if (hoveredRow && draggingRow) {
          data.splice(
            hoveredRow.index,
            0,
            data.splice(draggingRow.index, 1)[0]
          );
          setData([...data]);
        }
      },
    }),
  });

  const fetchPatientsAndProfilePictures = async () => {
    try {
      const patientData = await apiGet("instructor/view_patients", {
        simulation_group_id,
      });
      setData(patientData);

      // Fetch profile pictures
      const profilePics = await apiPost(
        "instructor/get_profile_pictures",
        { patient_ids: patientData.map((p) => p.patient_id) },
        { simulation_group_id }
      );
      setProfilePictures(profilePics);
    } catch (error) {
      console.error("Error fetching patients or profile pictures:", error);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchPatientsAndProfilePictures();
    fetchVoiceSettings();
    // These loaders intentionally run only when the group changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation_group_id]);

  const fetchVoiceSettings = async () => {
    try {
      const { email } = await fetchUserAttributes();
      const data = await apiGet("instructor/groups", { email });
      const currentGroup = data.find(g => g.simulation_group_id === simulation_group_id);
      if (currentGroup) {
        setVoiceSettings({
          adminVoiceEnabled: currentGroup.admin_voice_enabled !== false,
          instructorVoiceEnabled: currentGroup.instructor_voice_enabled !== false
        });
        setInstructorVoiceEnabled(currentGroup.instructor_voice_enabled !== false);
      }
    } catch (error) {
      console.error("Error fetching voice settings:", error);
    }
  };

  const updateVoiceSettings = async () => {
    try {
      await apiPost("instructor/update_voice_settings", undefined, {
        simulation_group_id,
        instructor_voice_enabled: instructorVoiceEnabled,
      });
      toast.success("Voice settings updated successfully", {
        position: "top-center",
        autoClose: 2000,
        theme: "colored",
      });
    } catch (error) {
      console.error("Error updating voice settings:", error);
      toast.error("Error updating voice settings", {
        position: "top-center",
        autoClose: 2000,
        theme: "colored",
      });
    }
  };

  const handleEditClick = (patientData) => {
    setSelectedPatient(patientData);
    setOpenEditPatientDialog(true);
  };

  const handleCloseEditPatientDialog = () => {
    setSelectedPatient(null);
    setOpenEditPatientDialog(false);
    fetchPatientsAndProfilePictures(); // Refresh data after edit
  };

  const handleDuplicateClick = async (patientData) => {
    setDuplicatePatient(patientData);
    setDuplicatePatientName(`Copy of ${patientData.patient_name}`);
    setDuplicateDestinationGroupId(simulation_group_id);
    setOpenDuplicatePatientDialog(true);

    try {
      const { email } = await fetchUserAttributes();
      const groups = await apiGet("instructor/groups", { email });
      setInstructorGroups(groups);
    } catch (error) {
      console.error("Error fetching instructor groups:", error);
      toast.error("Failed to load simulation groups");
    }
  };

  const handleCloseDuplicatePatientDialog = () => {
    if (isDuplicating) return;
    setOpenDuplicatePatientDialog(false);
    setDuplicatePatient(null);
    setDuplicatePatientName("");
    setDuplicateDestinationGroupId("");
  };

  const handleDuplicatePatient = async () => {
    if (!duplicatePatient || !duplicateDestinationGroupId || !duplicatePatientName.trim()) {
      return;
    }

    setIsDuplicating(true);
    try {
      const duplicatedPatient = await apiPost(
        "instructor/duplicate_patient",
        { patient_name: duplicatePatientName.trim() },
        {
          source_patient_id: duplicatePatient.patient_id,
          destination_simulation_group_id: duplicateDestinationGroupId,
        }
      );
      const destinationGroup = instructorGroups.find(
        (group) => group.simulation_group_id === duplicateDestinationGroupId
      );

      setOpenDuplicatePatientDialog(false);
      setDuplicatePatient(null);
      setDuplicatePatientName("");
      setDuplicateDestinationGroupId("");
      toast.success(
        `${duplicatedPatient.patient_name} duplicated to ${destinationGroup?.group_name || groupName}`
      );
      if (duplicateDestinationGroupId === simulation_group_id) {
        await fetchPatientsAndProfilePictures();
      }
    } catch (error) {
      console.error("Error duplicating patient:", error);
      toast.error(error.message || "Failed to duplicate patient");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleOpenNewPatientDialog = () => setOpenNewPatientDialog(true);
  const handleCloseNewPatientDialog = () => setOpenNewPatientDialog(false);

  const handleSaveChanges = async () => {
    try {
      const { email } = await fetchUserAttributes();

      const updatePromises = data.map((patient, index) => {
        const patientNumber = index + 1;
        return apiPut(
          "instructor/reorder_patient",
          { patient_name: patient.patient_name },
          {
            patient_id: patient.patient_id,
            patient_number: patientNumber,
            instructor_email: email,
          }
        );
      });

      await Promise.all(updatePromises);
      toast.success("Patient Order Updated Successfully", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error("An error occurred while saving changes", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
    }
  };

  const onPatientCreated = async (newPatient) => {
    setData((prevData) => [...prevData, newPatient]);
    await fetchPatientsAndProfilePictures();
  };

  const onPatientUpdated = async () => {
    await fetchPatientsAndProfilePictures();
  };

  return (
    <Box
      component="main"
      sx={{
        flexGrow: 1,
        p: 3,
        mt: 1,
        overflow: "auto",
        backgroundColor: "#ffffff",
      }}
    >
      <Toolbar />
      <Typography
        color="black"
        fontStyle="semibold"
        textAlign="left"
        variant="h6"
        sx={{ fontWeight: 600, color: "#111827", mb: 2 }}
      >
        {groupTitleCase(groupName)}
      </Typography>
      <Paper
        sx={{
          width: "100%",
          maxWidth: "1200px",
          mx: "auto",
          overflow: "hidden",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          backgroundColor: "white",
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.05)",
          p: 2,
        }}
      >
        <Box sx={{ maxHeight: 480, overflowY: "auto", pr: 1 }}>
          <MRT_TableContainer table={table} />
        </Box>
        <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end", maxWidth: "1200px", mx: "auto" }}>
          <FormControlLabel
            control={
              <Switch 
                size="small"
                checked={instructorVoiceEnabled && voiceSettings.adminVoiceEnabled} 
                onChange={async (e) => {
                  setInstructorVoiceEnabled(e.target.checked);
                  await updateVoiceSettings();
                }}
                disabled={!voiceSettings.adminVoiceEnabled}
              />
            }
            label={`Enable voice conversations ${!voiceSettings.adminVoiceEnabled ? '(Disabled by Admin)' : ''}`}
            sx={{
              color: voiceSettings.adminVoiceEnabled ? "inherit" : "text.disabled",
              fontSize: "0.875rem",
            }}
          />
        </Box>
      </Paper>
      <Box
        sx={{
          mt: 3,
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: "1200px",
          mx: "auto",
        }}
      >
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenNewPatientDialog}
            sx={{
              borderRadius: "10px",
              textTransform: "none",
              fontWeight: 600,
              backgroundColor: "#10b981",
              "&:hover": { backgroundColor: "#059669" },
            }}
          >
            Create New Patient
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveChanges}
            sx={{
              borderRadius: "10px",
              textTransform: "none",
              fontWeight: 600,
              backgroundColor: "#10b981",
              "&:hover": { backgroundColor: "#059669" },
            }}
          >
            Save Changes
          </Button>
        </Box>
        

      </Box>
      <Dialog
        open={openNewPatientDialog}
        onClose={handleCloseNewPatientDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Create New Patient</DialogTitle>
        <DialogContent style={{ overflow: "hidden" }}>
          <InstructorNewPatient
            data={data}
            simulation_group_id={simulation_group_id}
            onClose={handleCloseNewPatientDialog}
            onPatientCreated={onPatientCreated}
            showSuccessToast={showSuccessToast}
          />
        </DialogContent>
        {/* <DialogActions>
          <Button onClick={handleCloseNewPatientDialog} color="primary">
            Cancel
          </Button>
        </DialogActions> */}
      </Dialog>

      <Dialog
        open={openEditPatientDialog}
        onClose={handleCloseEditPatientDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Edit Patient</DialogTitle>
        <DialogContent style={{ overflow: "hidden" }}>
          <InstructorEditPatients
            patientData={selectedPatient}
            simulation_group_id={simulation_group_id}
            onClose={handleCloseEditPatientDialog}
            onPatientUpdated={onPatientUpdated}
            showSuccessToast={showSuccessToast}
          />
        </DialogContent>
        {/* <DialogActions>
          <Button onClick={handleCloseEditPatientDialog} color="primary">
            Cancel
          </Button>
        </DialogActions> */}
      </Dialog>

      <Dialog
        open={openDuplicatePatientDialog}
        onClose={handleCloseDuplicatePatientDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Duplicate Patient</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "16px !important" }}>
          <TextField
            autoFocus
            label="Patient Name"
            value={duplicatePatientName}
            onChange={(event) => setDuplicatePatientName(event.target.value)}
            disabled={isDuplicating}
            fullWidth
          />
          <FormControl fullWidth disabled={isDuplicating}>
            <InputLabel id="duplicate-destination-group-label">Simulation Group</InputLabel>
            <Select
              labelId="duplicate-destination-group-label"
              label="Simulation Group"
              value={duplicateDestinationGroupId}
              onChange={(event) => setDuplicateDestinationGroupId(event.target.value)}
            >
              {instructorGroups.map((group) => (
                <MenuItem key={group.simulation_group_id} value={group.simulation_group_id}>
                  {groupTitleCase(group.group_name)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={handleCloseDuplicatePatientDialog} disabled={isDuplicating}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleDuplicatePatient}
              disabled={
                isDuplicating ||
                !duplicateDestinationGroupId ||
                !duplicatePatientName.trim()
              }
              sx={{
                backgroundColor: "#10b981",
                textTransform: "none",
                fontWeight: 600,
                "&:hover": { backgroundColor: "#059669" },
              }}
            >
              {isDuplicating ? "Duplicating..." : "Duplicate"}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </Box>
  );
};

export default InstructorPatients;
