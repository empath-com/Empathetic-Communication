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
  Toolbar,
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
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <SettingsIcon sx={{ mr: 2, color: "#10b981", fontSize: "2rem" }} />
        <Typography variant="h4" sx={{ fontWeight: 700, color: "#1f2937" }}>
          AI Settings
        </Typography>
      </Box>

      {alert.show && (
        <Alert severity={alert.severity} sx={{ mb: 3 }}>
          {alert.message}
        </Alert>
      )}

      {/* Message Limit Settings */}
      <Card
        sx={{
          mb: 3,
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            padding: 3,
            paddingBottom: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #f3f4f6",
            backgroundColor: "white",
          }}
        >
          <Typography
            sx={{
              color: "#1f2937",
              fontWeight: "600",
              fontSize: "1.25rem",
            }}
          >
            AI Message Limit
          </Typography>
        </Box>
        <CardContent sx={{ backgroundColor: "white", pt: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={noLimit}
                onChange={(e) => setNoLimit(e.target.checked)}
                color="primary"
                sx={{
                  "& .MuiSwitch-switchBase.Mui-checked": {
                    color: "#10b981",
                  },
                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                    backgroundColor: "#10b981",
                  },
                }}
              />
            }
            label="No message limit"
            sx={{ mb: 2, fontWeight: 500 }}
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
      <Card
        sx={{
          mb: 3,
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            padding: 3,
            paddingBottom: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #f3f4f6",
            backgroundColor: "white",
          }}
        >
          <Typography
            sx={{
              color: "#1f2937",
              fontWeight: "700",
              fontSize: "1.25rem",
            }}
          >
            System Prompt Editor
          </Typography>
          <Typography variant="body2" sx={{ color: "#6b7280" }}>
            <i>
              Changing the system prompt alters the AI's behavior and responses
              for ALL users.
            </i>
          </Typography>
        </Box>
        <CardContent sx={{ backgroundColor: "white" }}>
          <TextField
            fullWidth
            multiline
            minRows={4}
            maxRows={100}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter the system prompt for the AI..."
            variant="outlined"
            sx={{ mb: 2 }}
            InputProps={{
              sx: {
                overflow: "hidden", // Prevents scrollbars
                borderRadius: "8px",
                backgroundColor: "#f9fafb",
                transition: "all 0.2s ease-in-out",
                "&:hover": {
                  backgroundColor: "#f3f4f6",
                },
                "&.Mui-focused": {
                  backgroundColor: "white",
                  boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.1)",
                },
                "& fieldset": {
                  borderColor: "#e5e7eb",
                },
                "&:hover fieldset": {
                  borderColor: "#10b981",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#10b981",
                  borderWidth: "2px",
                },
              },
            }}
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
                boxShadow:
                  "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                transform: "translateY(-1px)",
              },
              "&:active": {
                transform: "translateY(0)",
              },
              "&:disabled": {
                backgroundColor: "#d1d5db",
              },
              transition: "all 0.2s ease-in-out",
              borderRadius: "8px",
              fontWeight: 600,
              textTransform: "none",
              boxShadow:
                "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            }}
          >
            {loading ? "Saving..." : "Save System Prompt"}
          </Button>
        </CardContent>
      </Card>

      {/* Previous System Prompts with single-item pagination */}
      <Card
        sx={{
          mb: 3,
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            padding: 3,
            paddingBottom: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #f3f4f6",
            backgroundColor: "white",
          }}
        >
          <Typography
            sx={{
              color: "#1f2937",
              fontWeight: "600",
              fontSize: "1.25rem",
            }}
          >
            Previous System Prompts
          </Typography>
          {hasHistory && (
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <IconButton
                aria-label="previous prompt"
                onClick={() => setHistoryIndex((p) => Math.max(0, p - 1))}
                disabled={historyIndex === 0}
                sx={{
                  color: historyIndex === 0 ? "#d1d5db" : "#10b981",
                  "&:hover": { backgroundColor: "#f3f4f6" },
                }}
              >
                <ArrowBackIosNewIcon />
              </IconButton>
              <Typography variant="body2" sx={{ mx: 1, fontWeight: 600 }}>
                {historyIndex + 1} / {promptHistory.length}
              </Typography>
              <IconButton
                aria-label="next prompt"
                onClick={() =>
                  setHistoryIndex((p) =>
                    Math.min(promptHistory.length - 1, p + 1)
                  )
                }
                disabled={historyIndex >= promptHistory.length - 1}
                sx={{
                  color:
                    historyIndex >= promptHistory.length - 1
                      ? "#d1d5db"
                      : "#10b981",
                  "&:hover": { backgroundColor: "#f3f4f6" },
                }}
              >
                <ArrowForwardIosIcon />
              </IconButton>
            </Box>
          )}
        </Box>
        <CardContent sx={{ backgroundColor: "white" }}>
          {!hasHistory ? (
            <Typography color="textSecondary">No history available</Typography>
          ) : (
            <Box sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
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
                      transform: "translateY(-1px)",
                    },
                    "&:active": {
                      transform: "translateY(0)",
                    },
                    "&:disabled": {
                      backgroundColor: "#d1d5db",
                    },
                    transition: "all 0.2s ease-in-out",
                    borderRadius: "8px",
                    fontWeight: 600,
                    textTransform: "none",
                  }}
                >
                  Restore
                </Button>
              </Box>
              <TextField
                fullWidth
                multiline
                minRows={4}
                maxRows={100}
                value={currentPrompt.prompt_content}
                InputProps={{
                  readOnly: true,
                  sx: {
                    overflow: "hidden", // Prevents scrollbars
                    borderRadius: "8px",
                    backgroundColor: "#f9fafb",
                    "& fieldset": {
                      borderColor: "#e5e7eb",
                    },
                  },
                }}
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
