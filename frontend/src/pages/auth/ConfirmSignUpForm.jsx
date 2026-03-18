import { Button, TextField, Link, Grid, Box, Typography } from "@mui/material";
import { textFieldSx, primaryButtonSx, linkSx, formPanelSx, headingSx } from "./styles";

export default function ConfirmSignUpForm({
  confirmationError,
  onSubmit,
  onResendCode,
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
        <Typography
          component="h1"
          variant="h4"
          sx={{
            ...headingSx,
            fontWeight: 700,
            marginBottom: "28px",
          }}
        >
          Verify your account
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
            id="confirmationCode"
            label="Confirmation Code"
            name="confirmationCode"
            autoFocus
            type="text"
            inputProps={{ maxLength: 15, inputMode: "numeric" }}
            sx={textFieldSx}
          />
          {confirmationError && (
            <Typography
              variant="body2"
              sx={{ color: "#dc2626", mt: 1, fontWeight: 500 }}
            >
              {confirmationError}
            </Typography>
          )}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{
              ...primaryButtonSx,
              mt: 3,
              mb: 2,
              fontWeight: 600,
            }}
          >
            Submit Code
          </Button>
          <Box sx={{ textAlign: "center" }}>
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onResendCode();
              }}
              variant="body2"
              sx={{
                ...linkSx,
                fontWeight: 500,
                display: "inline-block",
              }}
            >
              Didn&apos;t get a code? Resend
            </Link>
          </Box>
        </Box>
      </Box>
    </Grid>
  );
}
