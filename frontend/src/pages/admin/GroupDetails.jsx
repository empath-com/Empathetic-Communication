import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../../utils/apiClient";

import {
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Typography,
  Paper,
  FormControlLabel,
  Toolbar,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  DialogContentText,
  Autocomplete,
  TextField,
} from "@mui/material";

import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { titleCase } from "../../utils/textFormatting";

const GroupDetails = ({ group, onBack }) => {
  const groupStatus = JSON.parse(group.status);
  const [activeInstructors, setActiveInstructors] = useState([]);
  const [isActive, setIsActive] = useState(groupStatus);
  const [empathyEnabled, setEmpathyEnabled] = useState(false);
  const [adminVoiceEnabled, setAdminVoiceEnabled] = useState(true);
  const [instructorVoiceEnabled, setInstructorVoiceEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [allInstructors, setAllInstructors] = useState([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [useGlobalEmpathyDefaults, setUseGlobalEmpathyDefaults] = useState(true);
  const [globalEmpathyPrompt, setGlobalEmpathyPrompt] = useState("");
  const [globalEmpathyTool, setGlobalEmpathyTool] = useState("CARE");
  const [empathyPromptOverride, setEmpathyPromptOverride] = useState("");
  const [empathyToolOverride, setEmpathyToolOverride] = useState("CARE");

  // new declaration for being able to change group name
  const [groupName, setGroupName] = useState(group.group_name || "");



  useEffect(() => {
    const fetchActiveInstructors = async () => {
      try {
        const data = await apiGet("admin/groupInstructors", {
          simulation_group_id: group.id,
        });
        setActiveInstructors(data);
      } catch (error) {
        console.error("Error fetching groups:", error);
      }
    };
    const fetchInstructors = async () => {
      try {
        //replace if analytics for admin actions is needed
        const data = await apiGet("admin/instructors", {
          instructor_email: "replace",
        });
        setAllInstructors(data);
      } catch (error) {
        console.error("Error fetching groups:", error);
      }
    };

    const fetchGlobalEmpathyDefaults = async () => {
      try {
        const data = await apiGet("admin/empathy_prompts");
        setGlobalEmpathyPrompt(data.current_prompt || "");
        setGlobalEmpathyTool(data.current_empathy_tool || "CARE");
      } catch (error) {
        console.error("Error fetching global empathy defaults:", error);
      }
    };
    fetchActiveInstructors();
    fetchInstructors();
    fetchGlobalEmpathyDefaults();

    // Fetch empathy_enabled status
    const fetchEmpathyStatus = async () => {
      try {
        const data = await apiGet("admin/simulation_groups");
        const currentGroup = data.find(g => g.simulation_group_id === group.id);
        if (currentGroup) {
          const hasToolOverride = !!currentGroup.empathy_tool_override;
          const hasPromptOverride = !!currentGroup.empathy_prompt_override;
          setGroupName(currentGroup.group_name || "");
          setEmpathyEnabled(currentGroup.empathy_enabled !== false);
          setAdminVoiceEnabled(currentGroup.admin_voice_enabled !== false);
          setInstructorVoiceEnabled(currentGroup.instructor_voice_enabled !== false);
          setUseGlobalEmpathyDefaults(!(hasToolOverride || hasPromptOverride));
          setEmpathyToolOverride(currentGroup.empathy_tool_override || "CARE");
          setEmpathyPromptOverride(currentGroup.empathy_prompt_override || "");
        }
      } catch (error) {
        console.error("Error fetching empathy status:", error);
      }
    };

    fetchEmpathyStatus();
    setLoading(false);
  }, [group.id]);

  const handleConfirmDeleteOpen = () => {
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDeleteClose = () => {
    setConfirmDeleteOpen(false);
  };

  const handleConfirmDelete = async () => {
    handleConfirmDeleteClose();
    handleDelete();
  };

  const handleInstructorsChange = (event, newValue) => {
    // Filter out duplicates
    const uniqueInstructors = Array.from(
      new Map(
        newValue.map((instructor) => [instructor.user_email, instructor])
      ).values()
    );
    setActiveInstructors(uniqueInstructors);
  };

  const handleStatusChange = (event) => {
    setIsActive(event.target.checked);
  };

  const handleDelete = async () => {
    try {
      await apiDelete("admin/delete_group", {
        simulation_group_id: group.id,
      });
      toast.success("Simulation Group Successfully Deleted", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      setTimeout(function () {
        onBack();
      }, 1000);
    } catch (error) {
      console.error("Failed to delete group:", error);
      toast.error("update enrolment Failed", {
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

  const handleSave = async () => {
    try {
      // Delete existing enrollments
      await apiDelete("admin/delete_group_instructor_enrolments", {
        simulation_group_id: group.id,
      });

      // Enroll new instructors in parallel
      const enrollPromises = activeInstructors.map((instructor) =>
        apiPost("admin/enroll_instructor", undefined, {
          simulation_group_id: group.id,
          instructor_email: instructor.user_email,
        })
      );

      await Promise.all(enrollPromises);
      toast.success("Enrolment Updated!", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });

      // Update group access
      await apiPost(
        "admin/updateGroupAccess",
        {
          use_global_empathy_defaults: useGlobalEmpathyDefaults,
          empathy_tool_override: useGlobalEmpathyDefaults ? null : empathyToolOverride,
          empathy_prompt_override: useGlobalEmpathyDefaults ? null : empathyPromptOverride,
        },
        {
          simulation_group_id: group.id,
          group_name: groupName,
          access: isActive,
          empathy_enabled: empathyEnabled,
          admin_voice_enabled: adminVoiceEnabled,
          instructor_voice_enabled: instructorVoiceEnabled,
        }
      );

      console.log("Group access updated successfully");
      // Close the dialog after successful save
      onBack();
    } catch (error) {
      console.error("Error in handleSave:", error);
      toast.error("An error occurred", {
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

  return (
    <>
      {!loading && (
        <Box
          component="main"
          sx={{ flexGrow: 1, p: 3, marginTop: 1, textAlign: "left" }}
        >
          <Toolbar />
          <Paper sx={{ padding: 2, marginBottom: 2 }}>
            <TextField
              label="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              fullWidth
              variant="outlined"
              sx={{ mb: 2 }}
              inputProps={{
                maxLength: 50
              }}
            />

            <Divider sx={{ p: 1, marginBottom: 3 }} />
            <FormControl fullWidth sx={{ marginBottom: 2 }}>
              <Autocomplete
                multiple
                id="autocomplete-instructors"
                options={allInstructors}
                getOptionLabel={(option) =>
                  option.first_name && option.last_name
                    ? `${titleCase(option.first_name)} ${titleCase(
                      option.last_name
                    )}`
                    : option.user_email
                }
                value={activeInstructors}
                onChange={handleInstructorsChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Active Instructors"
                    variant="outlined"
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.user_email}
                      {...getTagProps({ index })}
                      key={option.user_email}
                    />
                  ))
                }
              />
            </FormControl>

            <FormControlLabel
              control={
                <Switch checked={isActive} onChange={handleStatusChange} />
              }
              label={isActive ? "Active" : "Inactive"}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={empathyEnabled}
                  onChange={(e) => setEmpathyEnabled(e.target.checked)}
                />
              }
              label="Enable empathy coach"
            />
            <Divider sx={{ my: 2 }} />
            <Typography sx={{ fontWeight: 600, mb: 1 }}>
              Empathy Evaluation Defaults
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
              This group can inherit global empathy settings or use a custom prompt and tool.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={useGlobalEmpathyDefaults}
                  onChange={(e) => {
                    const useGlobal = e.target.checked;
                    setUseGlobalEmpathyDefaults(useGlobal);
                    if (useGlobal) {
                      setEmpathyToolOverride(globalEmpathyTool || "CARE");
                      setEmpathyPromptOverride(globalEmpathyPrompt || "");
                    }
                  }}
                />
              }
              label="Use global empathy defaults"
            />
            {!useGlobalEmpathyDefaults && (
              <>
                <FormControl fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel id="group-empathy-tool-label">Group Evaluation Tool</InputLabel>
                  <Select
                    labelId="group-empathy-tool-label"
                    value={empathyToolOverride}
                    label="Group Evaluation Tool"
                    onChange={(e) => setEmpathyToolOverride(e.target.value)}
                  >
                    <MenuItem value="CARE">CARE Measure</MenuItem>
                    <MenuItem value="PRISM">PRISM (SDT-informed)</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Group Empathy Prompt Override"
                  value={empathyPromptOverride}
                  onChange={(e) => setEmpathyPromptOverride(e.target.value)}
                  fullWidth
                  multiline
                  rows={4}
                  sx={{ mb: 2 }}
                  inputProps={{ maxLength: 4000 }}
                  helperText="This prompt overrides the global empathy prompt for this group only."
                />
              </>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={adminVoiceEnabled}
                  onChange={(e) => setAdminVoiceEnabled(e.target.checked)}
                />
              }
              label="Enable voice (Admin control)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={instructorVoiceEnabled && adminVoiceEnabled}
                  onChange={(e) => setInstructorVoiceEnabled(e.target.checked)}
                  disabled={!adminVoiceEnabled}
                />
              }
              label="Enable voice (Instructor control)"
              sx={{
                color: adminVoiceEnabled ? "inherit" : "text.disabled",
              }}
            />
          </Paper>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Button
                variant="contained"
                onClick={onBack}
                sx={{ width: "30%" }}
              >
                Back
              </Button>
            </Grid>
            <Grid item xs={6} sx={{ textAlign: "right" }}>
              <Button
                variant="contained"
                color="red"
                onClick={handleConfirmDeleteOpen}
                sx={{ width: "30%", marginRight: "15px" }}
              >
                Delete
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSave}
                sx={{ width: "30%" }}
              >
                Save
              </Button>
            </Grid>
          </Grid>
          <Dialog
            open={confirmDeleteOpen}
            onClose={handleConfirmDeleteClose}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
          >
            <DialogTitle id="alert-dialog-title">
              {"Confirm Delete"}
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                Are you sure you want to delete this group? This action cannot
                be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleConfirmDeleteClose} color="primary">
                Cancel
              </Button>
              <Button onClick={handleConfirmDelete} color="error">
                Confirm
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
      <ToastContainer />
    </>
  );
};

export default GroupDetails;
