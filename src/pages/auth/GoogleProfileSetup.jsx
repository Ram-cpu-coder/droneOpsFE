import { useEffect, useState } from "react";
import { BriefcaseBusiness, CheckCircle2 } from "lucide-react";
import ActionButton from "../../components/common/ActionButton";
import { userRoles } from "../../data/authData";
import { authService } from "../../features/auth/authService";

const selfSelectableRoles = userRoles.filter(
  (role) => role.id !== "system_administrator",
);
const ORGANIZATION_CODE_LENGTH = 12;

const GoogleProfileSetup = ({
  pendingGoogleProfile,
  error,
  isLoading,
  onComplete,
  onAuthViewChange,
}) => {
  const profile = pendingGoogleProfile?.profile;
  const hasGoogleCredential = Boolean(pendingGoogleProfile?.credential);
  const [form, setForm] = useState({
    organizationMode: "join",
    organizationCode: "",
    organizationName: "",
    industry: "",
    role: "operations_manager",
  });
  const [resolvedOrganization, setResolvedOrganization] = useState(null);
  const [organizationLookup, setOrganizationLookup] = useState({ isLoading: false, error: "" });
  const submitLabel = form.organizationMode === "create" ? "Create Organisation" : "Join Organisation";
  const trimmedOrganizationName = form.organizationName.trim();
  const trimmedOrganizationCode = form.organizationCode.trim();
  const isJoinReady = form.organizationMode === "join" && Boolean(resolvedOrganization) && !organizationLookup.isLoading;
  const isCreateReady = form.organizationMode === "create" && trimmedOrganizationName.length >= 2;
  const canSubmit =
    !isLoading &&
    hasGoogleCredential &&
    (form.organizationMode === "create" ? isCreateReady : isJoinReady);

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

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    if (form.organizationMode === "create") {
      onComplete({
        credential: pendingGoogleProfile.credential,
        organizationMode: "create",
        organizationName: trimmedOrganizationName,
        industry: form.industry.trim(),
        role: "system_administrator",
      });

      return;
    }

    onComplete({
      credential: pendingGoogleProfile.credential,
      organizationMode: "join",
      organizationCode: trimmedOrganizationCode,
      role: form.role,
    });
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <h2>Set up your workspace</h2>
        <p>
          Join an existing DroneOps workspace or create a new organisation.
        </p>
      </div>
      {error && <div className="auth-alert">{error}</div>}
      {!hasGoogleCredential && (
        <div className="auth-alert">
          Google sign-in session expired. Please go back to login and sign in with Google again.
        </div>
      )}
      {profile && (
        <div className="google-profile-card">
          {profile.picture && <img src={profile.picture} alt="" />}
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.email}</span>
          </div>
        </div>
      )}
      <fieldset
        className="auth-form-grid google-profile-grid"
        disabled={isLoading}
      >
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
          <>
            <label className="field">
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
            <label className="field">
              <span>Role</span>
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                {selfSelectableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="field">
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
            <label className="field">
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
              <CheckCircle2 size={14} strokeWidth={2.8} />
              <div className="organisation-code-result">
                <strong>You will become System Administrator</strong>
                <small>Secure joining code will be created after signup.</small>
              </div>
            </div>
          </>
        )}
      </fieldset>
      <ActionButton
        icon={BriefcaseBusiness}
        variant="primary"
        type="submit"
        disabled={
          !canSubmit
        }
        isLoading={isLoading}
      >
        {isLoading ? (form.organizationMode === "create" ? "Creating organisation..." : "Joining organisation...") : submitLabel}
      </ActionButton>
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

const normalizeOrganizationCode = (value = "") => (
  value.toString().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, ORGANIZATION_CODE_LENGTH)
);

export default GoogleProfileSetup;
