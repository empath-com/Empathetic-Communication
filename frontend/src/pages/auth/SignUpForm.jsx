import { Button, TextField, Link, Grid, Box, Typography } from "@mui/material";
import { textFieldSx, primaryButtonSx, linkSx, formPanelSx, headingSx } from "./styles";

export default function SignUpForm({
  username,
  setUsername,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  onSubmit,
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
          maxWidth: "500px",
        }}
      >
        <Typography
          component="h1"
          variant="h4"
          sx={{
            ...headingSx,
            marginBottom: "32px",
          }}
        >
          Create your account
        </Typography>
        <Box sx={{ mt: 1, width: "100%" }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                autoComplete="given-name"
                name="firstName"
                required
                fullWidth
                id="firstName"
                label="First Name"
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                inputProps={{ maxLength: 30 }}
                sx={textFieldSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                id="lastName"
                label="Last Name"
                name="lastName"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                inputProps={{ maxLength: 30 }}
                sx={textFieldSx}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                inputProps={{ maxLength: 40 }}
                sx={textFieldSx}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                inputProps={{ maxLength: 50 }}
                sx={textFieldSx}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                name="confirmPassword"
                label="Confirm password"
                type="password"
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                inputProps={{ maxLength: 50 }}
                sx={textFieldSx}
              />
            </Grid>
          </Grid>
          <Typography
            variant="body2"
            sx={{
              color: "#6b7280",
              textAlign: "center",
              marginTop: "24px",
              marginBottom: "16px",
              padding: "16px",
              backgroundColor: "#f9fafb",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              fontSize: "0.875rem",
              lineHeight: "1.5",
            }}
          >
            Providing personal information is optional and entirely at your
            discretion. You can use this app without sharing any personal details
            beyond those necessary for account setup.
          </Typography>
          <Button
            fullWidth
            variant="contained"
            onClick={onSubmit}
            sx={{
              ...primaryButtonSx,
              boxShadow: "none",
            }}
          >
            Sign Up
          </Button>
          <Grid container justifyContent="center">
            <Grid item>
              <Link
                href="#"
                variant="body2"
                onClick={onBackToLogin}
                sx={linkSx}
              >
                Already have an account? Sign in
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Grid>
  );
}
