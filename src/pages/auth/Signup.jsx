import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, UserPlus } from "lucide-react";
import ActionButton from "../../components/common/ActionButton";
import { userRoles } from "../../data/authData";
import { authService } from "../../features/auth/authService";

// Hide system admin from public signup.
const publicSignupRoles = userRoles.filter(
  (role) => role.id !== "system_administrator",
);

// Password validation rules.
const passwordRules = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (value) => value.length >= 8,
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (value) => /[a-z]/.test(value),
  },
  {
    id: "number",
    label: "One number",
    test: (value) => /\d/.test(value),
  },
  {
    id: "special",
    label: "One special character",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];
const ORGANIZATION_CODE_LENGTH = 12;

const Signup = ({ error, isLoading, onSignup, onAuthViewChange }) => {
  // Signup form values.
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    organizationMode: "join",
    organizationCode: "",
    organizationName: "",
    industry: "",
    role: "operations_manager",
  });

  // Password visibility.
  const [showPassword, setShowPassword] = useState(false);
  const [resolvedOrganization, setResolvedOrganization] = useState(null);
  const [organizationLookup, setOrganizationLookup] = useState({ isLoading: false, error: "" });
  const submitLabel = form.organizationMode === "create" ? "Create Organisation" : "Join Organisation";

  // Check each password rule.
  const passwordStatus = passwordRules.map((rule) => ({
    ...rule,
    isValid: rule.test(form.password),
  }));

  // True only if all rules pass.
  const isPasswordValid = passwordStatus.every((rule) => rule.isValid);
  const isJoinReady = form.organizationMode === "join" && Boolean(resolvedOrganization) && !organizationLookup.isLoading;
  const isCreateReady = form.organizationMode === "create" && Boolean(form.organizationName.trim());
  const canSubmit = !isLoading && isPasswordValid && (form.organizationMode === "join" ? isJoinReady : isCreateReady);

  useEffect(() => {
    if (form.organizationMode === "create") {
      setResolvedOrganization(null);
      setOrganizationLookup({ isLoading: false, error: "" });
      return;
    }

    const code = normalizeOrganizationCode(form.organizationCode);
    setResolvedOrganization(null);

    if (code.length !== ORGANIZATION_CODE_LENGTH) {
      setOrganizationLookup({ isLoading: false, error: "" });
      return;
    }

    let isMounted = true;
    setOrganizationLookup({ isLoading: true, error: "" });

    const lookupTimer = window.setTimeout(async () => {
      try {
        const organisation = await authService.resolveOrganisationCode(code);
        if (!isMounted) return;
        setResolvedOrganization(organisation);
        setOrganizationLookup({ isLoading: false, error: "" });
      } catch (lookupError) {
        if (!isMounted) return;
        setResolvedOrganization(null);
        setOrganizationLookup({ isLoading: false, error: "Invalid organisation code." });
      }
    }, 350);

    return () => {
      isMounted = false;
      window.clearTimeout(lookupTimer);
    };
  }, [form.organizationCode, form.organizationMode]);

  // Submit signup form.
  const handleSubmit = (event) => {
    event.preventDefault();

    if (!canSubmit) return;

    onSignup(form);
  };

  return (
    <form className="auth-form signup-form" onSubmit={handleSubmit}>
      {/* Page title */}
      <div>
        <h2>Create account</h2>
        <p>
          Join an existing DroneOps workspace or create a new organisation.
        </p>
      </div>

      {/* Show signup error */}
      {error && <div className="auth-alert">{error}</div>}

      {/* Disable fields while submitting */}
      <fieldset className="auth-form-grid" disabled={isLoading}>
        {/* Name input */}
        <label className="field wide-field">
          <span>Name</span>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Full name"
            required
          />
        </label>

        {/* Email input */}
        <label className="field wide-field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            placeholder="work.email@example.com"
            required
          />
        </label>

        {/* Password input */}
        <label className="field password-field wide-field">
          <span>Password</span>
          <input
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
            placeholder="Strong password"
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

        {/* Password rule checklist */}
        <div className="password-rules" aria-live="polite">
          {passwordStatus.map((rule) => (
            <span key={rule.id} className={rule.isValid ? "is-valid" : ""}>
              {rule.isValid ? (
                <Check size={13} strokeWidth={3} />
              ) : (
                <i aria-hidden="true" />
              )}{" "}
              {rule.label}
            </span>
          ))}
        </div>

        <div className="auth-choice-row wide-field" role="tablist" aria-label="Organisation access option">
          <button
            type="button"
            className={form.organizationMode === "join" ? "active" : ""}
            onClick={() => setForm({ ...form, organizationMode: "join" })}
          >
            Join organisation
          </button>
          <button
            type="button"
            className={form.organizationMode === "create" ? "active" : ""}
            onClick={() => setForm({ ...form, organizationMode: "create" })}
          >
            Create organisation
          </button>
        </div>

        {form.organizationMode === "join" ? (
          <label className="field wide-field">
            <span>Organization Code</span>
            <input
              value={form.organizationCode}
              onChange={(event) =>
                setForm({ ...form, organizationCode: normalizeOrganizationCode(event.target.value) })
              }
              onBlur={() => {
                const code = normalizeOrganizationCode(form.organizationCode);
                if (code && code.length !== ORGANIZATION_CODE_LENGTH) {
                  setOrganizationLookup({ isLoading: false, error: "Organisation code must be 12 characters." });
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || isJoinReady) return;
                event.preventDefault();
              }}
              maxLength={ORGANIZATION_CODE_LENGTH}
              placeholder="ORG-XXXXXXXX"
            />
            {!organizationLookup.isLoading && !resolvedOrganization && !organizationLookup.error && form.organizationCode && form.organizationCode.length < ORGANIZATION_CODE_LENGTH && (
              <div className="organisation-code-status pending">
                <small>Enter all 12 characters before validation starts.</small>
              </div>
            )}
            {organizationLookup.isLoading && (
              <div className="organisation-code-status checking">
                <small>Checking organisation code...</small>
              </div>
            )}
            {!organizationLookup.isLoading && resolvedOrganization && (
              <small className="organisation-code-inline-confirm">
                Joining {resolvedOrganization.name}
              </small>
            )}
            {!organizationLookup.isLoading && organizationLookup.error && (
              <div className="organisation-code-status error">
                <small>{organizationLookup.error}</small>
              </div>
            )}
          </label>
        ) : (
          <>
            <label className="field wide-field">
              <span>Organisation Name</span>
              <input
                value={form.organizationName}
                onChange={(event) =>
                  setForm({ ...form, organizationName: event.target.value })
                }
                placeholder="Your organisation name"
                required
              />
            </label>
            <label className="field wide-field">
              <span>Industry</span>
              <input
                value={form.industry}
                onChange={(event) =>
                  setForm({ ...form, industry: event.target.value })
                }
                placeholder="Drone operations"
              />
            </label>
            <div className="organisation-code-status verified wide-field">
              <Check size={14} strokeWidth={3} />
              <div className="organisation-code-result">
                <strong>You will become System Administrator</strong>
                <small>Secure joining code will be created after signup.</small>
              </div>
            </div>
          </>
        )}

        {/* Role selection */}
        {form.organizationMode === "join" && (
          <label className="field">
            <span>Role</span>
            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              aria-label="Select role"
            >
              {publicSignupRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        )}

      </fieldset>

      {/* Signup loading message */}
      {isLoading && (
        <div className="auth-progress" role="status">
          Creating your DroneOps account and preparing verification...
        </div>
      )}

      {/* Submit button */}
      <ActionButton
        icon={UserPlus}
        variant="primary"
        type="submit"
        disabled={!canSubmit}
        isLoading={isLoading}
      >
        {isLoading ? (form.organizationMode === "create" ? "Creating organisation..." : "Joining organisation...") : submitLabel}
      </ActionButton>

      {/* Back to login */}
      <div className="auth-switch">
        <span>Already registered?</span>

        <button
          type="button"
          className="text-button"
          onClick={() => onAuthViewChange("login")}
        >
          Back to login
        </button>
      </div>
    </form>
  );
};

const normalizeOrganizationCode = (value = "") => (
  value.toString().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, ORGANIZATION_CODE_LENGTH)
);

export default Signup;
