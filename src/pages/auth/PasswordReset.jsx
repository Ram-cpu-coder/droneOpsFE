import { useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, MailCheck } from "lucide-react";
import ActionButton from "../../components/common/ActionButton";

const PasswordReset = ({
  result,
  error,
  isLoading,
  onReset,
  onAuthViewChange,
}) => {
  // Stores entered email.
  const [email, setEmail] = useState("");

  // Stores resend wait time.
  const [cooldown, setCooldown] = useState(0);

  // Formats cooldown as mm:ss.
  const cooldownLabel = useMemo(() => {
    const minutes = Math.floor(cooldown / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (cooldown % 60).toString().padStart(2, "0");

    return `${minutes}:${seconds}`;
  }, [cooldown]);

  // Start cooldown after reset request.
  useEffect(() => {
    if (!result) return;

    setCooldown(result.cooldownSeconds ?? 120);
  }, [result]);

  // Decrease cooldown every second.
  useEffect(() => {
    if (cooldown <= 0) return undefined;

    const timerId = window.setInterval(() => {
      setCooldown((current) => Math.max(current - 1, 0));
    }, 1000);

    // Stop timer when component updates/unmounts.
    return () => window.clearInterval(timerId);
  }, [cooldown]);

  // Submit password reset request.
  const handleSubmit = (event) => {
    event.preventDefault();

    // Do not submit while loading or waiting.
    if (isLoading || cooldown > 0) return;

    onReset(email.trim());
  };

  return (
    <form className="auth-form password-reset-form" onSubmit={handleSubmit}>
      {/* Page title */}
      <div>
        <h2>Password reset</h2>
        <p>Enter your account email and we will send a secure reset link.</p>
      </div>

      {/* Show error */}
      {error && <div className="auth-alert">{error}</div>}

      {/* Show reset result */}
      {result && (
        <div className="verification-card reset-result-card">
          <div className="verification-icon">
            <MailCheck size={26} />
          </div>

          <div className="verification-content">
            <strong>Reset link sent</strong>
            <p>
              Open the secure link from your inbox to create a new password.
            </p>
          </div>

          {/* Show resend timer */}
          {cooldown > 0 && (
            <div className="reset-cooldown" role="timer" aria-live="polite">
              <span>Resend available</span>
              <strong>{cooldownLabel}</strong>
            </div>
          )}

          {/* Show SMTP/dev warning */}
          {!result.emailSent && result.emailError && (
            <small>
              Email delivery needs SMTP review. You can still open the reset
              page locally while developing.
            </small>
          )}

          {/* Local reset link for development */}
          {result.devResetToken && (
            <a
              className="auth-inline-link"
              href={`/reset-password/${result.devResetToken}`}
              target="_blank"
              rel="noreferrer"
            >
              Open local reset page
            </a>
          )}
        </div>
      )}

      {/* Email input */}
      <label className="field">
        <span>Email</span>
        <Mail className="field-icon" size={18} />

        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isLoading}
          required
        />
      </label>

      {/* Loading message */}
      {isLoading && (
        <div className="auth-progress" role="status">
          Preparing your secure password reset link...
        </div>
      )}

      {/* Submit button */}
      <ActionButton
        icon={KeyRound}
        variant="primary"
        type="submit"
        disabled={isLoading || cooldown > 0}
        isLoading={isLoading}
      >
        {isLoading
          ? "Sending reset link..."
          : cooldown > 0
            ? `Resend in ${cooldownLabel}`
            : "Send reset link"}
      </ActionButton>

      {/* Back to login */}
      <button
        type="button"
        className="text-button left"
        onClick={() => onAuthViewChange("login")}
      >
        Back to login
      </button>
    </form>
  );
};

export default PasswordReset;
