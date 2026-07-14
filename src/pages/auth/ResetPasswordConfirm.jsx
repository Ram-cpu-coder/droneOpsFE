import { useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import ActionButton from "../../components/common/ActionButton";
import { API_BASE_URL } from "../../services/apiClient";

const initialForm = {
  password: "",
  confirmPassword: "",
};

const ResetPasswordConfirm = ({ token, onAuthViewChange }) => {
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const isSubmitting = status === "submitting";
  const isSuccess = status === "success";
  const isError = status === "error";

  const passwordChecks = useMemo(
    () => ({
      length: form.password.length >= 8,
      uppercase: /[A-Z]/.test(form.password),
      lowercase: /[a-z]/.test(form.password),
      number: /\d/.test(form.password),
      special: /[^A-Za-z0-9]/.test(form.password),
      match: form.password.length > 0 && form.password === form.confirmPassword,
    }),
    [form.confirmPassword, form.password],
  );

  const isValid = Object.values(passwordChecks).every(Boolean);

  const updateField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
    if (status === "error") {
      setStatus("idle");
      setMessage("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid || isSubmitting || isSuccess) return;

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password/${encodeURIComponent(token)}?format=json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fieldMessages = payload.details?.fieldErrors
          ? Object.values(payload.details.fieldErrors).flat().filter(Boolean)
          : [];
        throw new Error(fieldMessages[0] || payload.message || "Password reset failed.");
      }

      setStatus("success");
      setMessage(payload.message || "Your DroneOps password has been changed.");
      setForm(initialForm);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "This reset link could not be used.");
    }
  };

  if (!token) {
    return (
      <section className="auth-form password-reset-form">
        <div className="verification-card reset-result-card">
          <div className="verification-icon warning">
            <ShieldAlert size={26} />
          </div>
          <div className="verification-content">
            <strong>Reset link missing</strong>
            <p>Please request a fresh password reset link from the login page.</p>
          </div>
        </div>
        <button type="button" className="text-button left" onClick={() => onAuthViewChange("login")}>
          Back to login
        </button>
      </section>
    );
  }

  return (
    <form className="auth-form password-reset-form" onSubmit={handleSubmit}>
      <div>
        <h2>Create new password</h2>
        <p>Choose a secure password for your DroneOps account.</p>
      </div>

      {isSuccess && (
        <div className="verification-card reset-result-card">
          <div className="verification-icon">
            <CheckCircle2 size={26} />
          </div>
          <div className="verification-content">
            <strong>Password updated</strong>
            <p>{message}</p>
          </div>
        </div>
      )}

      {isError && <div className="auth-alert">{message}</div>}

      {!isSuccess && (
        <>
          <label className="field password-field">
            <span>New password</span>
            <KeyRound className="field-icon" size={18} />
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={updateField("password")}
              disabled={isSubmitting}
              autoComplete="new-password"
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </label>

          <label className="field password-field">
            <span>Confirm password</span>
            <KeyRound className="field-icon" size={18} />
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={updateField("confirmPassword")}
              disabled={isSubmitting}
              autoComplete="new-password"
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </label>

          <div className="password-rules compact">
            <span className={passwordChecks.length ? "is-valid" : ""}>8+ characters</span>
            <span className={passwordChecks.uppercase ? "is-valid" : ""}>Uppercase</span>
            <span className={passwordChecks.lowercase ? "is-valid" : ""}>Lowercase</span>
            <span className={passwordChecks.number ? "is-valid" : ""}>Number</span>
            <span className={passwordChecks.special ? "is-valid" : ""}>Special</span>
            <span className={passwordChecks.match ? "is-valid" : ""}>Passwords match</span>
          </div>

          <ActionButton icon={KeyRound} variant="primary" type="submit" disabled={!isValid || isSubmitting} isLoading={isSubmitting}>
            {isSubmitting ? "Updating password..." : "Update password"}
          </ActionButton>
        </>
      )}

      <button type="button" className="text-button left" onClick={() => onAuthViewChange("login")}>
        {isSuccess ? "Back to login" : "Cancel and return to login"}
      </button>
    </form>
  );
};

export default ResetPasswordConfirm;
