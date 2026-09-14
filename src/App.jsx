import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import LoadingLogo from "./components/common/LoadingLogo";
import SystemFeedbackDialog from "./components/common/SystemFeedbackDialog";
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
  verificationResent,
} from "./features/auth/authSlice";
import {
  routeActionCleared,
  routeChanged,
  searchChanged,
  themeModeChanged,
  uiReset,
} from "./features/ui/uiSlice";
import { appRoutes } from "./routes/appRoutes";
import { feedbackEvents } from "./services/feedbackBus";

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

const authPathToView = {
  "/login": "login",
  "/signup": "signup",
  "/verify": "verify",
  "/reset": "reset",
  "/google-setup": "google_onboarding",
};

const authViewToPath = {
  login: "/login",
  signup: "/signup",
  verify: "/verify",
  reset: "/reset",
  google_onboarding: "/google-setup",
};

const protectedRedirectKey = "droneops_redirect_after_login";

const getProtectedRedirect = (location) => {
  const params = new URLSearchParams(location.search);
  const redirect = params.get("redirect");

  if (isAppRedirectPath(redirect)) return redirect;

  const storedRedirect = window.sessionStorage.getItem(protectedRedirectKey);
  return isAppRedirectPath(storedRedirect) ? storedRedirect : "";
};

const getRouteForPath = (path) => {
  return appRoutes.find(
    (route) =>
      path === route.path ||
      path.startsWith(`${route.path}/`),
  ) ?? null;
};

const isAppRedirectPath = (path) => {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  return Boolean(getRouteForPath(path));
};

