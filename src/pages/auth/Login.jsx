import { useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Lock,
  MapPin,
  RadioTower,
  ShieldCheck,
  User,
} from "lucide-react";
import ActionButton from "../../components/common/ActionButton";

// Google script tag ID.
const GOOGLE_SCRIPT_ID = "google-identity-services";

// Google Client ID from .env.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Loads Google login script if not already loaded.
const loadGoogleIdentity = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    // Reuse existing script if present.
    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google), {
        once: true,
      });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    // Create Google login script.
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
  onAuthViewChange,
}) => {
  // Login form values.
  const [form, setForm] = useState({ email: "", password: "" });

  // Password visibility toggle.
  const [showPassword, setShowPassword] = useState(false);

  // Google login error message.
  const [googleError, setGoogleError] = useState("");

  // Google button loading state.
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Container for Google button.
  const googleButtonRef = useRef(null);

  // Submit email/password login.
  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin(form);
  };

  // Prepare and open Google login.
  const handleGoogleSetupCheck = async () => {
    setGoogleError("");

    // Google login needs client ID.
    if (!GOOGLE_CLIENT_ID) {
      setGoogleError("Add VITE_GOOGLE_CLIENT_ID to enable Google sign-in.");
      return;
    }

    setIsGoogleLoading(true);

    try {
      const google = await loadGoogleIdentity();

      // Initialize Google login.
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        use_fedcm_for_button: false,
        use_fedcm_for_prompt: false,
        callback: ({ credential }) => {
          if (credential) onGoogleLogin(credential);
        },
      });

      // Render official Google button.
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";

        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_black",
          size: "large",
          type: "standard",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "center",
          width: Math.min(420, googleButtonRef.current.offsetWidth || 420),
        });
      }

      // Show Google prompt.
      google.accounts.id.prompt();
    } catch (googleScriptError) {
      setGoogleError(googleScriptError.message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <h2>Welcome Back</h2>
        <p>Sign in to continue your operations</p>
      </div>

      {/* Show login error */}
      {(error || googleError) && (
        <div className="auth-alert">{error || googleError}</div>
      )}

      {/* Email field */}
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

      {/* Password field */}
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

        {/* Toggle password */}
        <button
          className="field-trailing-button"
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </label>

      {/* Go to reset page */}
      <div className="auth-row">
        <button
          type="button"
          className="text-button"
          onClick={() => onAuthViewChange("reset")}
        >
          Forgot password?
        </button>
      </div>

      {/* Login button */}
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

      {/* Google login */}
      <div className={`google-button-shell${isLoading ? " is-loading" : ""}`}>
        <div ref={googleButtonRef}>
          <button
            className="google-button"
            type="button"
            onClick={handleGoogleSetupCheck}
            disabled={isLoading || isGoogleLoading}
          >
            <span className="google-mark">G</span>
            {isGoogleLoading
              ? "Preparing Google sign-in"
              : "Sign in with Google"}
          </button>
        </div>
      </div>

      {/* Go to signup page */}
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

      {/* Feature tiles */}
      <div className="login-feature-grid">
        <FeatureTile icon={RadioTower} label="Real-time Monitoring" />
        <FeatureTile icon={MapPin} label="Mission Management" />
        <FeatureTile icon={BarChart3} label="Data Analytics" />
        <FeatureTile icon={ShieldCheck} label="Secure Operations" />
      </div>
    </form>
  );
};

// Small feature card.
const FeatureTile = ({ icon: Icon, label }) => (
  <div className="login-feature-tile">
    <span>
      <Icon size={22} />
    </span>
    <p>{label}</p>
  </div>
);

export default Login;
