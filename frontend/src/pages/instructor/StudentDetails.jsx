import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { fetchUserAttributes } from "aws-amplify/auth";
import { apiGet, apiPut, apiDelete } from "../../utils/apiClient";
import { toast, ToastContainer } from "react-toastify";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import "react-toastify/dist/ReactToastify.css";
import PageContainer from "../Container";
import {
  Box,
  Typography,
  Divider,
  Button,
  Paper,
  IconButton,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Switch,
  FormControlLabel,
  Tooltip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import jsPDF from "jspdf";
import {
  formatMessagesForPDF,
  formatNotesForPDF,
  formatMessages,
} from "./utils/studentDetailsHelpers";

const handleBackClick = () => {
  window.history.back();
};

// Helper function to format notes consistently (UI display only)
const formatNotes = (noteText) => (
  <Box
    sx={{
      backgroundColor: "lightyellow",
      borderRadius: 2,
      p: 1,
      mt: 2,
      whiteSpace: "pre-line",
    }}
  >
    <Typography variant="body2" sx={{ fontWeight: "bold" }}>
      Notes:
    </Typography>
    <Typography variant="body1">{noteText || "No notes available."}</Typography>
  </Box>
);

const StudentDetails = () => {
  const { simulationGroupId: simulation_group_id, studentId } = useParams();
  const student = JSON.parse(localStorage.getItem("selectedStudent"));
  const [tabs, setTabs] = useState([]);
  const [sessions, setSessions] = useState({});
  const [activeTab, setActiveTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [completionStatuses, setCompletionStatuses] = useState([]);
  const [empathySummary, setEmpathySummary] = useState(null);
  const [empathyDialogOpen, setEmpathyDialogOpen] = useState(false);
  const [patientIds, setPatientIds] = useState({});
  const sessionRefs = useRef({});


  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await apiGet(
          "instructor/student_patients_messages",
          { simulation_group_id, student_email: student.email }
        );
        setSessions(data);
        setTabs(Object.keys(data)); // Tabs will represent patient names

        // Fetch patient IDs directly
        const patientsData = await apiGet(
          "instructor/view_patients",
          { simulation_group_id }
        );
        console.log('Patients data:', patientsData);

        // Create mapping of patient names to IDs
        const patientIdMap = {};
        patientsData.forEach(patient => {
          patientIdMap[patient.patient_name] = patient.patient_id;
        });

        console.log('Patient ID mapping:', patientIdMap);
        setPatientIds(patientIdMap);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchHistory();
  }, [simulation_group_id, student.email]);

  useEffect(() => {
    const fetchCompletionStatuses = async () => {
      try {
        const data = await apiGet(
          "instructor/get_completion_status",
          { simulation_group_id, student_email: student.email }
        );
        console.log('Completion statuses:', data);
        setCompletionStatuses(data); // Set state with completion statuses
      } catch (error) {
        console.error("Error fetching completion statuses:", error);
      }
    };

    fetchCompletionStatuses();
  }, [simulation_group_id, student.email]);

  const toggleCompletionStatus = async (studentInteractionId) => {
    try {
      const data = await apiPut(
        "instructor/toggle_completion",
        undefined,
        { student_interaction_id: studentInteractionId }
      );
      setCompletionStatuses((prevStatuses) =>
        prevStatuses.map((status) =>
          status.student_interaction_id === studentInteractionId
            ? { ...status, is_completed: data.is_completed }
            : status
        )
      );
    } catch (error) {
      console.error("Error toggling completion status:", error);
    }
  };

  const handleDialogOpen = () => {
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
  };

  const handleEmpathyDialogOpen = () => {
    setEmpathyDialogOpen(true);
  };

  const handleEmpathyDialogClose = () => {
    setEmpathyDialogOpen(false);
  };

  const handleUnenroll = async () => {
    try {
      const { email } = await fetchUserAttributes();
      await apiDelete(
        "instructor/delete_student",
        {
          simulation_group_id,
          user_email: student.email,
          instructor_email: email,
        }
      );
      toast.success("Student unenrolled successfully", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      setTimeout(() => {
        window.history.back();
      }, 1000);
    } catch (error) {
      toast.error("Failed to unenroll student", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      console.error("Error fetching data:", error);
    }
  };

  const handleDownloadChatPDF = (session, patientName) => {
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.setFontSize(12);
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 10;
    const maxLineWidth = pageWidth - 2 * margin;
    let yOffset = 10;

    pdf.text(`Session Chat: ${session.sessionName}`, margin, yOffset);
    yOffset += 10;

    const messages = formatMessagesForPDF(session.messages, studentId, patientName);

    messages.split("\n").forEach((line, index, lines) => {
      const splitLine = pdf.splitTextToSize(line, maxLineWidth);

      splitLine.forEach((textLine) => {
        if (yOffset > 280) {
          pdf.addPage();
          yOffset = 10;
        }
        pdf.text(textLine, margin, yOffset);
        yOffset += 8;
      });

      if (lines[index + 1]) {
        yOffset += 8;
      }
    });

    pdf.save(`${studentId}-${session.sessionName}-chat.pdf`);
  };

  const handleDownloadNotesPDF = (session) => {
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.setFontSize(12);
    const margin = 10;
    let yOffset = 10;

    pdf.text(`Session Notes: ${session.sessionName}`, margin, yOffset);
    yOffset += 10;

    const notes = formatNotesForPDF(session.notes);
    const notesContent = notes.split("\n");

    notesContent.forEach((line) => {
      if (yOffset > 280) {
        pdf.addPage();
        yOffset = 10;
      }
      pdf.text(line, margin, yOffset);
      yOffset += 8;
    });

    pdf.save(`${studentId}-${session.sessionName}-notes.pdf`);
  };

  const fetchEmpathySummary = async (patientId = null) => {
    try {
      console.log('fetchEmpathySummary called with patientId:', patientId);
      console.log('Current patientIds mapping:', patientIds);
      const queryParams = {
        session_id: "default",
        simulation_group_id,
        student_email: student.email,
      };
      if (patientId) {
        queryParams.patient_id = patientId;
        console.log(`Fetching empathy summary for specific patient: ${patientId}`);
      } else {
        console.log('Fetching overall empathy summary');
      }

      const data = await apiGet("instructor/empathy_summary", queryParams);
      console.log('Empathy summary response:', data);
      setEmpathySummary(data);
      handleEmpathyDialogOpen();
    } catch (error) {
      console.error("Error fetching empathy summary:", error);
      toast.error("Error fetching empathy summary", {
        position: "top-center",
        autoClose: 3000,
      });
    }
  };




  return (
    <>
      <PageContainer>
        <IconButton
          onClick={handleBackClick}
          sx={{ position: "absolute", top: 44, left: 30 }}
          aria-label="Go back"
        >
          <ArrowBackIcon />
        </IconButton>
        <Paper
          sx={{
            width: "100%",
            overflow: "auto",
            padding: 2,
            overflowY: "scroll",
            marginTop: 4,
          }}
        >
          <Box mb={2} sx={{ flexGrow: 1, p: 3, textAlign: "left", mt: 6 }}>
            <Typography variant="h5">Student Name: {studentId}</Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body1">Email: {student.email}</Typography>

            <Box sx={{ display: 'flex', gap: 2, marginBottom: 6 }}>
              <Button
                onClick={handleDialogOpen}
                variant="contained"
                color="primary"
              >
                Unenroll Student
              </Button>
              <Button
                onClick={() => fetchEmpathySummary()}
                variant="contained"
                color="primary"
              >
                View Overall Empathy Summary
              </Button>
            </Box>

            <Dialog
              open={dialogOpen}
              onClose={handleDialogClose}
              aria-labelledby="confirm-unenroll-dialog"
            >
              <DialogTitle id="confirm-unenroll-dialog">
                Confirm Unenroll
              </DialogTitle>
              <DialogContent>
                <DialogContentText>
                  Are you sure you want to unenroll {studentId} from this
                  simulation group?
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button onClick={handleDialogClose} color="primary">
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    handleDialogClose();
                    handleUnenroll();
                  }}
                  color="error"
                >
                  Confirm
                </Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={empathyDialogOpen}
              onClose={handleEmpathyDialogClose}
              maxWidth="md"
              fullWidth
            >
              <DialogTitle>
                Empathy Coach Summary - {studentId}
                {empathySummary?.patient_name && ` (Patient: ${empathySummary.patient_name})`}
              </DialogTitle>
              <DialogContent>
                {empathySummary ? (() => {
                  const tool = empathySummary.empathy_tool || 'CARE';
                  const toolLabel = tool === 'PRISM' ? 'PRISM Framework' : 'CARE Measure';
                  const criteriaRows = tool === 'PRISM'
                    ? [
                        ['prepare',     'P. Prepare — Orientation & framing'],
                        ['recognise',   'R. Recognise — Identifying patient cues'],
                        ['interact',    'I. Interact — Empathic engagement'],
                        ['self_assess', 'S. Self-Assess — In-conversation monitoring'],
                        ['master',      'M. Master — Integrated skill delivery'],
                      ]
                    : [
                        ['making_feel_at_ease',        'Making you feel at ease'],
                        ['letting_tell_story',         'Letting you tell your story'],
                        ['really_listening',           'Really listening'],
                        ['interested_in_whole_person', 'Being interested in you as a whole person'],
                        ['understanding_concerns',     'Fully understanding your concerns'],
                        ['showing_care_compassion',    'Showing care and compassion'],
                        ['being_positive',             'Being positive'],
                        ['explaining_clearly',         'Explaining things clearly'],
                        ['helping_take_control',       'Helping you take control'],
                        ['making_plan_of_action',      'Making a plan of action with you'],
                      ];
                  return (
                    <Box>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        {toolLabel} — Overall Performance
                      </Typography>
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="body1" sx={{ mb: 1 }}>
                          <strong>Total Criteria Hits:</strong> {empathySummary.total_criteria_hits || empathySummary.overall_score}
                        </Typography>
                        <Typography variant="body1" sx={{ mb: 1 }}>
                          <strong>Messages Evaluated:</strong> {empathySummary.total_messages_evaluated || empathySummary.empathy_interactions}
                        </Typography>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          <strong>Total Interactions:</strong> {empathySummary.total_interactions}
                        </Typography>
                      </Box>

                      <Typography variant="h6" sx={{ mb: 2 }}>
                        {toolLabel} Criterion Breakdown (hits / messages)
                      </Typography>
                      <Box sx={{ mb: 3 }}>
                        {criteriaRows.map(([key, label]) => (
                          <Typography key={key} variant="body2">
                            • {label}: {empathySummary[key] || 0} / {empathySummary.total_messages_evaluated || 0}
                          </Typography>
                        ))}
                      </Box>

                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Summary
                      </Typography>
                      <Paper sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                          {empathySummary.summary}
                        </Typography>
                      </Paper>
                    </Box>
                  );
                })() : (
                  <Typography>Loading empathy summary...</Typography>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={handleEmpathyDialogClose} color="primary">
                  Close
                </Button>
              </DialogActions>
            </Dialog>

            <Typography variant="h5" sx={{ mb: 2 }}>
              Chat History:
            </Typography>

            <Box
              sx={{
                borderBottom: 1,
                borderColor: "divider",
                overflowX: "auto",
              }}
            >
              <Tabs
                value={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
                variant="scrollable"
                scrollButtons="auto"
              >
                {tabs.map((tabName, index) => (
                  <Tab key={index} label={tabName} />
                ))}
              </Tabs>
            </Box>

            {sessions[tabs[activeTab]]?.length > 0 ? (
              sessions[tabs[activeTab]].map((session, index) => (
                <Accordion key={index}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{session.sessionName}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box
                      ref={(el) => (sessionRefs.current[session.sessionName] = el)}
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        maxHeight: 400,
                        overflowY: "auto",
                      }}
                    >
                      {formatMessages(session.messages, studentId, tabs[activeTab])}
                      {formatNotes(session.notes)}
                    </Box>

                    {/* Button for downloading only the chat responses */}
                    <Button
                      onClick={() => handleDownloadChatPDF(session, tabs[activeTab])}
                      variant="contained"
                      color="secondary"
                      sx={{ mt: 2, mr: 2 }}
                    >
                      Download Chat PDF
                    </Button>

                    {/* Button for downloading only the notes */}
                    <Button
                      onClick={() => handleDownloadNotesPDF(session)}
                      variant="contained"
                      color="secondary"
                      sx={{ mt: 2, mr: 2 }}
                    >
                      Download Notes PDF
                    </Button>

                    {/* Button for viewing patient-specific empathy summary */}
                    <Button
                      onClick={() => {
                        // Get the patient name for the current tab
                        const patientName = tabs[activeTab];
                        console.log(`Current tab: ${activeTab}, Patient name: ${patientName}`);
                        console.log('All patient IDs:', patientIds);

                        // Get the patient ID from our mapping
                        const patientId = patientIds[patientName];
                        console.log(`Looking up patient ID for ${patientName}: ${patientId}`);

                        if (patientId) {
                          console.log(`Calling fetchEmpathySummary with patientId: ${patientId}`);
                          fetchEmpathySummary(patientId);
                        } else {
                          console.error(`Patient ID not found for ${patientName}`);
                          toast.error("Could not find patient data", {
                            position: "top-center",
                            autoClose: 3000,
                          });
                        }
                      }}
                      variant="contained"
                      color="primary"
                      sx={{ mt: 2 }}
                    >
                      View Patient Empathy Summary
                    </Button>
                  </AccordionDetails>
                </Accordion>
              ))
            ) : (
              <Typography sx={{ ml: 2, mt: 4 }} variant="body1">
                Student does not have chat history.
              </Typography>
            )}


            {/* Tooltip-wrapped Completion Switch with student's name */}
            {/* <Tooltip title={`Manually set the completion status for ${studentId}`} arrow>
              <FormControlLabel
                control={
                  <Switch
                    checked={completion}
                    onChange={() => setCompletion((prev) => !prev)}
                  />
                }
                label="Completion"
                sx={{ mt: 4 }}
              />
            </Tooltip> */}
            <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
              Patient Completion Status:
            </Typography>
            {/* Render each patient's completion status with toggle */}
            {completionStatuses.map((status) => (
              <Tooltip
                key={status.student_interaction_id}
                title={`Toggle completion status for ${status.patient_name}`}
                arrow
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={status.is_completed}
                      onChange={() => toggleCompletionStatus(status.student_interaction_id)}
                    />
                  }
                  label={`${status.patient_name} Completion`}
                  sx={{ mt: 2 }}
                />
              </Tooltip>
            ))}
          </Box>
        </Paper>
      </PageContainer>
      <ToastContainer />
    </>
  );
};

export default StudentDetails;