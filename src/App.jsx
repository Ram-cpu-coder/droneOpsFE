import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import LoadingLogo from "./components/common/LoadingLogo";
import {
  canAccessRoute,
  firstAccessibleRoute,
} from "./features/auth/accessControl";
import {
  authViewChanged,
  googleLoginRequested,
  googleProfileCompleted,
  loggedOut,
  loginRequested,
  passwordResetRequested,
  sessionRestoreRequested,
  signupRequested,
  verificationCompleted,
} from "./features/auth/authSlice";
import {
  routeActionCleared,
  routeChanged,
  searchChanged,
  themeModeChanged,
  uiReset,
} from "./features/ui/uiSlice";
import { appRoutes } from "./routes/appRoutes";

// Lazy load main app/auth components.
const AppLayout = lazy(() => import("./components/layouts/AppLayout"));
const AuthShell = lazy(() => import("./pages/auth/AuthShell"));
const GoogleProfileSetup = lazy(
  () => import("./pages/auth/GoogleProfileSetup"),
);
const Login = lazy(() => import("./pages/auth/Login"));
const PasswordReset = lazy(() => import("./pages/auth/PasswordReset"));
const ResetPasswordConfirm = lazy(
  () => import("./pages/auth/ResetPasswordConfirm"),
);
const Signup = lazy(() => import("./pages/auth/Signup"));
const VerifyEmail = lazy(() => import("./pages/auth/VerifyEmail"));

// URL path to auth screen name.
const authPathToView = {
  "/login": "login",
  "/signup": "signup",
  "/verify": "verify",
  "/reset": "reset",
  "/google-setup": "google_onboarding",
};

// Auth screen name to URL path.
const authViewToPath = {
  login: "/login",
  signup: "/signup",
  verify: "/verify",
  reset: "/reset",
  google_onboarding: "/google-setup",
};

