import { useState } from "react";
import {
  signIn,
  signUp,
  confirmSignIn,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  fetchAuthSession,
} from "aws-amplify/auth";
import { toast } from "react-toastify";

const toastOpts = {
  position: "top-center",
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "colored",
};

/**
 * Auth-flow state machine hook.
 *
 * Possible `authStep` values:
 *   "login" | "signup" | "confirmSignup" | "forgotPassword" | "newPassword"
 *
 * The forgot-password flow has an internal sub-step managed via `resetStep`:
 *   "requestReset" | "confirmReset" | "done"
 */
export default function useAuthFlow() {
  // ── which screen is visible ──
  const [authStep, setAuthStep] = useState("login");

  // ── shared form fields ──
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // ── status / error ──
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const [error, setError] = useState("");

  // ── forgot-password sub-state ──
  const [confirmationCode, setConfirmationCode] = useState("");
  const [newPasswordValue, setNewPasswordValue] = useState(false);
  const [resetStep, setResetStep] = useState("requestReset");
  const [message, setMessage] = useState("");

  // ────────────────────────────────────────
  // Navigation helpers
  // ────────────────────────────────────────
  const goTo = (step) => {
    setAuthStep(step);
    setPasswordError("");
    setConfirmationError("");
    setError("");
  };

  // ────────────────────────────────────────
  // Sign In
  // ────────────────────────────────────────
  const handleSignIn = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      const user = await signIn({
        username: username,
        password: password,
      });
      console.log(
        "USER SUCCESSFULLY LOGGED IN:",
        user.isSignedIn,
        user.nextStep.signInStep
      );
      if (!user.isSignedIn) {
        if (
          user.nextStep.signInStep ===
          "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
        ) {
          setAuthStep("newPassword");
          setLoading(false);
        } else if (user.nextStep.signInStep === "CONFIRM_SIGN_UP") {
          setAuthStep("confirmSignup");
          setLoading(false);
        }
      } else {
        window.location.reload();
      }
    } catch (error) {
      toast.error(`Error logging in: ${error}`, toastOpts);
      console.log("Error logging in:", error);
      setLoading(false);
    }
  };

  // ────────────────────────────────────────
  // Sign Up
  // ────────────────────────────────────────
  const handleSignUp = async (event) => {
    event.preventDefault();

    if (!username || !password || !confirmPassword || !firstName || !lastName) {
      toast.error("All fields are required", {
        position: "top-center",
        autoClose: 3000,
        theme: "colored",
      });
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      toast.error("Passwords do not match", { theme: "colored" });
      return;
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
      toast.error("Password must be at least 8 characters long", {
        theme: "colored",
      });
      return;
    }

    if (!/[a-z]/.test(password)) {
      setPasswordError("Password must contain at least one lowercase letter");
      toast.error("Password must contain at least one lowercase letter", {
        theme: "colored",
      });
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setPasswordError("Password must contain at least one uppercase letter");
      toast.error("Password must contain at least one uppercase letter", {
        theme: "colored",
      });
      return;
    }

    if (!/[0-9]/.test(password)) {
      setPasswordError("Password must contain at least one number");
      toast.error("Password must contain at least one number", {
        theme: "colored",
      });
      return;
    }

    setPasswordError("");

    try {
      setLoading(true);
      console.log("signing up");

      const { isSignUpComplete, nextStep } = await signUp({
        username: username,
        password: password,
        attributes: {
          email: username,
        },
      });

      console.log("signed up successfully:", isSignUpComplete, nextStep);

      if (!isSignUpComplete && nextStep?.signUpStep === "CONFIRM_SIGN_UP") {
        setAuthStep("confirmSignup");
        toast.success(
          "Account created. Check your email for the confirmation code.",
          { theme: "colored" }
        );
      }
    } catch (error) {
      const errorMessage = error.message.includes("PreSignUp failed with error")
        ? "Your email domain is not allowed. Please use a valid email address."
        : `Error signing up: ${error.message}`;
      toast.error(errorMessage, {
        position: "top-center",
        autoClose: 3000,
        theme: "colored",
      });
      console.log("Error signing up:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────────────────
  // New-user password (admin-created account)
  // ────────────────────────────────────────
  const handleNewUserPassword = async (event) => {
    event.preventDefault();
    const newPw = event.target.newPassword.value;
    const confirmNewPw = event.target.confirmNewPassword.value;

    if (newPw !== confirmNewPw) {
      setPasswordError("Passwords do not match!");
      toast.error("Passwords do not match!", toastOpts);
      return;
    }
    setPasswordError("");
    try {
      setLoading(true);
      console.log("Setting new password for user:", username);
      const attributes = {};
      const user = await confirmSignIn({
        challengeResponse: newPw,
        options: {
          userAttributes: attributes,
        },
      });
      console.log("User logged in:", user.isSignedIn, user.nextStep.signInStep);
      if (user.isSignedIn) {
        window.location.reload();
      }
    } catch (error) {
      toast.error(`Error: ${error}`, toastOpts);
      console.log("Error setting new password:", error);
      setLoading(false);
      setAuthStep("login");
    }
  };

  // ────────────────────────────────────────
  // Confirm Sign-Up
  // ────────────────────────────────────────
  const handleConfirmSignUp = async (event) => {
    event.preventDefault();
    const code = event.target.confirmationCode.value;
    try {
      setLoading(true);
      await confirmSignUp({
        username: username,
        confirmationCode: code,
      });

      console.log("code", code);

      const user = await signIn({
        username: username,
        password: password,
      });

      console.log("handle auto sign in", user.isSignedIn);

      if (user.isSignedIn) {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;

        const response = await fetch(
          `${
            import.meta.env.VITE_API_ENDPOINT
          }student/create_user?user_email=${encodeURIComponent(
            username
          )}&username=${encodeURIComponent(
            username
          )}&first_name=${encodeURIComponent(
            firstName
          )}&last_name=${encodeURIComponent(
            lastName
          )}&preferred_name=${encodeURIComponent(firstName)}`,
          {
            method: "POST",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );
        const data = await response.json();
        console.log("Response from backend:", data);

        setLoading(false);
        window.location.reload();
      } else {
        setLoading(false);
        setError("Automatic login failed. Please try signing in manually.");
      }
    } catch (error) {
      toast.error(`Error: ${error}`, toastOpts);
      console.log("Error confirming sign-up:", error);
      setLoading(false);
      setConfirmationError(error.message);
    }
  };

  const resendConfirmationCode = async () => {
    try {
      setLoading(true);
      await resendSignUpCode({ username: username });
      setLoading(false);
      setConfirmationError("");
    } catch (error) {
      toast.error(`Error: ${error}`, toastOpts);
      console.log("Error resending confirmation code:", error);
      setLoading(false);
    }
  };

  // ────────────────────────────────────────
  // Forgot Password
  // ────────────────────────────────────────
  async function handleResetPassword(email) {
    try {
      const output = await resetPassword({ username: email });
      handleResetPasswordNextSteps(output);
    } catch (error) {
      toast.error("Error Resetting Password", toastOpts);
      setMessage("");
    }
  }

  function handleResetPasswordNextSteps(output) {
    const { nextStep } = output;
    switch (nextStep.resetPasswordStep) {
      case "CONFIRM_RESET_PASSWORD_WITH_CODE":
        // eslint-disable-next-line no-case-declarations
        const codeDeliveryDetails = nextStep.codeDeliveryDetails;
        console.log(
          `Confirmation code was sent to ${codeDeliveryDetails.deliveryMedium}`
        );
        setMessage(
          `Confirmation code was sent to ${codeDeliveryDetails.deliveryMedium}`
        );
        setResetStep("confirmReset");
        break;
      case "DONE":
        setMessage("Successfully reset password.");
        setResetStep("done");
        console.log("Successfully reset password.");
        break;
    }
  }

  async function handleConfirmResetPassword(event) {
    event.preventDefault();
    try {
      await confirmResetPassword({
        username,
        confirmationCode,
        newPassword: newPasswordValue,
      });
      console.log("username", username);
      setMessage("Password successfully reset.");
      setResetStep("done");
      setError("");
    } catch (error) {
      toast.error(`Error: ${error}`, toastOpts);
      console.log(error);
      console.log(username);
      console.log(confirmationCode);
      setError(error.message);
    }
  }

  return {
    // current step
    authStep,
    goTo,

    // shared fields
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

    // status
    loading,
    passwordError,
    confirmationError,
    error,

    // handlers
    handleSignIn,
    handleSignUp,
    handleNewUserPassword,
    handleConfirmSignUp,
    resendConfirmationCode,

    // forgot password
    confirmationCode,
    setConfirmationCode,
    newPasswordValue,
    setNewPasswordValue,
    resetStep,
    setResetStep,
    message,
    handleResetPassword,
    handleConfirmResetPassword,
  };
}
