import { useState } from "react";
import {
  Box,
  Typography,
  Toolbar,
  Paper,
  Tabs,
  Tab,
  Alert,
} from "@mui/material";
import {
  Settings as SettingsIcon,
  Chat as ChatIcon,
  Psychology as PsychologyIcon,
} from "@mui/icons-material";
import { useAuthentication } from "../../hooks/useAuth";
import useAISettings from "./hooks/useAISettings";
import SystemPromptTab from "./SystemPromptTab";
import EmpathyPromptTab from "./EmpathyPromptTab";

// ---------------------------------------------------------------------------
// TabPanel
// ---------------------------------------------------------------------------

function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const AISettings = () => {
  const { user } = useAuthentication();
  const settings = useAISettings();
  const [activeTab, setActiveTab] = useState(0);

  if (!user) {
    return (
      <Box sx={{ p: 3, mt: 8 }}>
        <Typography>Loading user authentication...</Typography>
      </Box>
    );
  }

  return (
    <Box
      component="main"
      sx={{
        flexGrow: 1,
        p: 3,
        marginTop: 0.5,
        backgroundColor: "#f8fafc",
        minHeight: "100vh",
        width: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <Toolbar />

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <SettingsIcon sx={{ mr: 2, color: "#10b981", fontSize: "2rem" }} />
        <Typography variant="h4" sx={{ fontWeight: 700, color: "#1f2937" }}>
          AI Settings
        </Typography>
      </Box>

      {/* Alert banner */}
      {settings.alert.show && (
        <Alert severity={settings.alert.severity} sx={{ mb: 3 }}>
          {settings.alert.message}
        </Alert>
      )}

      {/* Tab navigation */}
      <Paper sx={{ borderRadius: 2, mb: 3, overflow: "hidden" }}>
        <Tabs
          value={activeTab}
          onChange={(e, v) => setActiveTab(v)}
          variant="fullWidth"
          sx={{
            backgroundColor: "white",
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.95rem",
              py: 2,
            },
            "& .Mui-selected": {
              color: "#10b981 !important",
            },
            "& .MuiTabs-indicator": {
              backgroundColor: "#10b981",
              height: 3,
            },
          }}
        >
          <Tab icon={<ChatIcon />} iconPosition="start" label="System Prompt" />
          <Tab icon={<PsychologyIcon />} iconPosition="start" label="Empathy Prompt" />
        </Tabs>
      </Paper>

      {/* Tab panels */}
      <TabPanel value={activeTab} index={0}>
        <SystemPromptTab {...settings} />
      </TabPanel>
      <TabPanel value={activeTab} index={1}>
        <EmpathyPromptTab {...settings} />
      </TabPanel>
    </Box>
  );
};

export default AISettings;
