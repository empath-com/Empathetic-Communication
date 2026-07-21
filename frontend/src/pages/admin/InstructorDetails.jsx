import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../../utils/apiClient";

import {
  Typography,
  Box,
  Toolbar,
  Paper,
  Button,
  FormControl,
  Grid,
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

const InstructorDetails = ({ instructorData, onBack }) => {
  const instructor = instructorData;
  const [activeGroups, setActiveGroups] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    // Fetch all simulation groups
    const fetchGroups = async () => {
      try {
        const data = await apiGet("admin/simulation_groups");
        setAllGroups(data);
      } catch (error) {
        console.error("Error fetching groups:", error);
      }
    };

    // Fetch active groups for the instructor
    const fetchActiveGroups = async () => {
      try {
        const data = await apiGet("admin/instructorGroups", {
          instructor_email: instructorData.email,
        });
        setActiveGroups(data);
      } catch (error) {
        console.error("Error fetching active groups:", error);
      }
    };

    fetchGroups();
    fetchActiveGroups();
  }, [instructorData.email]);

  if (!instructor) {
    return <Typography>No data found for this instructor.</Typography>;
  }

  const handleConfirmDeleteOpen = () => setConfirmDeleteOpen(true);
  const handleConfirmDeleteClose = () => setConfirmDeleteOpen(false);

  const handleConfirmDelete = async () => {
    handleConfirmDeleteClose();
    handleDelete();
  };

  const handleDelete = async () => {
    try {
      await apiPost("admin/lower_instructor", undefined, {
        email: instructorData.email,
      });
      toast.success("Instructor Demoted Successfully", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      setTimeout(() => onBack(), 1000);
    } catch (error) {
      console.error("Error demoting instructor:", error);
    }
  };

  const handleSave = async () => {
    try {
      // Delete existing enrollments for the instructor
      await apiDelete("admin/delete_instructor_enrolments", {
        instructor_email: instructor.email,
      });
  
      // Enroll instructor in selected groups
      const enrollPromises = activeGroups.map((group) =>
        apiPost("admin/enroll_instructor", undefined, {
          simulation_group_id: group.simulation_group_id,
          instructor_email: instructor.email,
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
      <Box component="main" sx={{ flexGrow: 1, p: 3, marginTop: 1, textAlign: "left" }}>
        <Toolbar />
        <Paper sx={{ p: 2, marginBottom: 4, textAlign: "left" }}>
          <Typography variant="h5" sx={{ marginBottom: 2, p: 1 }}>
            Instructor: {titleCase(instructorData?.first_name)} {titleCase(instructorData?.last_name)}
          </Typography>
          <Divider sx={{ p: 1, marginBottom: 3 }} />
          <Typography variant="h7" sx={{ marginBottom: 1, p: 1 }}>
            Email: {instructorData.email}
          </Typography>
          <FormControl sx={{ width: "100%", marginBottom: 2, marginTop: 5 }}>
            <Autocomplete
              multiple
              id="active-groups-autocomplete"
              options={allGroups}
              value={activeGroups}
              getOptionLabel={(option) => option.group_name || ""}
              onChange={(event, newValue) => {
                const uniqueGroups = Array.from(
                  new Map(
                    newValue.map((group) => [group.simulation_group_id, group])
                  ).values()
                );
                setActiveGroups(uniqueGroups);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Active Groups"
                  variant="outlined"
                />
              )}
              isOptionEqualToValue={(option, value) =>
                option.simulation_group_id === value.simulation_group_id
              }
            />
          </FormControl>
        </Paper>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Button
              variant="contained"
              onClick={onBack}
              sx={{ width: "30%", mx: "left" }}
            >
              Back
            </Button>
          </Grid>
          <Grid item xs={6} container justifyContent="flex-end">
            <Button
              variant="contained"
              color="error"
              onClick={handleConfirmDeleteOpen}
              sx={{ width: "30%", mx: "right", mr: 2 }}
            >
              Delete
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              sx={{ width: "30%", mx: "right" }}
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
          <DialogTitle id="alert-dialog-title">{"Confirm Delete"}</DialogTitle>
          <DialogContent>
            <DialogContentText id="alert-dialog-description">
              Are you sure you want to delete this instructor? This action
              cannot be undone.
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
      <ToastContainer
        position="top-center"
        autoClose={1000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </>
  );
};

export default InstructorDetails;