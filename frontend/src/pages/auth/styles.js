/** Shared MUI sx objects used across all auth form components. */

export const textFieldSx = {
  mb: 2,
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    backgroundColor: "#f9fafb",
    transition: "all 0.2s ease-in-out",
    "&:hover": { backgroundColor: "#f3f4f6" },
    "&.Mui-focused": {
      backgroundColor: "white",
      boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.1)",
    },
    "& fieldset": { borderColor: "#e5e7eb" },
    "&:hover fieldset": { borderColor: "#10b981" },
    "&.Mui-focused fieldset": {
      borderColor: "#10b981",
      borderWidth: "2px",
    },
  },
  "& .MuiInputLabel-root": {
    color: "#6b7280",
    "&.Mui-focused": { color: "#10b981" },
  },
};

export const primaryButtonSx = {
  mt: 2,
  mb: 3,
  py: 1.5,
  borderRadius: "12px",
  backgroundColor: "#10b981",
  fontSize: "1rem",
  fontWeight: "600",
  textTransform: "none",
  boxShadow: "none",
  transition: "all 0.2s ease-in-out",
  color: "white",
  fontFamily: "Outfit, sans-serif",
  "&:hover": {
    backgroundColor: "#059669",
    transform: "translateY(-1px)",
    boxShadow: "none",
  },
  "&:active": {
    transform: "translateY(0)",
  },
};

export const linkSx = {
  color: "#10b981",
  textDecoration: "none",
  fontWeight: "500",
  transition: "color 0.2s ease-in-out",
  "&:hover": {
    color: "#059669",
    textDecoration: "underline",
  },
};

export const formPanelSx = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  bgcolor: "white",
  borderRadius: { sm: "20px 0 0 20px" },
  boxShadow:
    "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
};

export const headingSx = {
  color: "#1f2937",
  fontWeight: "700",
  marginBottom: "32px",
  fontSize: "1.875rem",
  fontFamily: "Outfit, sans-serif",
  textAlign: "center",
};