const App = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [systemFeedback, setSystemFeedback] = useState(null);

  const restoredRouteHandledRef = useRef(false);

  const authRouteInitializedRef = useRef(false);

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

  const { activeRoute, globalSearch, pendingRouteAction, themeMode } =
    useSelector((state) => state.ui);
  const resetPasswordToken = location.pathname.startsWith("/reset-password/")
    ? decodeURIComponent(location.pathname.replace("/reset-password/", ""))
    : "";

  const accessibleRoutes = useMemo(() => {
    if (!session?.user) return [];

    return appRoutes.filter((route) => canAccessRoute(session.user, route));
  }, [session]);

  const currentAppRoute = useMemo(
    () =>
      accessibleRoutes.find(
        (route) =>
          location.pathname === route.path ||
          location.pathname.startsWith(`${route.path}/`),
      ) ?? null,
    [accessibleRoutes, location.pathname],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("droneops-theme-mode", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (resetPasswordToken) return;
    dispatch(sessionRestoreRequested());
  }, [dispatch, resetPasswordToken]);

  useEffect(() => {
    const handleSessionExpired = (event) => {
      const message = event?.detail?.message ?? "Your session has ended. Please sign in again.";

      dispatch(loggedOut());
      dispatch(uiReset());
      navigate("/login", { replace: true });
      setSystemFeedback({
        id: "session-expired",
        type: "error",
        title: "Session expired",
        message,
        context: "Account access",
        actionLabel: "Sign in",
      });
    };

    const handleSessionStorageChange = (event) => {
      if (event.key !== "droneops_session") return;
      if (event.newValue !== null) return;

      handleSessionExpired({
        detail: {
          message: "You were signed out in another tab. Please sign in again to continue.",
        },
      });
    };

    window.addEventListener("droneops:session-expired", handleSessionExpired);
    window.addEventListener("storage", handleSessionStorageChange);

    return () => {
      window.removeEventListener(
        "droneops:session-expired",
        handleSessionExpired,
      );
      window.removeEventListener("storage", handleSessionStorageChange);
    };
  }, [dispatch, navigate]);

  useEffect(() => {
    const handleFeedback = (event) => {
      const feedback = event.detail ?? {};
      if (feedback.clear) {
        setSystemFeedback((current) => (feedback.id && current?.id !== feedback.id ? current : null));
        return;
      }

      setSystemFeedback({
        id: feedback.id ?? `${Date.now()}`,
        type: feedback.type ?? "info",
        title: feedback.title,
        message: feedback.message,
        details: feedback.details,
        context: feedback.context,
        actionLabel: feedback.actionLabel,
        blocking: feedback.blocking
      });
    };

    window.addEventListener(feedbackEvents.name, handleFeedback);
    return () => window.removeEventListener(feedbackEvents.name, handleFeedback);
  }, []);

  useEffect(() => {
    if (resetPasswordToken) {
      authRouteInitializedRef.current = true;
      return;
    }

    if (isBootstrapping) return;

    if (!session?.user) {
      if (location.pathname.startsWith("/reset-password/")) {
        authRouteInitializedRef.current = true;
        return;
      }

      const pathAuthView = authPathToView[location.pathname];
      const isAuthPath = Boolean(pathAuthView);

      if (!isAuthPath && location.pathname !== "/") {
        const redirectPath = `${location.pathname}${location.search}`;
        window.sessionStorage.setItem(protectedRedirectKey, redirectPath);
        navigate(`/login?redirect=${encodeURIComponent(redirectPath)}`, { replace: true });
        return;
      }

      if (!authRouteInitializedRef.current) {
        authRouteInitializedRef.current = true;

        const initialAuthView = pathAuthView ?? authView;
        const initialAuthPath = authViewToPath[initialAuthView] ?? "/login";

        if (initialAuthView !== authView) {
          dispatch(authViewChanged(initialAuthView));
        }

        if (location.pathname !== initialAuthPath) {
          const redirectPath = getProtectedRedirect(location);
          const authPath = initialAuthPath === "/login" && redirectPath
            ? `/login?redirect=${encodeURIComponent(redirectPath)}`
            : initialAuthPath;
          navigate(authPath, { replace: true });
        }

        return;
      }

      const nextAuthPath = authViewToPath[authView] ?? "/login";

      if (location.pathname !== nextAuthPath) {
        const redirectPath = getProtectedRedirect(location);
        const authPath = nextAuthPath === "/login" && redirectPath
          ? `/login?redirect=${encodeURIComponent(redirectPath)}`
          : nextAuthPath;
        navigate(authPath, { replace: true });
      }

      return;
    }

    authRouteInitializedRef.current = false;

    const pendingProtectedPath = getProtectedRedirect(location);
    const pendingRoute = pendingProtectedPath ? getRouteForPath(pendingProtectedPath) : null;

    if (pendingProtectedPath && pendingRoute && canAccessRoute(session.user, pendingRoute)) {
      window.sessionStorage.removeItem(protectedRedirectKey);
      dispatch(routeChanged(pendingRoute.id));
      navigate(pendingProtectedPath, { replace: true });
      return;
    }

    if (pendingProtectedPath && pendingRoute) {
      window.sessionStorage.removeItem(protectedRedirectKey);
    }

    const nextRoute =
      currentAppRoute ?? firstAccessibleRoute(session.user, appRoutes);

    if (!nextRoute) return;

    if (activeRoute !== nextRoute.id) {
      dispatch(routeChanged(nextRoute.id));
    }

    if (!currentAppRoute && location.pathname !== nextRoute.path) {
      navigate(nextRoute.path, { replace: true });
    }
  }, [
    activeRoute,
    authView,
    currentAppRoute,
    dispatch,
    isBootstrapping,
    location,
    location.pathname,
    location.search,
    navigate,
    session,
    resetPasswordToken,
  ]);

  useEffect(() => {
    if (resetPasswordToken || !restoredSession || restoredRouteHandledRef.current || !session?.user) {
      return;
    }

    restoredRouteHandledRef.current = true;

    if (getProtectedRedirect(location)) return;

    if (currentAppRoute) return;

    if (location.pathname !== "/dashboard") {
      dispatch(routeChanged("dashboard"));
      navigate("/dashboard", { replace: true });
    }
  }, [currentAppRoute, dispatch, location, location.pathname, navigate, resetPasswordToken, restoredSession, session]);

  const handleNavigate = useCallback(
    (routeId) => {
      const nextRoute = accessibleRoutes.find((route) => route.id === routeId);

      if (!nextRoute) return;

      dispatch(routeChanged(nextRoute.id));
      navigate(nextRoute.path);
    },
    [accessibleRoutes, dispatch, navigate],
  );

  const handleAuthViewChange = useCallback(
    (view) => {
      dispatch(authViewChanged(view));
      navigate(authViewToPath[view] ?? "/login");
    },
    [dispatch, navigate],
  );

  const handleLogin = useCallback(
    (credentials) => {
      dispatch(loginRequested(credentials));
    },
    [dispatch],
  );

  const handleGoogleLogin = useCallback(
    (credential) => {
      dispatch(googleLoginRequested(credential));
    },
    [dispatch],
  );

  const handleSignup = useCallback(
    (payload) => {
      dispatch(signupRequested(payload));
    },
    [dispatch],
  );

  const handleVerify = useCallback(() => {
    dispatch(verificationCompleted(pendingVerification?.devVerificationToken));
  }, [dispatch, pendingVerification]);

  const handleResendVerification = useCallback(() => {
    const email = pendingVerification?.user?.email;
    if (!email) return;
    dispatch(verificationResent(email));
  }, [dispatch, pendingVerification]);

  const handleResendVerificationForEmail = useCallback((email) => {
    if (!email) return;
    dispatch(verificationResent(email));
  }, [dispatch]);

  const handleLogout = useCallback(() => {
    dispatch(loggedOut());
    dispatch(uiReset());
    navigate("/login", { replace: true });
  }, [dispatch, navigate]);

  const shouldResetRestoredRoute =
    restoredSession &&
    !restoredRouteHandledRef.current &&
    session?.user &&
    !currentAppRoute &&
    location.pathname !== "/dashboard";

  const ActivePage =
    currentAppRoute?.component ?? accessibleRoutes[0]?.component;

  const resolvedActiveRoute =
    currentAppRoute?.id ?? accessibleRoutes[0]?.id ?? activeRoute;

  if ((!resetPasswordToken && isBootstrapping) || shouldResetRestoredRoute) {
    return (
      <div className="app-boot-screen">
        <LoadingLogo label="Restoring DroneOps session" size="lg" />
        <p>Checking your session before loading operations data.</p>
      </div>
    );
  }

  if (resetPasswordToken) {
    return (
      <Suspense fallback={<AuthFallback />}>
        <SystemFeedbackDialog feedback={systemFeedback} onClose={() => setSystemFeedback(null)} />
        <AuthShell
          themeMode={themeMode}
          onThemeModeChange={(mode) => dispatch(themeModeChanged(mode))}
        >
          <ResetPasswordConfirm
            token={resetPasswordToken}
            onAuthViewChange={handleAuthViewChange}
          />
        </AuthShell>
      </Suspense>
    );
  }

  if (!session?.user) {
    return (
      <Suspense fallback={<AuthFallback />}>
        <SystemFeedbackDialog feedback={systemFeedback} onClose={() => setSystemFeedback(null)} />
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
              onResendVerification={handleResendVerificationForEmail}
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
              isLoading={isLoading}
              onVerify={handleVerify}
              onResend={handleResendVerification}
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

  return (
    <Suspense
      fallback={
        <div className="page-loading-panel">
          <LoadingLogo label="Loading workspace" />
        </div>
      }
    >
      <SystemFeedbackDialog feedback={systemFeedback} onClose={() => setSystemFeedback(null)} />
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

const AuthFallback = () => (
  <main className="auth-shell">
    <section className="auth-panel">
      <LoadingLogo label="Loading DroneOps" size="md" />
    </section>
  </main>
);

export default App;
