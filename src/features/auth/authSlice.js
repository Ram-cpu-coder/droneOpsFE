import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { authService } from "./authService";

const friendlyAuthError = (message, fallback) => {
  if (!message) return fallback;

  if (message === "Google sign-in token could not be verified") {
    return "Google sign-in could not be verified. Check that the frontend and backend use the same Google Client ID, then restart the app.";
  }

  if (message === "Email verification required") {
    return "Verify your DroneOps account email before signing in. Google cannot bypass account verification.";
  }

  if (message === "No DroneOps account found for this email") {
    return "No DroneOps account is registered with this email. Create an account first.";
  }

  if (message === "Verify your email before resetting password") {
    return "This account is not verified yet. Verify your email before resetting the password.";
  }

  return message;
};

export const loginRequested = createAsyncThunk(
  "auth/loginRequested",
  async (credentials, { rejectWithValue }) => {
    try {
      return await authService.login(credentials);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);

export const googleLoginRequested = createAsyncThunk(
  "auth/googleLoginRequested",
  async (credential, { rejectWithValue }) => {
    try {
      return await authService.loginWithGoogle(credential);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);

export const googleProfileCompleted = createAsyncThunk(
  "auth/googleProfileCompleted",
  async (payload, { rejectWithValue }) => {
    try {
      return await authService.completeGoogleProfile(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);

export const signupRequested = createAsyncThunk(
  "auth/signupRequested",
  async (payload, { rejectWithValue }) => {
    try {
      return await authService.signup(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);

export const verificationCompleted = createAsyncThunk(
  "auth/verificationCompleted",
  async (token, { rejectWithValue }) => {
    try {
      return await authService.verifyEmail(token);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);

export const verificationResent = createAsyncThunk(
  "auth/verificationResent",
  async (email, { rejectWithValue }) => {
    try {
      return await authService.resendVerificationEmail(email);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);

export const passwordResetRequested = createAsyncThunk(
  "auth/passwordResetRequested",
  async (email, { rejectWithValue }) => {
    try {
      return await authService.requestPasswordReset(email);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);

export const logoutRequested = createAsyncThunk(
  "auth/logoutRequested",
  async () => {
    await authService.logout();
  },
);

export const sessionRestoreRequested = createAsyncThunk(
  "auth/sessionRestoreRequested",
  async () => authService.restoreSession(),
  {
    condition: () => authService.hasStoredSession(),
  },
);

const initialState = {
  session: authService.hasStoredSession() ? null : authService.getSession(),
  authView: "login",
  pendingVerification: null,
  pendingGoogleProfile: null,
  passwordReset: null,
  error: "",
  isLoading: false,
  isBootstrapping: authService.hasStoredSession(),
  restoredSession: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    authViewChanged(state, action) {
      state.authView = action.payload;
      state.error = "";

      if (action.payload !== "reset") {
        state.passwordReset = null;
      }
    },

    loggedOut(state) {
      localStorage.removeItem("droneops_session");

      state.session = null;
      state.authView = "login";
      state.pendingVerification = null;
      state.pendingGoogleProfile = null;
      state.error = "";
      state.isBootstrapping = false;
      state.restoredSession = false;
    },

    sessionUserUpdated(state, action) {
      if (!state.session) return;

      state.session.user = action.payload;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(loginRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      .addCase(loginRequested.fulfilled, (state, action) => {
        state.isLoading = false;
        state.session = action.payload;
        state.restoredSession = false;
        state.authView = "login";
        state.pendingVerification = null;
      })

      .addCase(loginRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Login failed";
      })

      .addCase(googleLoginRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      .addCase(googleLoginRequested.fulfilled, (state, action) => {
        state.isLoading = false;

        if (action.payload.needsOnboarding) {
          state.authView = "google_onboarding";

          state.pendingGoogleProfile = {
            credential: action.payload.credential,
            profile: action.payload.googleProfile,
          };

          state.session = null;
          return;
        }

        state.session = action.payload;
        state.restoredSession = false;
        state.authView = "login";
        state.pendingVerification = null;
        state.pendingGoogleProfile = null;
      })

      .addCase(googleLoginRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = friendlyAuthError(
          action.payload,
          "Google sign-in failed",
        );
      })

      .addCase(googleProfileCompleted.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      .addCase(googleProfileCompleted.fulfilled, (state, action) => {
        state.isLoading = false;
        state.session = action.payload;
        state.restoredSession = false;
        state.authView = "login";
        state.pendingGoogleProfile = null;
      })

      .addCase(googleProfileCompleted.rejected, (state, action) => {
        state.isLoading = false;
        state.error = friendlyAuthError(
          action.payload,
          "Google profile completion failed",
        );
      })

      .addCase(signupRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      .addCase(signupRequested.fulfilled, (state, action) => {
        state.isLoading = false;
        state.authView = "verify";
        state.pendingVerification = action.payload;
      })

      .addCase(signupRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Signup failed";
      })

      .addCase(verificationCompleted.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      .addCase(verificationCompleted.fulfilled, (state) => {
        state.isLoading = false;
        state.authView = "login";
        state.pendingVerification = null;
      })

      .addCase(verificationCompleted.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Verification failed";
      })

      .addCase(verificationResent.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      .addCase(verificationResent.fulfilled, (state, action) => {
        state.isLoading = false;
        state.authView = action.payload.alreadyVerified ? "login" : "verify";
        state.pendingVerification = action.payload.alreadyVerified
          ? null
          : {
              ...(state.pendingVerification ?? {}),
              ...action.payload,
              user: action.payload.user ?? state.pendingVerification?.user
            };
        state.error = action.payload.alreadyVerified
          ? "This account is already verified. You can sign in."
          : "";
      })

      .addCase(verificationResent.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Verification email could not be resent";
      })

      .addCase(passwordResetRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
        state.passwordReset = null;
      })

      .addCase(passwordResetRequested.fulfilled, (state, action) => {
        state.isLoading = false;
        state.passwordReset = action.payload;
      })

      .addCase(passwordResetRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Password reset failed";
      })

      .addCase(logoutRequested.fulfilled, (state) => {
        state.session = null;
        state.authView = "login";
        state.pendingVerification = null;
        state.pendingGoogleProfile = null;
        state.error = "";
        state.isBootstrapping = false;
        state.restoredSession = false;
      })

      .addCase(sessionRestoreRequested.pending, (state) => {
        state.isBootstrapping = true;
        state.error = "";
      })

      .addCase(sessionRestoreRequested.fulfilled, (state, action) => {
        state.isBootstrapping = false;
        state.session = action.payload;
        state.restoredSession = Boolean(action.payload);
        state.authView = "login";
      })

      .addCase(sessionRestoreRequested.rejected, (state) => {
        state.isBootstrapping = false;
        state.session = null;
        state.restoredSession = false;
      });
  },
});

export const {
  authViewChanged,
  loggedOut,
  sessionUserUpdated,
} = authSlice.actions;

export default authSlice.reducer;
