import { Button, Box, Typography } from "@mui/material";

export default function NewPasswordForm({ passwordError, onSubmit }) {
  return (
    <Box
      sx={{
        my: 8,
        mx: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Typography component="h1" variant="h5" paddingBottom={3}>
        New User
      </Typography>
      <p className="text-sm">
        Please enter a new password for your account.
      </p>
      <div className="flex flex-col items-center justify-center">
        <form onSubmit={onSubmit}>
          <input
            className="input input-bordered mt-1 h-10 w-full text-xs"
            name="newPassword"
            placeholder="New Password"
            type="password"
            required
          />
          <input
            className="input input-bordered mt-1 h-10 w-full text-xs"
            name="confirmNewPassword"
            placeholder="Confirm New Password"
            type="password"
            required
          />
          {passwordError && (
            <div className="block text-m mb-1 mt-6 text-red-600">
              {passwordError}
            </div>
          )}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            sx={{ mt: 3, mb: 2 }}
          >
            Submit New Password
          </Button>
        </form>
      </div>
    </Box>
  );
}