const App = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Prevent repeated restored-session redirects.
  const restoredRouteHandledRef = useRef(false);

  // Prevent repeated auth route setup.
  const authRouteInitializedRef = useRef(false);

  // Auth state from Redux.
  const {
    session,
    authView,
    pendingVerification,
    pendingGoogleProfile,
    error,
    passwordReset,
    isLoading,
    isBootstrapping,
    restoredSession,
  } = useSelector((state) => state.auth);

  // UI state from Redux.
  const { activeRoute, globalSearch, pendingRouteAction, themeMode } =
    useSelector((state) => state.ui);
  const resetPasswordToken = location.pathname.startsWith("/reset-password/")
    ? decodeURIComponent(location.pathname.replace("/reset-password/", ""))
    : "";

  // Routes allowed for current user.
  const accessibleRoutes = useMemo(() => {
    if (!session?.user) return [];

    return appRoutes.filter((route) => canAccessRoute(session.user, route));
  }, [session]);

  // Route matching current URL.
  const currentAppRoute = useMemo(
    () =>
      accessibleRoutes.find(
        (route) =>
          location.pathname === route.path ||
          location.pathname.startsWith(`${route.path}/`),
      ) ?? null,
    [accessibleRoutes, location.pathname],
  );

  // Apply and save selected theme.
  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("droneops-theme-mode", themeMode);
  }, [themeMode]);

  // Restore session when app starts.
  useEffect(() => {
    dispatch(sessionRestoreRequested());
  }, [dispatch]);

  // Handle expired session event.
  useEffect(() => {
    const handleSessionExpired = () => {
      dispatch(loggedOut());
      dispatch(uiReset());
      navigate("/login", { replace: true });
    };

    window.addEventListener("droneops:session-expired", handleSessionExpired);

    return () =>
      window.removeEventListener(
        "droneops:session-expired",
        handleSessionExpired,
      );
  }, [dispatch, navigate]);

  // Main auth/app routing logic.
  useEffect(() => {
    if (isBootstrapping) return;

    // If user is not logged in, keep them in auth pages.
    if (!session?.user) {
      if (location.pathname.startsWith("/reset-password/")) {
        authRouteInitializedRef.current = true;
        return;
      }

      const pathAuthView = authPathToView[location.pathname];

      // First auth route setup.
      if (!authRouteInitializedRef.current) {
        authRouteInitializedRef.current = true;

        const initialAuthView = pathAuthView ?? authView;
        const initialAuthPath = authViewToPath[initialAuthView] ?? "/login";

        if (initialAuthView !== authView) {
          dispatch(authViewChanged(initialAuthView));
        }

        if (location.pathname !== initialAuthPath) {
          navigate(initialAuthPath, { replace: true });
        }

        return;
      }

      // Keep URL synced with selected auth view.
      const nextAuthPath = authViewToPath[authView] ?? "/login";

      if (location.pathname !== nextAuthPath) {
        navigate(nextAuthPath, { replace: true });
      }

      return;
    }

    // User is logged in, so auth setup can reset.
    authRouteInitializedRef.current = false;

    // Use current route or first allowed route.
    const nextRoute =
      currentAppRoute ?? firstAccessibleRoute(session.user, appRoutes);

    if (!nextRoute) return;

    // Store active route in Redux.
    if (activeRoute !== nextRoute.id) {
      dispatch(routeChanged(nextRoute.id));
    }

    // Redirect invalid route to allowed route.
    if (!currentAppRoute && location.pathname !== nextRoute.path) {
      navigate(nextRoute.path, { replace: true });
    }
  }, [
    activeRoute,
    authView,
    currentAppRoute,
    dispatch,
    isBootstrapping,
    location.pathname,
    navigate,
    session,
  ]);

  // After restoring session, send user to dashboard once.
  useEffect(() => {
    if (!restoredSession || restoredRouteHandledRef.current || !session?.user) {
      return;
    }

    restoredRouteHandledRef.current = true;

    if (location.pathname !== "/dashboard") {
      dispatch(routeChanged("dashboard"));
      navigate("/dashboard", { replace: true });
    }
  }, [dispatch, location.pathname, navigate, restoredSession, session]);

  // Navigate between app routes.
  const handleNavigate = useCallback(
    (routeId) => {
      const nextRoute = accessibleRoutes.find((route) => route.id === routeId);

      if (!nextRoute) return;

      dispatch(routeChanged(nextRoute.id));
      navigate(nextRoute.path);
    },
    [accessibleRoutes, dispatch, navigate],
  );

  // Change auth screen.
  const handleAuthViewChange = useCallback(
    (view) => {
      dispatch(authViewChanged(view));
      navigate(authViewToPath[view] ?? "/login");
    },
    [dispatch, navigate],
  );

  // Login with email/password.
  const handleLogin = useCallback(
    (credentials) => {
      dispatch(loginRequested(credentials));
    },
    [dispatch],
  );

  // Login with Google.
  const handleGoogleLogin = useCallback(
    (credential) => {
      dispatch(googleLoginRequested(credential));
    },
    [dispatch],
  );

  // Create account.
  const handleSignup = useCallback(
    (payload) => {
      dispatch(signupRequested(payload));
    },
    [dispatch],
  );

  // Verify email in local/dev flow.
  const handleVerify = useCallback(() => {
    dispatch(verificationCompleted(pendingVerification?.devVerificationToken));
  }, [dispatch, pendingVerification]);

  // Logout user.
  const handleLogout = useCallback(() => {
    dispatch(loggedOut());
    dispatch(uiReset());
    navigate("/login", { replace: true });
  }, [dispatch, navigate]);

  // Show boot screen before dashboard redirect.
  const shouldResetRestoredRoute =
    restoredSession &&
    !restoredRouteHandledRef.current &&
    session?.user &&
    location.pathname !== "/dashboard";

  // Page component to render.
  const ActivePage =
    currentAppRoute?.component ?? accessibleRoutes[0]?.component;

  // Route id for layout active state.
  const resolvedActiveRoute =
    currentAppRoute?.id ?? accessibleRoutes[0]?.id ?? activeRoute;

  // Loading screen while restoring session.
  if (isBootstrapping || shouldResetRestoredRoute) {
    return (
      <div className="app-boot-screen">
        <LoadingLogo label="Restoring DroneOps session" size="lg" />
        <p>Checking your session before loading operations data.</p>
      </div>
    );
  }

  // Auth screens when user is not logged in.
  if (!session?.user) {
    return (
      <Suspense fallback={<AuthFallback />}>
        <AuthShell
          themeMode={themeMode}
          onThemeModeChange={(mode) => dispatch(themeModeChanged(mode))}
        >
          {resetPasswordToken && (
            <ResetPasswordConfirm
              token={resetPasswordToken}
              onAuthViewChange={handleAuthViewChange}
            />
          )}

          {!resetPasswordToken && authView === "login" && (
            <Login
              error={error}
              isLoading={isLoading}
              onLogin={handleLogin}
              onGoogleLogin={handleGoogleLogin}
              onAuthViewChange={handleAuthViewChange}
            />
          )}

          {!resetPasswordToken && authView === "signup" && (
            <Signup
              onSignup={handleSignup}
              error={error}
              isLoading={isLoading}
              onAuthViewChange={handleAuthViewChange}
            />
          )}

          {!resetPasswordToken && authView === "google_onboarding" && (
            <GoogleProfileSetup
              pendingGoogleProfile={pendingGoogleProfile}
              error={error}
              isLoading={isLoading}
              onComplete={(payload) =>
                dispatch(googleProfileCompleted(payload))
              }
              onAuthViewChange={handleAuthViewChange}
            />
          )}

          {!resetPasswordToken && authView === "verify" && (
            <VerifyEmail
              pendingUser={pendingVerification?.user}
              emailSent={pendingVerification?.emailSent}
              emailError={pendingVerification?.emailError}
              canUseLocalVerification={Boolean(
                pendingVerification?.devVerificationToken,
              )}
              onVerify={handleVerify}
              onAuthViewChange={handleAuthViewChange}
            />
          )}

          {!resetPasswordToken && authView === "reset" && (
            <PasswordReset
              result={passwordReset}
              error={error}
              isLoading={isLoading}
              onReset={(email) => dispatch(passwordResetRequested(email))}
              onAuthViewChange={handleAuthViewChange}
            />
          )}
        </AuthShell>
      </Suspense>
    );
  }

  // Main app layout after login.
  return (
    <Suspense
      fallback={
        <div className="page-loading-panel">
          <LoadingLogo label="Loading workspace" />
        </div>
      }
    >
      <AppLayout
        activeRoute={resolvedActiveRoute}
        routes={accessibleRoutes}
        user={session.user}
        searchValue={globalSearch}
        themeMode={themeMode}
        onNavigate={handleNavigate}
        onSearchChange={(value) => dispatch(searchChanged(value))}
        onThemeModeChange={(mode) => dispatch(themeModeChanged(mode))}
        onLogout={handleLogout}
      >
        {ActivePage && (
          <Suspense
            fallback={
              <div className="page-loading-panel">
                <LoadingLogo label="Loading workspace" />
              </div>
            }
          >
            <ActivePage
              searchValue={globalSearch}
              onNavigate={handleNavigate}
              pendingRouteAction={pendingRouteAction}
              onRouteActionHandled={() => dispatch(routeActionCleared())}
              user={session.user}
            />
          </Suspense>
        )}
      </AppLayout>
    </Suspense>
  );
};

// Loading fallback for auth pages.
const AuthFallback = () => (
  <main className="auth-shell">
    <section className="auth-panel">
      <LoadingLogo label="Loading DroneOps" size="md" />
    </section>
  </main>
);

export default App;
