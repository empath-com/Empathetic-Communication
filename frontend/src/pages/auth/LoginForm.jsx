import { Button, TextField, Link, Grid, Box, Typography } from "@mui/material";
import { textFieldSx, primaryButtonSx, linkSx, formPanelSx, headingSx } from "./styles";

export default function LoginForm({
  username,
  setUsername,
  password,
  setPassword,
  onSubmit,
  onForgotPassword,
  onCreateAccount,
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
          maxWidth: "400px",
        }}
      >
        <Typography component="h1" variant="h4" sx={headingSx}>
          Sign in
        </Typography>
        <Box
          component="form"
          noValidate
          onSubmit={onSubmit}
          sx={{ mt: 1, width: "100%" }}
        >
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            inputProps={{ maxLength: 40 }}
            sx={textFieldSx}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            inputProps={{ maxLength: 50 }}
            sx={{ ...textFieldSx, mb: 3 }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={primaryButtonSx}
          >
            Sign In
          </Button>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Link
                href="#"
                variant="body2"
                onClick={onForgotPassword}
                sx={linkSx}
              >
                Forgot password?
              </Link>
            </Grid>
            <Grid item xs={6} sx={{ textAlign: "right" }}>
              <Link
                href="#"
                variant="body2"
                onClick={onCreateAccount}
                sx={linkSx}
              >
                Create your account
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Grid>
  );
}
