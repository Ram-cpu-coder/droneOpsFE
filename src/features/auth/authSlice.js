import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { authService } from "./authService";

// Converts backend errors into clearer UI messages.
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

// Login with email/password.
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

// Login with Google.
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

// Complete Google onboarding.
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

// Create new account.
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

// Verify account email.
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

// Request password reset link.
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

// Logout from backend and frontend.
export const logoutRequested = createAsyncThunk(
  "auth/logoutRequested",
  async () => {
    await authService.logout();
  },
);

// Restore saved session on app start.
export const sessionRestoreRequested = createAsyncThunk(
  "auth/sessionRestoreRequested",
  async () => authService.restoreSession(),
  {
    // Only run if a session exists.
    condition: () => authService.hasStoredSession(),
  },
);

// Initial auth state.
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
    // Change auth screen.
    authViewChanged(state, action) {
      state.authView = action.payload;
      state.error = "";

      if (action.payload !== "reset") {
        state.passwordReset = null;
      }
    },

    // Clear auth state after logout.
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

    // Update current user in session.
    sessionUserUpdated(state, action) {
      if (!state.session) return;

      state.session.user = action.payload;
    },
  },

  extraReducers: (builder) => {
    builder
      // Email/password login started.
      .addCase(loginRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      // Email/password login success.
      .addCase(loginRequested.fulfilled, (state, action) => {
        state.isLoading = false;
        state.session = action.payload;
        state.restoredSession = false;
        state.authView = "login";
        state.pendingVerification = null;
      })

      // Email/password login failed.
      .addCase(loginRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Login failed";
      })

      // Google login started.
      .addCase(googleLoginRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      // Google login success.
      .addCase(googleLoginRequested.fulfilled, (state, action) => {
        state.isLoading = false;

        // New Google user must finish setup.
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

      // Google login failed.
      .addCase(googleLoginRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = friendlyAuthError(
          action.payload,
          "Google sign-in failed",
        );
      })

      // Google profile setup started.
      .addCase(googleProfileCompleted.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      // Google profile setup success.
      .addCase(googleProfileCompleted.fulfilled, (state, action) => {
        state.isLoading = false;
        state.session = action.payload;
        state.restoredSession = false;
        state.authView = "login";
        state.pendingGoogleProfile = null;
      })

      // Google profile setup failed.
      .addCase(googleProfileCompleted.rejected, (state, action) => {
        state.isLoading = false;
        state.error = friendlyAuthError(
          action.payload,
          "Google profile completion failed",
        );
      })

      // Signup started.
      .addCase(signupRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      // Signup success, go to verify screen.
      .addCase(signupRequested.fulfilled, (state, action) => {
        state.isLoading = false;
        state.authView = "verify";
        state.pendingVerification = action.payload;
      })

      // Signup failed.
      .addCase(signupRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Signup failed";
      })

      // Email verification started.
      .addCase(verificationCompleted.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })

      // Email verification success.
      .addCase(verificationCompleted.fulfilled, (state) => {
        state.isLoading = false;
        state.authView = "login";
        state.pendingVerification = null;
      })

      // Email verification failed.
      .addCase(verificationCompleted.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Verification failed";
      })

      // Password reset request started.
      .addCase(passwordResetRequested.pending, (state) => {
        state.isLoading = true;
        state.error = "";
        state.passwordReset = null;
      })

      // Password reset request success.
      .addCase(passwordResetRequested.fulfilled, (state, action) => {
        state.isLoading = false;
        state.passwordReset = action.payload;
      })

      // Password reset request failed.
      .addCase(passwordResetRequested.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Password reset failed";
      })

      // Logout success.
      .addCase(logoutRequested.fulfilled, (state) => {
        state.session = null;
        state.authView = "login";
        state.pendingVerification = null;
        state.pendingGoogleProfile = null;
        state.error = "";
        state.isBootstrapping = false;
        state.restoredSession = false;
      })

      // Session restore started.
      .addCase(sessionRestoreRequested.pending, (state) => {
        state.isBootstrapping = true;
        state.error = "";
      })

      // Session restore success.
      .addCase(sessionRestoreRequested.fulfilled, (state, action) => {
        state.isBootstrapping = false;
        state.session = action.payload;
        state.restoredSession = Boolean(action.payload);
        state.authView = "login";
      })

      // Session restore failed.
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