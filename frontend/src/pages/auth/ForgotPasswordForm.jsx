import { Button, TextField, Link, Grid, Box, Typography } from "@mui/material";
import { textFieldSx, primaryButtonSx, linkSx, formPanelSx, headingSx } from "./styles";

export default function ForgotPasswordForm({
  username,
  setUsername,
  confirmationCode,
  setConfirmationCode,
  newPasswordValue,
  setNewPasswordValue,
  resetStep,
  message,
  error,
  onSendResetCode,
  onConfirmReset,
  onBackToLogin,
}) {
  return (
    <Grid
      item
      xs={12}
      sm={9}
      md={7}
      sx={formPanelSx}
    >
      <Box
        sx={{
          my: 8,
          mx: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: "420px",
        }}
      >
        <Typography
          component="h1"
          variant="h4"
          sx={{
            ...headingSx,
            marginBottom: resetStep === "confirmReset" ? "20px" : "28px",
          }}
        >
          {resetStep === "confirmReset"
            ? "Enter reset code"
            : "Reset password"}
        </Typography>
        {message && resetStep === "confirmReset" && (
          <Typography
            variant="body2"
            sx={{
              mb: 1,
              color: "#059669",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {message}
          </Typography>
        )}

        {/* Step 1: Request Reset */}
        {resetStep === "requestReset" && (
          <Box sx={{ width: "100%" }}>
            <TextField
              label="Email Address"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              margin="normal"
              inputProps={{ maxLength: 40 }}
              sx={textFieldSx}
            />
            <Button
              variant="contained"
              onClick={() => onSendResetCode(username)}
              fullWidth
              sx={{
                ...primaryButtonSx,
                mt: 1,
              }}
            >
              Send Reset Code
            </Button>
            <Typography
              variant="body2"
              sx={{
                textAlign: "center",
                color: "#6b7280",
                fontSize: "0.85rem",
                lineHeight: 1.5,
                px: 1,
              }}
            >
              We will send a short-lived code to your email so you can create a
              new password.
            </Typography>
            <Box sx={{ textAlign: "center", mt: 3 }}>
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onBackToLogin();
                }}
                variant="body2"
                sx={{
                  ...linkSx,
                  fontWeight: 500,
                  display: "inline-block",
                }}
              >
                Back to sign in
              </Link>
            </Box>
          </Box>
        )}

        {/* Step 2: Confirm Reset */}
        {resetStep === "confirmReset" && (
          <Box
            component="form"
            noValidate
            onSubmit={onConfirmReset}
            sx={{ width: "100%" }}
          >
            <TextField
              label="Confirmation Code"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              fullWidth
              margin="normal"
              inputProps={{ maxLength: 15 }}
              sx={textFieldSx}
            />
            <TextField
              label="New Password"
              type="password"
              value={newPasswordValue}
              onChange={(e) => setNewPasswordValue(e.target.value)}
              fullWidth
              margin="normal"
              inputProps={{ maxLength: 50 }}
              sx={{ ...textFieldSx, mb: 3 }}
            />
            {error && (
              <Typography
                variant="body2"
                sx={{ color: "#dc2626", mt: 0, fontWeight: 500 }}
              >
                {error}
              </Typography>
            )}
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{
                ...primaryButtonSx,
                mt: 1,
                mb: 2,
              }}
            >
              Reset Password
            </Button>
            <Box sx={{ textAlign: "center", mt: 1 }}>
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onBackToLogin();
                }}
                variant="body2"
                sx={{
                  ...linkSx,
                  fontWeight: 500,
                  display: "inline-block",
                }}
              >
                Back to sign in
              </Link>
            </Box>
          </Box>
        )}

        {/* Step 3: Done */}
        {resetStep === "done" && (
          <Typography
            color="primary"
            sx={{
              mt: 1,
              textAlign: "center",
              fontSize: "1rem",
              fontWeight: 500,
            }}
          >
            Password has been successfully reset.
          </Typography>
        )}
      </Box>
    </Grid>
  );
}
