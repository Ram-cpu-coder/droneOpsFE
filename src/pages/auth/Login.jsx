import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Lock,
  MailCheck,
  MapPin,
  RadioTower,
  ShieldCheck,
  User,
} from "lucide-react";
import ActionButton from "../../components/common/ActionButton";

const GOOGLE_SCRIPT_ID = "google-identity-services";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const loadGoogleIdentity = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google), {
        once: true,
      });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () =>
      reject(new Error("Google sign-in script could not be loaded"));

    document.head.appendChild(script);
  });
};

const Login = ({
  error,
  isLoading,
  onLogin,
  onGoogleLogin,
  onResendVerification,
  onAuthViewChange,
}) => {
  const [form, setForm] = useState({ email: "", password: "" });

  const [showPassword, setShowPassword] = useState(false);

  const [googleError, setGoogleError] = useState("");

  const [isGoogleLoading, setIsGoogleLoading] = useState(true);

  const googleButtonRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const setupGoogleButton = async () => {
      setGoogleError("");

      if (!GOOGLE_CLIENT_ID) {
        setIsGoogleLoading(false);
        setGoogleError("Add VITE_GOOGLE_CLIENT_ID to enable Google sign-in.");
        return;
      }

      try {
        const google = await loadGoogleIdentity();
        if (cancelled || !googleButtonRef.current) return;

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          use_fedcm_for_button: false,
          use_fedcm_for_prompt: false,
          callback: ({ credential }) => {
            if (credential) onGoogleLogin(credential);
          },
        });

        googleButtonRef.current.innerHTML = "";
        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_black",
          size: "large",
          type: "standard",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "left",
          width: Math.min(420, googleButtonRef.current.offsetWidth || 420),
        });
      } catch (googleScriptError) {
        if (!cancelled) {
          setGoogleError(googleScriptError.message);
        }
      } finally {
        if (!cancelled) {
          setIsGoogleLoading(false);
        }
      }
    };

    setupGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [onGoogleLogin]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin(form);
  };
  const canResendVerification = error?.toLowerCase().includes("verify") && form.email.trim();

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <h2>Welcome Back</h2>
        <p>Sign in to continue your operations</p>
      </div>

      {(error || googleError) && (
        <div className="auth-alert">
          <span>{error || googleError}</span>
          {canResendVerification && (
            <button
              type="button"
              className="auth-alert-action"
              onClick={() => onResendVerification?.(form.email.trim())}
              disabled={isLoading}
            >
              <MailCheck size={15} />
              Resend verification email
            </button>
          )}
        </div>
      )}

      <label className="field">
        <span>Email</span>
        <User className="field-icon" size={18} />
        <input
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          placeholder="Email Address"
          required
        />
      </label>

      <label className="field">
        <span>Password</span>
        <Lock className="field-icon" size={18} />
        <input
          type={showPassword ? "text" : "password"}
          value={form.password}
          onChange={(event) =>
            setForm({ ...form, password: event.target.value })
          }
          placeholder="Password"
          required
        />

        <button
          className="field-trailing-button"
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </label>

      <div className="auth-row">
        <button
          type="button"
          className="text-button"
          onClick={() => onAuthViewChange("reset")}
        >
          Forgot password?
        </button>
      </div>

      <ActionButton
        icon={ArrowRight}
        iconPosition="end"
        variant="primary"
        type="submit"
        disabled={isLoading}
        isLoading={isLoading}
      >
        {isLoading ? "Logging in" : "Log In"}
      </ActionButton>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <div className={`google-button-shell${isLoading || isGoogleLoading ? " is-loading" : ""}`}>
        <button className="google-button google-button-display" type="button" disabled={isLoading || isGoogleLoading}>
          <span className="google-mark" aria-hidden="true">G</span>
          <span>{isGoogleLoading ? "Preparing Google sign-in" : "Sign in with Google"}</span>
        </button>
        <div className="google-official-button" ref={googleButtonRef} aria-hidden={isGoogleLoading} />
      </div>

      <div className="auth-switch">
        <span>No account yet?</span>
        <button
          type="button"
          className="text-button"
          onClick={() => onAuthViewChange("signup")}
        >
          Create account
        </button>
      </div>

      <div className="login-feature-grid">
        <FeatureTile icon={RadioTower} label="Real-time Monitoring" />
        <FeatureTile icon={MapPin} label="Mission Management" />
        <FeatureTile icon={BarChart3} label="Data Analytics" />
        <FeatureTile icon={ShieldCheck} label="Secure Operations" />
      </div>
    </form>
  );
};

const FeatureTile = ({ icon: Icon, label }) => (
  <div className="login-feature-tile">
    <span>
      <Icon size={22} />
    </span>
    <p>{label}</p>
  </div>
);

export default Login;
