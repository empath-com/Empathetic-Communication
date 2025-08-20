import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Slider,
  FormControlLabel,
  Switch,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
} from "@mui/material";
import {
  Save as SaveIcon,
  Restore as RestoreIcon,
  Settings as SettingsIcon,
  ArrowBackIosNew as ArrowBackIosNewIcon,
  ArrowForwardIos as ArrowForwardIosIcon,
} from "@mui/icons-material";
import { useAuthentication } from "../../functions/useAuth";
import { fetchAuthSession } from "aws-amplify/auth";

const AISettings = () => {
  const { user } = useAuthentication();
  const [messageLimit, setMessageLimit] = useState(50);
  const [noLimit, setNoLimit] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptHistory, setPromptHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [alert, setAlert] = useState({
    show: false,
    message: "",
    severity: "info",
  });
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    const getAuthToken = async () => {
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.idToken) {
          setAuthToken(session.tokens.idToken.toString());
        }
      } catch (error) {
        console.error("Error getting auth token:", error);
      }
    };

    if (user) {
      getAuthToken();
    }
  }, [user]);

  useEffect(() => {
    if (authToken) {
      fetchSystemPrompts();
    }
  }, [authToken]);

  useEffect(() => {
    setHistoryIndex(0);
  }, [promptHistory.length]);

  if (!user) {
    return (
      <Box
        sx={{
          p: 3,
          mt: 8,
          ml: 0,
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          flexGrow: 1,
          minWidth: 0,
          height: "calc(100vh - 64px)",
          overflowY: "auto",
          pb: 6,
        }}
      >
        <Typography>Loading user authentication...</Typography>
      </Box>
    );
  }

  if (!authToken) {
    return (
      <Box
        sx={{
          p: 3,
          mt: 8,
          ml: 0,
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          flexGrow: 1,
          minWidth: 0,
          height: "calc(100vh - 64px)",
          overflowY: "auto",
          pb: 6,
        }}
      >
        <Typography>Loading authentication token...</Typography>
      </Box>
    );
  }

  const fetchSystemPrompts = async () => {
    setLoading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}admin/system_prompts`,
        {
          headers: {
            Authorization: token,
          },
        }
      );
      const data = await response.json();
      setSystemPrompt(data.current_prompt || "");
      setPromptHistory(data.history || []);
    } catch (error) {
      console.error("Error fetching system prompts:", error);
      showAlert("Failed to fetch system prompts", "error");
      setPromptHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const updateSystemPrompt = async () => {
    if (!systemPrompt.trim()) return;

    setLoading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}/admin/update_system_prompt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token,
          },
          body: JSON.stringify({
            prompt_content: systemPrompt,
          }),
        }
      );

      if (response.ok) {
        showAlert("System prompt updated successfully", "success");
        fetchSystemPrompts();
      } else {
        showAlert("Failed to update system prompt", "error");
      }
    } catch (error) {
      showAlert("Failed to update system prompt", "error");
    } finally {
      setLoading(false);
    }
  };

  const restorePrompt = async (historyId) => {
    setLoading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
      const response = await fetch(
        `${
          import.meta.env.VITE_API_ENDPOINT
        }/admin/restore_system_prompt?history_id=${historyId}`,
        {
          method: "POST",
          headers: {
            Authorization: token,
          },
        }
      );

      if (response.ok) {
        showAlert("System prompt restored successfully", "success");
        fetchSystemPrompts();
      } else {
        showAlert("Failed to restore system prompt", "error");
      }
    } catch (error) {
      showAlert("Failed to restore system prompt", "error");
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (message, severity) => {
    setAlert({ show: true, message, severity });
    setTimeout(
      () => setAlert({ show: false, message: "", severity: "info" }),
      5000
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const hasHistory = promptHistory.length > 0;
  const currentPrompt = hasHistory ? promptHistory[historyIndex] : null;

  return (
    <Box
      sx={{
        p: 3,
        mt: 8,
        ml: 0,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        flexGrow: 1,
        minWidth: 0,
        height: "calc(100vh - 64px)",
        overflowY: "auto",
        pb: 6,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <SettingsIcon sx={{ mr: 2, color: "#10b981" }} />
        <Typography variant="h4" sx={{ fontWeight: 600, color: "#1f2937" }}>
          AI Settings
        </Typography>
      </Box>

      {alert.show && (
        <Alert severity={alert.severity} sx={{ mb: 3 }}>
          {alert.message}
        </Alert>
      )}

      {/* Message Limit Settings */}
      <Card sx={{ mb: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, color: "#374151" }}>
            AI Message Limit
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={noLimit}
                onChange={(e) => setNoLimit(e.target.checked)}
                color="primary"
              />
            }
            label="No message limit"
            sx={{ mb: 2 }}
          />
          {!noLimit && (
            <Box sx={{ px: 2 }}>
              <Typography gutterBottom>
                Message limit: {messageLimit}
              </Typography>
              <Slider
                value={messageLimit}
                onChange={(e, newValue) => setMessageLimit(newValue)}
                min={1}
                max={200}
                step={1}
                marks={[
                  { value: 1, label: "1" },
                  { value: 50, label: "50" },
                  { value: 100, label: "100" },
                  { value: 200, label: "200" },
                ]}
                sx={{
                  color: "#10b981",
                  "& .MuiSlider-thumb": {
                    backgroundColor: "#10b981",
                  },
                  "& .MuiSlider-track": {
                    backgroundColor: "#10b981",
                  },
                }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* System Prompt Editor */}
      <Card sx={{ mb: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" sx={{ color: "#374151" }}>
              System Prompt Editor
            </Typography>
          </Box>
          <TextField
            fullWidth
            multiline
            rows={12}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter the system prompt for the AI..."
            variant="outlined"
            sx={{ mb: 2 }}
          />
          <Button
            startIcon={<SaveIcon />}
            onClick={updateSystemPrompt}
            disabled={loading || !systemPrompt.trim()}
            variant="contained"
            sx={{
              backgroundColor: "#10b981",
              "&:hover": {
                backgroundColor: "#059669",
              },
              "&:disabled": {
                backgroundColor: "#d1d5db",
              },
            }}
          >
            {loading ? "Saving..." : "Save System Prompt"}
          </Button>
        </CardContent>
      </Card>

      {/* Previous System Prompts with single-item pagination */}
      <Card sx={{ mb: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ color: "#374151" }}>
              Previous System Prompts
            </Typography>
            {hasHistory && (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <IconButton
                  aria-label="previous prompt"
                  onClick={() => setHistoryIndex((p) => Math.max(0, p - 1))}
                  disabled={historyIndex === 0}
                >
                  <ArrowBackIosNewIcon />
                </IconButton>
                <Typography variant="body2" sx={{ mx: 1 }}>
                  {historyIndex + 1} / {promptHistory.length}
                </Typography>
                <IconButton
                  aria-label="next prompt"
                  onClick={() =>
                    setHistoryIndex((p) => Math.min(promptHistory.length - 1, p + 1))
                  }
                  disabled={historyIndex >= promptHistory.length - 1}
                >
                  <ArrowForwardIosIcon />
                </IconButton>
              </Box>
            )}
          </Box>

          {!hasHistory ? (
            <Typography color="textSecondary">No history available</Typography>
          ) : (
            <Box sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="subtitle2">
                  {formatDate(currentPrompt.created_at)}
                </Typography>
                <Button
                  startIcon={<RestoreIcon />}
                  onClick={() => restorePrompt(currentPrompt.history_id)}
                  disabled={loading}
                  variant="contained"
                  sx={{
                    backgroundColor: "#10b981",
                    "&:hover": {
                      backgroundColor: "#059669",
                    },
                    "&:disabled": {
                      backgroundColor: "#d1d5db",
                    },
                  }}
                >
                  Restore
                </Button>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={6}
                value={currentPrompt.prompt_content}
                InputProps={{ readOnly: true }}
                variant="outlined"
              />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default AISettings;
