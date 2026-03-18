import "./LoginStyles.css";
import { Grid, CssBaseline, Typography } from "@mui/material";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import PageContainer from "./Container";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../Theme";

import useAuthFlow from "./auth/useAuthFlow";
import LoginForm from "./auth/LoginForm";
import SignUpForm from "./auth/SignUpForm";
import ConfirmSignUpForm from "./auth/ConfirmSignUpForm";
import ForgotPasswordForm from "./auth/ForgotPasswordForm";
import NewPasswordForm from "./auth/NewPasswordForm";

export const Login = () => {
  const auth = useAuthFlow();

  const renderForm = () => {
    if (auth.loading) return null;

    switch (auth.authStep) {
      case "signup":
        return (
          <SignUpForm
            username={auth.username}
            setUsername={auth.setUsername}
            password={auth.password}
            setPassword={auth.setPassword}
            confirmPassword={auth.confirmPassword}
            setConfirmPassword={auth.setConfirmPassword}
            firstName={auth.firstName}
            setFirstName={auth.setFirstName}
            lastName={auth.lastName}
            setLastName={auth.setLastName}
            onSubmit={auth.handleSignUp}
            onBackToLogin={() => auth.goTo("login")}
          />
        );

      case "newPassword":
        return (
          <NewPasswordForm
            passwordError={auth.passwordError}
            onSubmit={auth.handleNewUserPassword}
          />
        );

      case "confirmSignup":
        return (
          <ConfirmSignUpForm
            confirmationError={auth.confirmationError}
            onSubmit={auth.handleConfirmSignUp}
            onResendCode={auth.resendConfirmationCode}
          />
        );

      case "forgotPassword":
        return (
          <ForgotPasswordForm
            username={auth.username}
            setUsername={auth.setUsername}
            confirmationCode={auth.confirmationCode}
            setConfirmationCode={auth.setConfirmationCode}
            newPasswordValue={auth.newPasswordValue}
            setNewPasswordValue={auth.setNewPasswordValue}
            resetStep={auth.resetStep}
            message={auth.message}
            error={auth.error}
            onSendResetCode={auth.handleResetPassword}
            onConfirmReset={auth.handleConfirmResetPassword}
            onBackToLogin={() => {
              auth.goTo("login");
              auth.setResetStep("requestReset");
            }}
          />
        );

      case "login":
      default:
        return (
          <LoginForm
            username={auth.username}
            setUsername={auth.setUsername}
            password={auth.password}
            setPassword={auth.setPassword}
            onSubmit={auth.handleSignIn}
            onForgotPassword={() => auth.goTo("forgotPassword")}
            onCreateAccount={() => auth.goTo("signup")}
          />
        );
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <PageContainer>
        <Grid
          container
          component="main"
          sx={{ height: "100vh", bgcolor: "#ffffff" }}
        >
          <CssBaseline />

          {/* ── Left branding panel ── */}
          <Grid
            item
            xs={false}
            sm={3}
            md={5}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px",
              background:
                "linear-gradient(135deg, #D1FAE5, #e3fcef 0%, #D1FAE5 100%)",
              position: "relative",
              overflow: "hidden",
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.15), transparent 60%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.15), transparent 60%)",
                pointerEvents: "none",
              },
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "row",
                textAlign: "left",
                zIndex: 1,
                maxWidth: "100%",
              }}
              className="fadeInLeft"
            >
              <img
                src={"logo.png"}
                alt="Heartbeat"
                className="heartbeat-image"
                style={{
                  width: "120px",
                  maxWidth: "100%",
                  height: "auto",
                  maxHeight: "120px",
                  display: "block",
                  margin: "0 auto 0px",
                  objectFit: "contain",
                }}
              />
              <div
                style={{
                  maxWidth: "80%",
                  margin: "0 auto",
                  display: "flex",
                  flexDirection: "column",
                  textAlign: "left",
                  justifyContent: "center",
                  alignItems: "flex-start",
                }}
              >
                <Typography
                  variant="h3"
                  sx={{
                    color: "#1f2937",
                    fontWeight: "550",
                    fontSize: "3rem",
                    lineHeight: "1.1",
                    marginBottom: "12px",
                    textAlign: "left",
                    fontFamily: "Outfit, sans-serif",
                    marginLeft: "1rem",
                  }}
                  className="fadeInLeft"
                >
                  Virtual Care Interactions
                </Typography>
                <Typography
                  variant="h4"
                  sx={{
                    color: "#1f2937",
                    fontWeight: "500",
                    fontSize: "1.5rem",
                    lineHeight: "1.2",
                    marginBottom: "8px",
                    textAlign: "left",
                    fontFamily: "Outfit, sans-serif",
                  }}
                  className="fadeInLeftDelay"
                >
                  With Empathetic Communication
                </Typography>
              </div>
            </div>
          </Grid>

          {/* ── Right form panel ── */}
          {renderForm()}
        </Grid>
      </PageContainer>
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </ThemeProvider>
  );
};

export default Login;
