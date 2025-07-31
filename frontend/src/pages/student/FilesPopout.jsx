import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
} from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RefreshIcon from "@mui/icons-material/Refresh";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import { useState, useEffect } from "react";
import { hourglass } from "ldrs";

hourglass.register();

const IMAGE_FILE_TYPES = [
  "bmp", "gif", "jpeg", "jpg", "j2k", "jp2", "png", "ppm", "pgm", "pbm", 
  "sgi", "tga", "tiff", "tif", "webp", "xbm"
];

function FilesPopout({ open, onClose, files, isLoading }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  
  const handleFileClick = (file) => {
    setSelectedFile(file);
    setScale(1); 
    setPosition({ x: 0, y: 0 }); 
    setRotation(0); 
  };

  const handleCloseFileViewer = () => {
    setSelectedFile(null);
  };

  const handleZoomIn = () => {
    setScale((prevScale) => Math.min(prevScale + 0.2, 3)); 
  };

  const handleZoomOut = () => {
    setScale((prevScale) => Math.max(prevScale - 0.2, 1)); 
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0); 
  };

  const handleRotate = () => {
    setRotation((prevRotation) => (prevRotation + 90) % 360); 
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const handleMouseMove = (moveEvent) => {
      setPosition({
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY,
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const isImageFile = (fileType) => IMAGE_FILE_TYPES.includes(fileType);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      fullWidth 
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: '16px',
          padding: '8px'
        }
      }}
    >
      <DialogTitle sx={{ 
        fontSize: '1.25rem', 
        fontWeight: 600, 
        color: '#111827',
        borderBottom: '1px solid #f3f4f6',
        pb: 2
      }}>
        Patient Information Files
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <div className="flex flex-col items-center space-y-4">
              <l-hourglass size="40" bg-opacity="0.1" speed="1.75" color="#10b981" />
              <Typography className="text-gray-600">Loading files...</Typography>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex justify-center items-center py-16">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <Typography className="text-gray-600">No patient information files available</Typography>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                onClick={() => handleFileClick(file)}
                className="p-4 border border-gray-200 rounded-lg hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer transition-all duration-200 group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate group-hover:text-emerald-700">{file.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">{file.metadata || "No description available"}</p>
                  </div>
                  <div className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 2 }}>
        <Button 
          onClick={onClose}
          sx={{
            backgroundColor: '#f3f4f6',
            color: '#374151',
            '&:hover': {
              backgroundColor: '#e5e7eb'
            },
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 500
          }}
        >
          Close
        </Button>
      </DialogActions>

      {selectedFile && (
        <Dialog open={!!selectedFile} onClose={handleCloseFileViewer} fullWidth maxWidth="lg">
          <DialogTitle>{selectedFile.name}</DialogTitle>
          <DialogContent>
            {isImageFile(selectedFile.type) ? (
              <div
                style={{
                  overflow: "hidden",
                  cursor: "grab",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "600px",
                  position: "relative",
                }}
                onMouseDown={handleMouseDown}
              >
                <img
                  src={selectedFile.url}
                  alt={selectedFile.name}
                  style={{
                    transform: `scale(${scale}) translate(${position.x}px, ${position.y}px) rotate(${rotation}deg)`,
                    transition: "transform 0.1s ease-out",
                    maxWidth: "100%",
                    maxHeight: "100%",
                    cursor: "grab",
                  }}
                />
              </div>
            ) : (
              <iframe
                src={selectedFile.url}
                title={selectedFile.name}
                width="100%"
                height="600px"
                style={{ border: "none" }}
              />
            )}
          </DialogContent>
          <DialogActions>
            {isImageFile(selectedFile.type) && (
              <>
                <IconButton onClick={handleZoomIn} color="primary">
                  <ZoomInIcon />
                </IconButton>
                <IconButton onClick={handleZoomOut} color="primary">
                  <ZoomOutIcon />
                </IconButton>
                <IconButton onClick={handleRotate} color="primary">
                  <RotateRightIcon />
                </IconButton>
                <IconButton onClick={handleReset} color="primary">
                  <RefreshIcon />
                </IconButton>
              </>
            )}
            <Button onClick={handleCloseFileViewer} color="primary">
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Dialog>
  );
}

export default FilesPopout;