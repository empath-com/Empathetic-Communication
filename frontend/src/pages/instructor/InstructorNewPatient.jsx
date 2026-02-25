import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { fetchAuthSession } from "aws-amplify/auth";
import { fetchUserAttributes } from "aws-amplify/auth";
import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCamera from '@mui/icons-material/PhotoCamera'; // Icon for profile picture upload

import Cropper from 'react-easy-crop';
import Dialog from '@mui/material/Dialog';
import Slider from '@mui/material/Slider';
import { getCroppedImg } from '../../functions/cropImage.js';



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
  IconButton,
  Avatar, // pfp
} from "@mui/material";
import PageContainer from "../Container";
import FileManagement from "../../components/FileManagement";

function titleCase(str) {
  if (typeof str !== "string") return str;
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const InstructorNewPatient = ({ data, simulation_group_id, onClose, onPatientCreated, showSuccessToast }) => {
  const [files, setFiles] = useState([]); // For LLM Upload
  const [newFiles, setNewFiles] = useState([]); // For LLM Upload
  const [savedFiles, setSavedFiles] = useState([]); // For LLM Upload
  const [deletedFiles, setDeletedFiles] = useState([]); // For LLM Upload
  const [metadata, setMetadata] = useState({}); // For LLM Upload


  const [patientFiles, setPatientFiles] = useState([]); // For Patient Info Upload
  const [newPatientFiles, setNewPatientFiles] = useState([]); // For Patient Info Upload
  const [savedPatientFiles, setSavedPatientFiles] = useState([]); // For Patient Info Upload
  const [deletedPatientFiles, setDeletedPatientFiles] = useState([]); // For Patient Info Upload
  const [patientMetadata, setPatientMetadata] = useState({}); // For Patient Info Upload

  const [answerKeyFiles, setAnswerKeyFiles] = useState([]); // For Answer Key Upload
  const [newAnswerKeyFiles, setNewAnswerKeyFiles] = useState([]); // For Answer Key Upload
  const [savedAnswerKeyFiles, setSavedAnswerKeyFiles] = useState([]); // For Answer Key Upload
  const [deletedAnswerKeyFiles, setDeletedAnswerKeyFiles] = useState([]); // For Answer Key Upload
  const [answerKeyMetadata, setAnswerKeyMetadata] = useState({}); // For Answer Key Upload

  const [profilePicture, setProfilePicture] = useState(null); // For profile picture upload
  const [profilePicturePreview, setProfilePicturePreview] = useState(null); // For profile picture preview
  const [profilePictureForCrop, setProfilePictureForCrop] = useState(null); // For profile picture cropping
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientPrompt, setPatientPrompt] = useState("");
  // Voice selection state
  const feminineVoices = ["tiffany", "amy", "ambre", "beatrice", "greta", "lupe"]; 
  const masculineVoices = ["matthew", "florian", "lorenzo", "lennart", "carlos"]; 
  // Friendly display labels mapped to backend voice IDs
  const voiceLabels = {
    tiffany: "US English (Female)",
    amy: "UK English (Female)",
    ambre: "French (Female)",
    beatrice: "Italian (Female)",
    greta: "German (Female)",
    lupe: "Spanish (Female)",
    matthew: "US English (Male)",
    florian: "German (Male)",
    lorenzo: "Italian (Male)",
    lennart: "Dutch (Male)",
    carlos: "Spanish (Male)"
  };
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [nextPatientNumber, setNextPatientNumber] = useState(data.length + 1);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);


  const cleanFileName = (fileName) => {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  };


  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePictureForCrop(URL.createObjectURL(file));
      setIsCropDialogOpen(true); // Open cropping dialog
    }
  };

  const onCropComplete = (_, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleCropImage = async () => {
    try {
      const croppedFile = await getCroppedImg(profilePictureForCrop, croppedAreaPixels, `${patientName}_profile_pic.png`);
      setProfilePicture(croppedFile);
      setProfilePicturePreview(URL.createObjectURL(croppedFile));
      setIsCropDialogOpen(false);
    } catch (error) {
      console.error("Error cropping image:", error);
    }
  };


  const uploadProfilePicture = async (profilePicture, token, patientId) => {
    if (!profilePicture) return;
    const fileType = "png";
    const fileName = `${patientId}_profile_pic`;

    const response = await fetch(
      `${import.meta.env.VITE_API_ENDPOINT}instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
        simulation_group_id
      )}&patient_id=${encodeURIComponent(
        patientId
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

  function removeFileExtension(fileName) {
    return fileName.replace(/\.[^/.]+$/, "");
  }

  const getFileType = (filename) => {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop() : "";
  };

  function convertDocumentFilesToArray(files) {
    const resultArray = Object.entries(files).map(([fileName, url]) => ({
      fileName,
      url,
    }));

    const fileMetadata = resultArray.reduce((acc, { fileName, url }) => {
      acc[fileName] = url.metadata || ""; // Store metadata
      return acc;
    }, {});

    setMetadata(fileMetadata);
    return resultArray;
  }

  const uploadFiles = async (newFiles, token, patientId) => {
    const newFilePromises = newFiles.map((file) => {
      const fileType = file.name.split('.').pop();
      const fileName = cleanFileName(file.name.replace(/\.[^/.]+$/, ""));
      return fetch(
        `${import.meta.env.VITE_API_ENDPOINT
        }instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patientId
        )}&patient_name=${encodeURIComponent(
          patientName
        )}&file_type=${encodeURIComponent(fileType)}&file_name=${encodeURIComponent(
          fileName
        )}&folder_type=documents`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      )
        .then((response) => response.json())
        .then((presignedUrl) => {
          return fetch(presignedUrl.presignedurl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type,
            },
            body: file,
          });
        });
    });

    return await Promise.all(newFilePromises);
  };

  const uploadPatientFiles = async (newFiles, token, patientId) => {
    const newFilePromises = newFiles.map((file) => {
      const fileType = file.name.split('.').pop();
      const fileName = cleanFileName(file.name.replace(/\.[^/.]+$/, ""));

      return fetch(
        `${import.meta.env.VITE_API_ENDPOINT
        }instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patientId
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
      )
        .then((response) => response.json())
        .then((presignedUrl) => {
          return fetch(presignedUrl.presignedurl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type,
            },
            body: file,
          });
        });
    });

    return await Promise.all(newFilePromises);
  };

  const uploadAnswerKeyFiles = async (newFiles, token, patientId) => {
    const newFilePromises = newFiles.map((file) => {
      const fileType = file.name.split('.').pop();
      const fileName = cleanFileName(file.name.replace(/\.[^/.]+$/, ""));

      return fetch(
        `${import.meta.env.VITE_API_ENDPOINT}instructor/generate_presigned_url?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patientId
        )}&patient_name=${encodeURIComponent(
          patientName
        )}&file_type=${encodeURIComponent(
          fileType
        )}&file_name=${encodeURIComponent(fileName)}&folder_type=answer_key`, // Use a specific folder for answer keys
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      )
        .then((response) => response.json())
        .then((presignedUrl) => {
          return fetch(presignedUrl.presignedurl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type,
            },
            body: file,
          });
        });
    });

    return await Promise.all(newFilePromises);
  };


  const updateMetaData = (files, token, patientId, metadata) => {
    files.forEach((file) => {
      const fileNameWithExtension = file.fileName || file.name;
      const fileMetadata = metadata[fileNameWithExtension] || "";
      const fileName = cleanFileName(removeFileExtension(fileNameWithExtension));
      const fileType = getFileType(fileNameWithExtension);

      fetch(
        `${import.meta.env.VITE_API_ENDPOINT}instructor/update_metadata?patient_id=${encodeURIComponent(
          patientId
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

  const handleSave = async () => {
    if (isSaving) return;

    if (!patientName) {
      toast.error("Patient Name is required.", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      return;
    }

    if (!patientAge) {
      toast.error("Patient Age is required.", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      return;
    }

    if (!patientGender) {

      toast.error("Patient Gender is required.", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      return;
    }

    if (!patientPrompt) {
      toast.error("Patient Prompt is required.", {
        position: "top-center",
        autoClose: 1000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      return;
    }

    // Check for LLM file upload
    if (newFiles.length === 0) {
      toast.error("LLM file is required.", {
        position: "top-center",
        autoClose: 1000,
        theme: "colored",
      });
      return;
    }

    setIsSaving(true);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
      const { email } = await fetchUserAttributes();

      const voiceQuery = selectedVoice ? `&voice_id=${encodeURIComponent(selectedVoice)}` : "";
      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}instructor/create_patient?simulation_group_id=${encodeURIComponent(
          simulation_group_id
        )}&patient_name=${encodeURIComponent(
          patientName
        )}&patient_number=${encodeURIComponent(
          nextPatientNumber
        )}&patient_age=${encodeURIComponent(
          patientAge
        )}&patient_gender=${encodeURIComponent(
          patientGender
        )}&instructor_email=${encodeURIComponent(email)}${voiceQuery}`,
        {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            patient_prompt: patientPrompt,
          }),
        }
      );

      if (!response.ok) {
        console.error(`Failed to create patient`, response.statusText);
        toast.error("Patient Creation Failed", {
          position: "top-center",
          autoClose: 1000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "colored",
        });
      } else {
        const updatedPatient = await response.json();
        await uploadProfilePicture(profilePicture, token, updatedPatient.patient_id); // Upload profile picture
        await uploadFiles(newFiles, token, updatedPatient.patient_id); // LLM Upload
        await uploadPatientFiles(newPatientFiles, token, updatedPatient.patient_id); // Patient Info Upload
        await uploadAnswerKeyFiles(newAnswerKeyFiles, token, updatedPatient.patient_id); // Answer Key Upload

        // Update metadata for both LLM and patient files
        await Promise.all([
          updateMetaData(newFiles, token, updatedPatient.patient_id, metadata),
          updateMetaData(newPatientFiles, token, updatedPatient.patient_id, patientMetadata),
          updateMetaData(newAnswerKeyFiles, token, updatedPatient.patient_id, answerKeyMetadata),
        ]);

        setFiles((prevFiles) =>
          prevFiles.filter((file) => !deletedFiles.includes(file.fileName))
        );
        setSavedFiles((prevFiles) => [...prevFiles, ...newFiles]);

        setPatientFiles((prevFiles) =>
          prevFiles.filter((file) => !deletedPatientFiles.includes(file.fileName))
        );
        setSavedPatientFiles((prevFiles) => [...prevFiles, ...newPatientFiles]);

        setAnswerKeyFiles((prevFiles) =>
          prevFiles.filter((file) => !deletedAnswerKeyFiles.includes(file.fileName))
        );
        setSavedAnswerKeyFiles((prevFiles) => [...prevFiles, ...newAnswerKeyFiles]);

        setDeletedFiles([]);
        setNewFiles([]);
        setDeletedPatientFiles([]);
        setNewPatientFiles([]);
        setDeletedAnswerKeyFiles([]);
        setNewAnswerKeyFiles([]);
        showSuccessToast("Patient Created Successfully");
        onPatientCreated(updatedPatient);
        onClose();
      }
    } catch (error) {
      console.error("Error saving changes:", error);
    } finally {
      setIsSaving(false);
      setNextPatientNumber(nextPatientNumber + 1);
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  useEffect(() => {
    // Update voices when gender changes
    if (patientGender.toLowerCase() === "female") {
      setAvailableVoices(feminineVoices);
      setSelectedVoice(prev => (feminineVoices.includes(prev) ? prev : feminineVoices[0]));
    } else if (patientGender.toLowerCase() === "male") {
      setAvailableVoices(masculineVoices);
      setSelectedVoice(prev => (masculineVoices.includes(prev) ? prev : masculineVoices[0]));
    } else {
      setAvailableVoices([...feminineVoices, ...masculineVoices]);
      setSelectedVoice("");
    }
  }, [patientGender]);

  return (
    <PageContainer>
      <Paper style={{ padding: 25, width: "100%", maxHeight: "70vh", overflowY: "auto" }}>
        <Typography variant="h6">New Patient</Typography>

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


        {/* Cropper Dialog */}
        <Dialog open={isCropDialogOpen} onClose={() => setIsCropDialogOpen(false)}>
          <Box p={3} width="100%">
            <Typography variant="h6">Crop Profile Picture</Typography>
            <Box position="relative" width="100%" height={300} mt={2}>
              <Cropper
                image={profilePictureForCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </Box>
            <Box mt={2}>
              <Typography gutterBottom>Zoom</Typography>
              <Slider
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                onChange={(e, zoom) => setZoom(zoom)}
              />
            </Box>
            <Box mt={2} display="flex" justifyContent="flex-end">
              <Button onClick={() => setIsCropDialogOpen(false)} color="secondary" sx={{ mr: 2 }}>
                Cancel
              </Button>
              <Button onClick={handleCropImage} variant="contained" color="primary">
                Crop Image
              </Button>
            </Box>
          </Box>
        </Dialog>

        {/* Patient Information Fields */}
        <TextField
          label="Patient Name"
          name="name"
          value={patientName}
          onChange={e => setPatientName(e.target.value)}
          fullWidth
          margin="normal"
          inputProps={{ maxLength: 50 }}
        />

        <TextField
          label="Patient Age"
          value={patientAge}
          onChange={e => setPatientAge(e.target.value)}
          fullWidth
          margin="normal"
        />

        <FormControl fullWidth margin="normal">
          <InputLabel>Gender</InputLabel>
          <Select
            value={patientGender}
            onChange={e => setPatientGender(e.target.value)}
          >
            <MenuItem value="Male">Male</MenuItem>
            <MenuItem value="Female">Female</MenuItem>
            <MenuItem value="Other">Other</MenuItem>
          </Select>
        </FormControl>

        {patientGender && (
          <FormControl fullWidth margin="normal">
            <InputLabel>Voice</InputLabel>
            <Select
              value={selectedVoice}
              label="Voice"
              onChange={e => setSelectedVoice(e.target.value)}
            >
              {availableVoices.map(v => (
                <MenuItem key={v} value={v}>{voiceLabels[v] || v}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <TextField
          label="Patient Prompt"
          value={patientPrompt}
          onChange={e => setPatientPrompt(e.target.value)}
          fullWidth
          margin="normal"
          multiline
          rows={4}
        />

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


        <Grid container spacing={2} style={{ marginTop: 16 }}>
          <Grid item xs={4}>
            <Box display="flex" gap={6}>
              <Button
                variant="contained"
                color="primary"
                onClick={onClose}
                sx={{ width: "30%" }}
              >
                Cancel
              </Button>
            </Box>
          </Grid>
          <Grid item xs={4}></Grid>
          <Grid item xs={4} style={{ textAlign: "right" }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              style={{ width: "50%" }}
            >
              Save Patient
            </Button>
          </Grid>
        </Grid>
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
    </PageContainer>
  );
};

export default InstructorNewPatient;