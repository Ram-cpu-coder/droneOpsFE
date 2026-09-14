import { CheckCircle2, MailCheck } from "lucide-react";
import ActionButton from "../../components/common/ActionButton";

const VerifyEmail = ({
  pendingUser,
  emailSent,
  emailError,
  canUseLocalVerification,
  isLoading = false,
  onVerify,
  onResend,
  onAuthViewChange,
}) => {
  const canResend = Boolean(pendingUser?.email && onResend);

  return (
    <div className="auth-form verify-email-form">
      <div>
        <h2>Email verification</h2>
        <p>
          We sent a secure verification link to your email. Open it once, then
          come back and log in.
        </p>
      </div>

      <div className="verification-card">
        <div className="verification-icon">
          <CheckCircle2 size={26} />
        </div>

        <div className="verification-content">
          <strong>Account created successfully</strong>
          <p>Verification is required before portal access is enabled.</p>
        </div>

        <div className="verification-destination">
          <span>
            {emailSent
              ? "Verification link sent to"
              : "Verification is ready for"}
          </span>
          <strong>{pendingUser?.email}</strong>
        </div>

        {!emailSent && emailError && (
          <small>
            Email delivery needs SMTP review. You can still use local
            verification while developing.
          </small>
        )}
      </div>

      {canResend && (
        <ActionButton icon={MailCheck} variant="primary" onClick={onResend} disabled={isLoading} isLoading={isLoading}>
          {isLoading ? "Sending verification..." : "Resend verification email"}
        </ActionButton>
      )}

      {canUseLocalVerification && !emailSent && (
        <ActionButton icon={MailCheck} onClick={onVerify} disabled={isLoading}>
          Verify locally
        </ActionButton>
      )}

      <button
        type="button"
        className="text-button left"
        onClick={() => onAuthViewChange("login")}
      >
        Back to login
      </button>
    </div>
  );
};

export default VerifyEmail;
