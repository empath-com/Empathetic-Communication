import { renderHook, act } from "@testing-library/react";

const { mockCreateStudentUserProfile } = vi.hoisted(() => ({
  mockCreateStudentUserProfile: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../../utils/apiClient", () => ({
  createApiClient: vi.fn(() => ({ mockedClient: true })),
}));

vi.mock("../../../services/api/studentChatApi", () => ({
  createStudentChatApi: vi.fn(() => ({
    createStudentUserProfile: mockCreateStudentUserProfile,
  })),
}));

vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  confirmSignIn: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: { idToken: "token" },
  }),
}));

import useAuthFlow from "../useAuthFlow";
import {
  signIn,
  signUp,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
} from "aws-amplify/auth";

describe("useAuthFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves to new-password step when Cognito requires password change", async () => {
    signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
    });

    const { result } = renderHook(() => useAuthFlow());

    act(() => {
      result.current.setUsername("student@example.com");
      result.current.setPassword("Password123");
    });

    await act(async () => {
      await result.current.handleSignIn({ preventDefault: vi.fn() });
    });

    expect(result.current.authStep).toBe("newPassword");
  });

  it("blocks sign-up when passwords do not match", async () => {
    const { result } = renderHook(() => useAuthFlow());

    act(() => {
      result.current.setUsername("student@example.com");
      result.current.setPassword("Password123");
      result.current.setConfirmPassword("Different123");
      result.current.setFirstName("First");
      result.current.setLastName("Last");
    });

    await act(async () => {
      await result.current.handleSignUp({ preventDefault: vi.fn() });
    });

    expect(result.current.passwordError).toBe("Passwords do not match");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("creates student profile after successful sign-up confirmation", async () => {
    confirmSignUp.mockResolvedValue({});
    signIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: "DONE" } });
    mockCreateStudentUserProfile.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useAuthFlow());

    act(() => {
      result.current.setUsername("student@example.com");
      result.current.setPassword("Password123");
      result.current.setFirstName("Student");
      result.current.setLastName("User");
    });

    await act(async () => {
      await result.current.handleConfirmSignUp({
        preventDefault: vi.fn(),
        target: { confirmationCode: { value: "123456" } },
      });
    });

    expect(mockCreateStudentUserProfile).toHaveBeenCalledWith({
      userEmail: "student@example.com",
      username: "student@example.com",
      firstName: "Student",
      lastName: "User",
      preferredName: "Student",
    });
  });

  it("drives reset-password transitions", async () => {
    resetPassword.mockResolvedValue({
      nextStep: {
        resetPasswordStep: "CONFIRM_RESET_PASSWORD_WITH_CODE",
        codeDeliveryDetails: { deliveryMedium: "EMAIL" },
      },
    });
    confirmResetPassword.mockResolvedValue({});

    const { result } = renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.handleResetPassword("student@example.com");
    });
    expect(result.current.resetStep).toBe("confirmReset");

    act(() => {
      result.current.setUsername("student@example.com");
      result.current.setConfirmationCode("123456");
      result.current.setNewPasswordValue("Password456");
    });

    await act(async () => {
      await result.current.handleConfirmResetPassword({ preventDefault: vi.fn() });
    });

    expect(result.current.resetStep).toBe("done");
  });
});
