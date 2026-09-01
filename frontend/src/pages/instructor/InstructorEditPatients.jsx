import { useState, useEffect } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import VolumeUp from "@mui/icons-material/VolumeUp";
import HistoryIcon from "@mui/icons-material/History";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import RestoreIcon from "@mui/icons-material/Restore";

import {
  TextField,
  Button,
  Paper,
  Typography,
  Grid,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from "@mui/material";
import PageContainer from "../Container";
import FileManagement from "../../components/FileManagement";
import {
  filterPollyVoices,
  formatPollyVoice,
  selectPollyVoice,
  usePollyVoices,
} from "./usePollyVoices";
import { useVoiceSample } from "./useVoiceSample";

import Avatar from '@mui/material/Avatar'; // for profile picture preview
import IconButton from '@mui/material/IconButton'; // for upload button
import PhotoCamera from '@mui/icons-material/PhotoCamera'; // icon for upload

import PatientImageCropper from "./PatientImageCropper";
import { titleCase } from "../../utils/textFormatting";

const InstructorEditPatients = ({ patientData, simulation_group_id, onClose, onPatientUpdated, showSuccessToast }) => {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [metadata, setMetadata] = useState({});
  const [patientMetadata, setPatientMetadata] = useState({});
  const [answerKeyMetadata, setAnswerKeyMetadata] = useState({});

  const [files, setFiles] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [savedFiles, setSavedFiles] = useState([]);
  const [deletedFiles, setDeletedFiles] = useState([]);

  const [patientFiles, setPatientFiles] = useState([]);
  const [newPatientFiles, setNewPatientFiles] = useState([]);
  const [savedPatientFiles, setSavedPatientFiles] = useState([]);
  const [deletedPatientFiles, setDeletedPatientFiles] = useState([]);

  const [answerKeyFiles, setAnswerKeyFiles] = useState([]);
  const [newAnswerKeyFiles, setNewAnswerKeyFiles] = useState([]);
  const [savedAnswerKeyFiles, setSavedAnswerKeyFiles] = useState([]);
  const [deletedAnswerKeyFiles, setDeletedAnswerKeyFiles] = useState([]);

  const [patient, setPatient] = useState(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientPrompt, setPatientPrompt] = useState("");
  const [previousPatientPrompts, setPreviousPatientPrompts] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  const [profilePictureForCrop, setProfilePictureForCrop] = useState(null);

  const { voices, loading: voicesLoading, error: voicesError } = usePollyVoices();
  const availableVoices = filterPollyVoices(voices, patientGender);
  const [selectedVoice, setSelectedVoice] = useState("");
  const { isPlaying: isVoiceSamplePlaying, playSample } = useVoiceSample();

  const handleVoiceSample = async () => {
    try {
      await playSample(selectedVoice);
    } catch {
      toast.error("Unable to play the selected voice sample.", { position: "top-center" });
    }
  };

  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePictureForCrop(URL.createObjectURL(file));
    }
  };

  const uploadProfilePicture = async (profilePicture, token) => {
    if (!profilePicture) return;
    const fileType = "png";
    const fileName = `${patient.patient_id}_profile_pic`;

    const response = await fetch(
      `${import.meta.env.VITE_API_ENDPOINT}instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
        simulation_group_id
      )}&patient_id=${encodeURIComponent(
        patient.patient_id
      )}&patient_name=${encodeURIComponent(
        patientName
      )}&file_type=${encodeURIComponent(
        fileType
      )}&file_name=${encodeURIComponent(fileName)}&folder_type=profile_picture`,
      {
        method: "GET",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      }
    );

    const presignedUrl = await response.json();
    await fetch(presignedUrl.presignedurl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
      },
      body: profilePicture,
    });
  };

  const handleDeleteConfirmation = () => {
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
  };

  const handleConfirmDelete = async () => {
    setDialogOpen(false);
    handleDelete();
  };

  function convertDocumentFilesToArray(files) {
    const documentFiles = files.document_files;
    const resultArray = Object.entries({
      ...documentFiles,
    }).map(([fileName, url]) => ({
      fileName,
      url,
    }));

    const metadata = resultArray.reduce((acc, { fileName, url }) => {
      acc[fileName] = url.metadata;
      return acc;
    }, {});

    setMetadata(metadata);
    return resultArray;
  }

  function convertInfoFilesToArray(files) {
    const infoFiles = files.info_files;
    const resultArray = Object.entries({
      ...infoFiles,
    }).map(([fileName, url]) => ({
      fileName,
      url,
    }));

    const metadata = resultArray.reduce((acc, { fileName, url }) => {
      acc[fileName] = url.metadata;
      return acc;
    }, {});

    setPatientMetadata(metadata);
    return resultArray;
  }

  function convertAnswerKeyFilesToArray(files) {
    const answerKeyFiles = files.answer_key_files;
    const resultArray = Object.entries({
      ...answerKeyFiles,
    }).map(([fileName, url]) => ({
      fileName,
      url,
    }));

    const metadata = resultArray.reduce((acc, { fileName, url }) => {
      acc[fileName] = url.metadata;
      return acc;
    }, {});

    setAnswerKeyMetadata(metadata);
    return resultArray;
  }

  function removeFileExtension(fileName) {
    return fileName.replace(/\.[^/.]+$/, "");
  }

  const fetchFiles = async () => {
    try {
      const { token } = await getAuthSessionAndEmail();
      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}instructor/get_all_files?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(patient.patient_id)}&patient_name=${encodeURIComponent(patientName)}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.ok) {
        const fileData = await response.json();
        setFiles(convertDocumentFilesToArray(fileData));
        setPatientFiles(convertInfoFilesToArray(fileData));
        setAnswerKeyFiles(convertAnswerKeyFilesToArray(fileData));

        if (fileData.profile_picture_url) {
          setProfilePicturePreview(fileData.profile_picture_url);
        }
      } else {
        console.error("Failed to fetch files:", response.statusText);
      }
    } catch (error) {
      console.error("Error fetching Files:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (patientData) {
      console.log("Patient Data:", patientData);
      setPatient(patientData);
      setPatientName(patientData.patient_name);
      setPatientAge(patientData.patient_age);
      setPatientGender(patientData.patient_gender);
      setPatientPrompt(patientData.patient_prompt);
      setSelectedVoice(patientData.voice_id || "");
    }
  }, [patientData]);

  const fetchPatientPromptHistory = async () => {
    if (!patientData?.patient_id) {
      return;
    }

    try {
      const { token, email } = await getAuthSessionAndEmail();
      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}instructor/patient_prompt_history?patient_id=${encodeURIComponent(
          patientData.patient_id
        )}&simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&instructor_email=${encodeURIComponent(email)}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch patient prompt history");
      }

      setPreviousPatientPrompts(await response.json());
      setHistoryIndex(0);
    } catch (error) {
      console.error("Error fetching patient prompt history:", error);
    }
  };

  useEffect(() => {
    fetchPatientPromptHistory();
  // Patient history is refreshed when the selected patient changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientData, simulation_group_id]);

  useEffect(() => {
    if (!voicesLoading && voices.length) {
      setSelectedVoice((current) => selectPollyVoice(voices, patientGender, current));
    }
  }, [patientGender, voices, voicesLoading]);

  useEffect(() => {
    if (patient) {
      fetchFiles();
    }
  // fetchFiles uses the current patient and auth context by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient]);

  const handleDelete = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken
      const s3Response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT
        }instructor/delete_patient_s3?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&patient_name=${encodeURIComponent(patient.patient_name)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (!s3Response.ok) {
        throw new Error("Failed to delete patient from S3");
      }
      const patientResponse = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT
        }instructor/delete_patient?patient_id=${encodeURIComponent(
          patient.patient_id
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (patientResponse.ok) {
        showSuccessToast("Successfully Deleted");
        onClose();
      } else {
        throw new Error("Failed to delete patient");
      }
    } catch (error) {
      console.error(error.message);
      toast.error("Failed to delete patient", {
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

  const getFileType = (filename) => {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop() : "";
  };

  const updatePatient = async () => {
    const { token, email } = await getAuthSessionAndEmail();

    const editPatientResponse = await fetch(
      `${import.meta.env.VITE_API_ENDPOINT
      }instructor/edit_patient?patient_id=${encodeURIComponent(
        patient.patient_id
      )}&instructor_email=${encodeURIComponent(
        email
      )}&simulation_group_id=${encodeURIComponent(simulation_group_id)}`,
      {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_name: patientName,
          patient_age: patientAge,
          patient_gender: patientGender,
          patient_prompt: patientPrompt,
          voice_id: selectedVoice || null,
        }),
      }
    );

    if (!editPatientResponse.ok) {
      throw new Error(editPatientResponse.statusText);
    }

    return editPatientResponse;
  };

  const deleteFiles = async (deletedFiles, folder_type, token) => {
    const deletePromises = deletedFiles.map((file_name) => {
      const fileType = getFileType(file_name);
      const fileName = cleanFileName(removeFileExtension(file_name));
      return fetch(
        `${import.meta.env.VITE_API_ENDPOINT
        }instructor/delete_file?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&patient_name=${encodeURIComponent(
          patientName
        )}&file_type=${encodeURIComponent(
          fileType
        )}&file_name=${encodeURIComponent(
          fileName
        )}&folder_type=${encodeURIComponent(folder_type)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );
    });
    await Promise.all(deletePromises);
  };

  const cleanFileName = (fileName) => fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  const uploadFiles = async (newFiles, token) => {
    const uploadPromises = newFiles.map(async (file) => {
      const fileType = getFileType(file.name);
      const fileName = cleanFileName(removeFileExtension(file.name));

      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT
        }instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&patient_name=${encodeURIComponent(
          patientName
        )}&file_type=${encodeURIComponent(
          fileType
        )}&file_name=${encodeURIComponent(fileName)}&folder_type=documents`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      const presignedUrl = await response.json();
      await fetch(presignedUrl.presignedurl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });
      return file;
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    setSavedFiles((prevFiles) => [...prevFiles, ...uploadedFiles]);
  };

  const uploadPatientFiles = async (newPatientFiles, token) => {
    const uploadPromises = newPatientFiles.map(async (file) => {
      const fileType = getFileType(file.name);
      const fileName = cleanFileName(removeFileExtension(file.name));

      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT
        }instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&patient_name=${encodeURIComponent(
          patientName
        )}&file_type=${encodeURIComponent(
          fileType
        )}&file_name=${encodeURIComponent(fileName)}&folder_type=info`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      const presignedUrl = await response.json();
      await fetch(presignedUrl.presignedurl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });
      return file;
    });

    const uploadedPatientFiles = await Promise.all(uploadPromises);
    setSavedPatientFiles((prevFiles) => [...prevFiles, ...uploadedPatientFiles]);
  };


  const uploadAnswerKeyFiles = async (newAnswerKeyFiles, token) => {
    const uploadPromises = newAnswerKeyFiles.map(async (file) => {
      const fileType = getFileType(file.name);
      const fileName = cleanFileName(removeFileExtension(file.name));

      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&patient_name=${encodeURIComponent(
          patientName
        )}&file_type=${encodeURIComponent(
          fileType
        )}&file_name=${encodeURIComponent(fileName)}&folder_type=answer_key`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      const presignedUrl = await response.json();
      await fetch(presignedUrl.presignedurl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });
      return file;
    });

    const uploadedAnswerKeyFiles = await Promise.all(uploadPromises);
    setSavedAnswerKeyFiles((prevFiles) => [...prevFiles, ...uploadedAnswerKeyFiles]);
  };


  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    if (!patientName) {
      toast.error("Patient Name is required.", { position: "top-center" });
      setIsSaving(false);
      return;
    }
    if (!patientAge) {
      toast.error("Patient Age is required.", { position: "top-center" });
      setIsSaving(false);
      return;
    }
    if (!patientPrompt) {
      toast.error("Patient Prompt is required.", { position: "top-center" });
      setIsSaving(false);
      return;
    }

    const totalLLMFiles = files.length + newFiles.length;
    if (totalLLMFiles === 0) {
      toast.error("At least one LLM file is required.", {
        position: "top-center",
        autoClose: 2000,
        theme: "colored",
      });
      setIsSaving(false);
      return;
    }



    try {
      const updatedPatientData = {
        patient_id: patientData.patient_id,
        patient_name: patientName,
        patient_age: patientAge,
        patient_gender: patientGender,
        patient_prompt: patientPrompt,
        voice_id: selectedVoice || null,
      };

      await updatePatient();
      await fetchPatientPromptHistory();

      // Update patient information in the parent component
      onPatientUpdated(updatedPatientData);

      const { token } = await getAuthSessionAndEmail();
      await deleteFiles(deletedFiles, "documents", token);
      await deleteFiles(deletedPatientFiles, "info", token);
      await deleteFiles(deletedAnswerKeyFiles, "answer_key", token);
      await uploadFiles(newFiles, token);
      await uploadPatientFiles(newPatientFiles, token);
      await uploadAnswerKeyFiles(newAnswerKeyFiles, token);

      // Upload profile picture
      if (profilePicture) {
        await uploadProfilePicture(profilePicture, token);
      }

      await Promise.all([
        updateMetaData(files, token, metadata),
        updateMetaData(savedFiles, token, metadata),
        updateMetaData(newFiles, token, metadata),
        updateMetaData(patientFiles, token, patientMetadata),
        updateMetaData(savedPatientFiles, token, patientMetadata),
        updateMetaData(newPatientFiles, token, patientMetadata),
        updateMetaData(answerKeyFiles, token, answerKeyMetadata),
        updateMetaData(savedAnswerKeyFiles, token, answerKeyMetadata),
        updateMetaData(newAnswerKeyFiles, token, answerKeyMetadata),
      ]);

      // Refresh the file list in case of new or deleted files
      setFiles((prevFiles) =>
        prevFiles.filter((file) => !deletedFiles.includes(file.fileName))
      );

      setDeletedFiles([]);
      setNewFiles([]);
      setDeletedPatientFiles([]);
      setNewPatientFiles([]);
      setDeletedAnswerKeyFiles([]);
      setNewAnswerKeyFiles([]);

      showSuccessToast("Patient updated successfully");
      onClose();
    } catch (error) {
      console.error("Error saving patient:", error);
      toast.error("Patient failed to update", { position: "top-center" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateMetaData = (files, token, metadataToUse) => {
    files.forEach((file) => {
      const fileNameWithExtension = file.fileName || file.name;
      const fileMetadata = metadataToUse[fileNameWithExtension] || "";
      const fileName = cleanFileName(removeFileExtension(fileNameWithExtension));
      const fileType = getFileType(fileNameWithExtension);
      fetch(
        `${import.meta.env.VITE_API_ENDPOINT}instructor/update_metadata?patient_id=${encodeURIComponent(
          patient.patient_id
        )}&filename=${encodeURIComponent(
          fileName
        )}&filetype=${encodeURIComponent(fileType)}`,
        {
          method: "PUT",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ metadata: fileMetadata }),
        }
      );
    });
  };

  const getAuthSessionAndEmail = async () => {
    const session = await fetchAuthSession();
    const token = session.tokens.idToken;
    const { email } = await fetchUserAttributes();
    return { token, email };
  };

  if (!patient) return <Typography>Loading...</Typography>;

  return (
    <PageContainer>
      <Paper style={{ padding: 25, width: "100%", maxHeight: "70vh", overflowY: "auto" }}>
        <Typography variant="h6">
          Edit Patient {titleCase(patient.patient_name)}{" "}
        </Typography>

        {/* Profile Picture Upload Section */}
        <Box display="flex" alignItems="center" justifyContent="center" marginBottom={2}>
          <Avatar
            src={profilePicturePreview}
            alt="Profile Picture"
            sx={{ width: 100, height: 100 }}
          />
          <input
            accept="image/*"
            id="profile-picture-upload"
            type="file"
            style={{ display: "none" }}
            onChange={handleProfilePictureChange}
          />
          <label htmlFor="profile-picture-upload">
            <IconButton component="span" color="primary" aria-label="upload profile picture">
              <PhotoCamera />
            </IconButton>
          </label>
        </Box>

        {profilePictureForCrop && (
          <PatientImageCropper
            profilePictureForCrop={profilePictureForCrop}
            onCropComplete={(blob) => {
              setProfilePicture(blob);
              setProfilePicturePreview(URL.createObjectURL(blob));
              setProfilePictureForCrop(null);
            }}
            onCancel={() => setProfilePictureForCrop(null)}
          />
        )}

        <TextField
          label="Patient Name"
          name="name"
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          fullWidth
          margin="normal"
          inputProps={{ maxLength: 50 }}
        />

        <TextField
          label="Patient Age"
          name="age"
          value={patientAge}
          onChange={(e) => setPatientAge(e.target.value)}
          fullWidth
          margin="normal"
        />

        <FormControl fullWidth margin="normal">
          <InputLabel>Gender</InputLabel>
          <Select
            value={patientGender}
            onChange={(e) => setPatientGender(e.target.value)}
          >
            <MenuItem value="Male">Male</MenuItem>
            <MenuItem value="Female">Female</MenuItem>
            <MenuItem value="Other">Other</MenuItem>
          </Select>
        </FormControl>

        {patientGender && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Voice</InputLabel>
              <Select
                value={selectedVoice}
                label="Voice"
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={voicesLoading || Boolean(voicesError)}
              >
                {availableVoices.map(v => (
                  <MenuItem key={v.id} value={v.id}>{formatPollyVoice(v)}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Play selected voice sample">
              <span>
                <IconButton
                  aria-label="Play selected voice sample"
                  disabled={!selectedVoice || voicesLoading || Boolean(voicesError) || isVoiceSamplePlaying}
                  onClick={handleVoiceSample}
                  size="small"
                >
                  {isVoiceSamplePlaying ? <CircularProgress size={20} /> : <VolumeUp />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}

        <TextField
          label="Patient Prompt"
          value={patientPrompt}
          onChange={(e) => setPatientPrompt(e.target.value)}
          fullWidth
          margin="normal"
          multiline
          rows={4}
        />

        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <HistoryIcon color="action" fontSize="small" />
            <Typography variant="subtitle2">Previous Patient Prompts</Typography>
          </Box>
          {previousPatientPrompts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No previous prompts saved yet.
            </Typography>
          ) : (
            <>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  mb: 1,
                }}
              >
                <Tooltip title="Previous prompt">
                  <span>
                    <IconButton
                      aria-label="Previous prompt"
                      size="small"
                      onClick={() => setHistoryIndex((index) => Math.max(0, index - 1))}
                      disabled={historyIndex === 0}
                    >
                      <ArrowBackIosNewIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Typography variant="caption">
                  Version {historyIndex + 1} of {previousPatientPrompts.length}
                </Typography>
                <Tooltip title="Next prompt">
                  <span>
                    <IconButton
                      aria-label="Next prompt"
                      size="small"
                      onClick={() =>
                        setHistoryIndex((index) =>
                          Math.min(previousPatientPrompts.length - 1, index + 1)
                        )
                      }
                      disabled={historyIndex >= previousPatientPrompts.length - 1}
                    >
                      <ArrowForwardIosIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Saved: {new Date(previousPatientPrompts[historyIndex]?.created_at).toLocaleString()}
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={4}
                maxRows={8}
                value={previousPatientPrompts[historyIndex]?.prompt_content || ""}
                InputProps={{ readOnly: true }}
                sx={{ mb: 1 }}
              />
              <Button
                startIcon={<RestoreIcon />}
                variant="outlined"
                onClick={() =>
                  setPatientPrompt(previousPatientPrompts[historyIndex]?.prompt_content || "")
                }
              >
                Use This Version
              </Button>
            </>
          )}
        </Box>

        {/* LLM Upload Section */}
        <Typography variant="h6" style={{ marginTop: 20 }}>
          LLM Upload
        </Typography>
        <FileManagement
          newFiles={newFiles}
          setNewFiles={setNewFiles}
          files={files}
          setFiles={setFiles}
          setDeletedFiles={setDeletedFiles}
          savedFiles={savedFiles}
          setSavedFiles={setSavedFiles}
          loading={loading}
          metadata={metadata}
          setMetadata={setMetadata}
          isDocument={true}
        />

        {/* Patient Info Upload Section */}
        <Typography variant="h6" style={{ marginTop: 20 }}>
          Patient Information Upload
        </Typography>
        <FileManagement
          newFiles={newPatientFiles}
          setNewFiles={setNewPatientFiles}
          files={patientFiles}
          setFiles={setPatientFiles}
          setDeletedFiles={setDeletedPatientFiles}
          savedFiles={savedPatientFiles}
          setSavedFiles={setSavedPatientFiles}
          loading={loading}
          metadata={patientMetadata}
          setMetadata={setPatientMetadata}
          isDocument={false}
        />

        {/* Answer Key Upload Section */}
        <Typography variant="h6" style={{ marginTop: 20 }}>
          Answer Key Upload
        </Typography>
        <FileManagement
          newFiles={newAnswerKeyFiles}
          setNewFiles={setNewAnswerKeyFiles}
          files={answerKeyFiles}
          setFiles={setAnswerKeyFiles}
          setDeletedFiles={setDeletedAnswerKeyFiles}
          savedFiles={savedAnswerKeyFiles}
          setSavedFiles={setSavedAnswerKeyFiles}
          loading={loading}
          metadata={answerKeyMetadata}
          setMetadata={setAnswerKeyMetadata}
          isDocument={false}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1,
            mt: 2,
          }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Button variant="contained" color="primary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleDeleteConfirmation}>
              Delete Patient
            </Button>
          </Box>
          <Button variant="contained" color="primary" onClick={handleSave}>
            Save Patient
          </Button>
        </Box>
      </Paper>
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
      <Dialog open={dialogOpen} onClose={handleDialogClose}>
        <DialogTitle>{"Delete Patient"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this patient? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} color="error">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};

export default InstructorEditPatients;