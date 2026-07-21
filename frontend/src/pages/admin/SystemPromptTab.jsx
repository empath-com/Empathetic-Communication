import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import {
  Save as SaveIcon,
  Restore as RestoreIcon,
  ArrowBackIosNew as ArrowBackIosNewIcon,
  ArrowForwardIos as ArrowForwardIosIcon,
  Warning as WarningIcon,
  RestartAlt as ResetIcon,
  Chat as ChatIcon,
  History as HistoryIcon,
} from "@mui/icons-material";

/**
 * Tab 0 — System Prompt editor + history + "Load Default" confirm dialog.
 *
 * Receives the full `settings` object spread from `useAISettings()`.
 */
const SystemPromptTab = ({
  systemPrompt,
  setSystemPrompt,
  promptHistory,
  historyIndex,
  setHistoryIndex,
  loading,
  openConfirmDialog,
  setOpenConfirmDialog,
  updateSystemPrompt,
  restorePrompt,
  showAlert,
  DEFAULT_PROMPT,
  formatDate,
}) => {
  return (
    <>
      {/* ===== SYSTEM PROMPT EDITOR ===== */}
      <Card sx={{ boxShadow: 3, borderRadius: 2, width: "100%" }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1, justifyContent: "center" }}>
            <ChatIcon sx={{ mr: 1, color: "#10b981" }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: "#1f2937" }}>
              System Prompt Manager
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            This prompt controls how the AI behaves as a patient. Changes affect ALL simulation groups.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={12}
            maxRows={20}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter the system prompt for the AI..."
            variant="outlined"
            sx={{ mb: 3 }}
            inputProps={{ style: { textAlign: "left" } }}
          />
          <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
            <Button
              startIcon={<ResetIcon />}
              onClick={() => setOpenConfirmDialog(true)}
              disabled={loading}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              Load Default Prompt
            </Button>
            <Button
              startIcon={<SaveIcon />}
              onClick={updateSystemPrompt}
              disabled={loading || !systemPrompt.trim()}
              variant="contained"
              sx={{
                borderRadius: 2,
                backgroundColor: "#10b981",
                "&:hover": { backgroundColor: "#059669" },
              }}
            >
              {loading ? "Saving..." : "Save System Prompt"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ===== SYSTEM PROMPT HISTORY ===== */}
      <Card sx={{ mt: 3, boxShadow: 3, borderRadius: 2, width: "100%" }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1, justifyContent: "center" }}>
            <HistoryIcon sx={{ mr: 1, color: "#10b981" }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: "#1f2937" }}>
              System Prompt History
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Browse earlier versions. Restore any version you want to use.
          </Typography>
          {promptHistory.length > 0 ? (
            <>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 2 }}>
                <IconButton
                  onClick={() => setHistoryIndex((p) => Math.max(0, p - 1))}
                  disabled={historyIndex === 0}
                >
                  <ArrowBackIosNewIcon />
                </IconButton>
                <Typography variant="body1" sx={{ mx: 2, fontWeight: 500 }}>
                  Version {historyIndex + 1} of {promptHistory.length}
                </Typography>
                <IconButton
                  onClick={() =>
                    setHistoryIndex((p) => Math.min(promptHistory.length - 1, p + 1))
                  }
                  disabled={historyIndex >= promptHistory.length - 1}
                >
                  <ArrowForwardIosIcon />
                </IconButton>
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 2, textAlign: "center" }}
              >
                Saved: {formatDate(promptHistory[historyIndex]?.created_at)}
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={8}
                maxRows={12}
                value={promptHistory[historyIndex]?.prompt_content || ""}
                InputProps={{ readOnly: true }}
                variant="outlined"
                sx={{ mb: 2 }}
              />
              <Button
                startIcon={<RestoreIcon />}
                onClick={() => restorePrompt(promptHistory[historyIndex].history_id)}
                disabled={loading}
                variant="contained"
                fullWidth
                sx={{
                  backgroundColor: "#10b981",
                  "&:hover": { backgroundColor: "#059669" },
                }}
              >
                Restore This Version
              </Button>
            </>
          ) : (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography color="text.secondary">No history available</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ===== CONFIRM DIALOG: LOAD DEFAULT SYSTEM PROMPT ===== */}
      <Dialog open={openConfirmDialog} onClose={() => setOpenConfirmDialog(false)}>
        <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
          <WarningIcon sx={{ mr: 1, color: "#f59e0b" }} />
          Load Default System Prompt?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will replace your current system prompt with the default. Your current prompt will
            be saved in history.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenConfirmDialog(false)}>Cancel</Button>
          <Button
            onClick={() => {
              setSystemPrompt(DEFAULT_PROMPT);
              setOpenConfirmDialog(false);
              showAlert("Default prompt loaded - remember to save!", "success");
            }}
            variant="contained"
            sx={{ backgroundColor: "#10b981", "&:hover": { backgroundColor: "#059669" } }}
          >
            Load Default
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SystemPromptTab;
