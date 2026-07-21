import { useState } from "react";
import Cropper from "react-easy-crop";
import { Box, Button, Dialog, Typography } from "@mui/material";
import Slider from "@mui/material/Slider";
import { getCroppedImg } from "../../functions/cropImage.js";

/**
 * Shared image-crop dialog used by InstructorNewPatient and InstructorEditPatients.
 *
 * Props:
 *   profilePictureForCrop  — base64/object-URL of the image to crop (truthy when open)
 *   onCropComplete(blob)   — called with the cropped Blob when the user clicks "Crop Image"
 *   onCancel()             — called when the user cancels (parent should clear profilePictureForCrop)
 */
const PatientImageCropper = ({ profilePictureForCrop, onCropComplete, onCancel }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropCompleteCallback = (_, pixels) => {
    setCroppedAreaPixels(pixels);
  };

  const handleDone = async () => {
    try {
      const croppedBlob = await getCroppedImg(
        profilePictureForCrop,
        croppedAreaPixels,
        "profile_pic.png"
      );
      onCropComplete(croppedBlob);
    } catch (error) {
      console.error("Error cropping image:", error);
    }
  };

  return (
    <Dialog open onClose={onCancel}>
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
            onCropComplete={onCropCompleteCallback}
          />
        </Box>
        <Box mt={2}>
          <Typography gutterBottom>Zoom</Typography>
          <Slider
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            onChange={(e, z) => setZoom(z)}
          />
        </Box>
        <Box mt={2} display="flex" justifyContent="flex-end">
          <Button onClick={onCancel} color="secondary" sx={{ mr: 2 }}>
            Cancel
          </Button>
          <Button onClick={handleDone} variant="contained" color="primary">
            Crop Image
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default PatientImageCropper;
