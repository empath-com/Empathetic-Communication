import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  IconButton,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Save as SaveIcon,
  Restore as RestoreIcon,
  ArrowBackIosNew as ArrowBackIosNewIcon,
  ArrowForwardIos as ArrowForwardIosIcon,
  Warning as WarningIcon,
  RestartAlt as ResetIcon,
  Psychology as PsychologyIcon,
  History as HistoryIcon,
} from "@mui/icons-material";

/**
 * Tab 1 — Empathy Prompt editor + evaluation tool selector + history + confirm dialog.
 *
 * Receives the full `settings` object spread from `useAISettings()`.
 */
const EmpathyPromptTab = ({
  empathyPrompt,
  setEmpathyPrompt,
  empathyTool,
  setEmpathyTool,
  empathyPromptHistory,
  empathyHistoryIndex,
  setEmpathyHistoryIndex,
  loading,
  openEmpathyConfirmDialog,
  setOpenEmpathyConfirmDialog,
  updateEmpathyPrompt,
  restoreEmpathyPrompt,
  showAlert,
  DEFAULT_EMPATHY_PROMPT,
  formatDate,
}) => {
  return (
    <>
      {/* ===== EMPATHY PROMPT EDITOR ===== */}
      <Card sx={{ mb: 4, boxShadow: 3, borderRadius: 2, width: "100%" }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1, justifyContent: "center" }}>
            <PsychologyIcon sx={{ mr: 1, color: "#10b981" }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: "#1f2937" }}>
              Empathy Coach Prompt Manager
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This prompt controls the global default empathy evaluation behavior. Groups inherit these
            settings unless they define a group-level override.
          </Typography>
          <FormControl size="small" sx={{ mb: 3, minWidth: 240 }}>
            <InputLabel id="empathy-tool-label">Evaluation Tool</InputLabel>
            <Select
              labelId="empathy-tool-label"
              value={empathyTool}
              label="Evaluation Tool"
              onChange={(e) => setEmpathyTool(e.target.value)}
            >
              <MenuItem value="CARE">CARE Measure</MenuItem>
              <MenuItem value="CARE_RELAXED">CARE Measure (Relaxed)</MenuItem>
              <MenuItem value="PRISM">PRISM (SDT-informed)</MenuItem>
              <MenuItem value="PRISM_RELAXED">PRISM (SDT-informed, Relaxed)</MenuItem>
              <MenuItem value="NURSE">NURSE Framework</MenuItem>
              <MenuItem value="NURSE_RELAXED">NURSE Framework (Relaxed)</MenuItem>
            </Select>
          </FormControl>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Required Format:</strong> Your prompt must include{" "}
              <code>{"{patient_context}"}</code> and <code>{"{user_text}"}</code> placeholders, and
              return JSON with empathy scores and feedback.
            </Typography>
          </Alert>
          <TextField
            fullWidth
            multiline
            minRows={12}
            maxRows={20}
            value={empathyPrompt}
            onChange={(e) => setEmpathyPrompt(e.target.value)}
            placeholder="Enter the empathy evaluation prompt..."
            variant="outlined"
            sx={{ mb: 3 }}
            inputProps={{ style: { textAlign: "left" } }}
          />
          <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
            <Button
              startIcon={<ResetIcon />}
              onClick={() => setOpenEmpathyConfirmDialog(true)}
              disabled={loading}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              Load Default Prompt
            </Button>
            <Button
              startIcon={<SaveIcon />}
              onClick={updateEmpathyPrompt}
              disabled={loading || !empathyPrompt.trim()}
              variant="contained"
              sx={{
                borderRadius: 2,
                backgroundColor: "#10b981",
                "&:hover": { backgroundColor: "#059669" },
              }}
            >
              {loading ? "Saving..." : "Save Empathy Prompt"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ===== EMPATHY PROMPT HISTORY ===== */}
      <Card sx={{ mt: 3, boxShadow: 3, borderRadius: 2, width: "100%" }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1, justifyContent: "center" }}>
            <HistoryIcon sx={{ mr: 1, color: "#10b981" }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: "#1f2937" }}>
              Empathy Prompt History
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Browse earlier versions. Restore any version you want to use.
          </Typography>
          {empathyPromptHistory.length > 0 ? (
            <>
              <Box
                sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 2 }}
              >
                <IconButton
                  onClick={() => setEmpathyHistoryIndex((p) => Math.max(0, p - 1))}
                  disabled={empathyHistoryIndex === 0}
                >
                  <ArrowBackIosNewIcon />
                </IconButton>
                <Typography variant="body1" sx={{ mx: 2, fontWeight: 500 }}>
                  Version {empathyHistoryIndex + 1} of {empathyPromptHistory.length}
                </Typography>
                <IconButton
                  onClick={() =>
                    setEmpathyHistoryIndex((p) =>
                      Math.min(empathyPromptHistory.length - 1, p + 1)
                    )
                  }
                  disabled={empathyHistoryIndex >= empathyPromptHistory.length - 1}
                >
                  <ArrowForwardIosIcon />
                </IconButton>
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 2, textAlign: "center" }}
              >
                Saved: {formatDate(empathyPromptHistory[empathyHistoryIndex]?.created_at)}
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={8}
                maxRows={12}
                value={empathyPromptHistory[empathyHistoryIndex]?.prompt_content || ""}
                InputProps={{ readOnly: true }}
                variant="outlined"
                sx={{ mb: 2 }}
              />
              <Button
                startIcon={<RestoreIcon />}
                onClick={() =>
                  restoreEmpathyPrompt(empathyPromptHistory[empathyHistoryIndex].history_id)
                }
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

      {/* ===== CONFIRM DIALOG: LOAD DEFAULT EMPATHY PROMPT ===== */}
      <Dialog
        open={openEmpathyConfirmDialog}
        onClose={() => setOpenEmpathyConfirmDialog(false)}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
          <WarningIcon sx={{ mr: 1, color: "#f59e0b" }} />
          Load Default Empathy Prompt?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will replace your current empathy prompt with the default. Your current prompt will
            be saved in history.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenEmpathyConfirmDialog(false)}>Cancel</Button>
          <Button
            onClick={() => {
              setEmpathyPrompt(DEFAULT_EMPATHY_PROMPT);
              setOpenEmpathyConfirmDialog(false);
              showAlert("Default empathy prompt loaded - remember to save!", "success");
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

export default EmpathyPromptTab;
