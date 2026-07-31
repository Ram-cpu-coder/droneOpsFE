import { useEffect, useState } from "react";
import { BriefcaseBusiness, CheckCircle2 } from "lucide-react";
import ActionButton from "../../components/common/ActionButton";
import { userRoles } from "../../data/authData";
import { authService } from "../../features/auth/authService";

const selfSelectableRoles = userRoles.filter(
  (role) => role.id !== "system_administrator",
);

const GoogleProfileSetup = ({
  pendingGoogleProfile,
  error,
  isLoading,
  onComplete,
  onAuthViewChange,
}) => {
  const profile = pendingGoogleProfile?.profile;
  const [form, setForm] = useState({
    organizationCode: "",
    role: "operations_manager",
  });
  const [resolvedOrganization, setResolvedOrganization] = useState(null);
  const [organizationLookup, setOrganizationLookup] = useState({ isLoading: false, error: "" });

  useEffect(() => {
    const code = form.organizationCode.trim();
    setResolvedOrganization(null);

    if (code.length < 4) {
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
        setOrganizationLookup({ isLoading: false, error: lookupError.message });
      }
    }, 350);

    return () => {
      isMounted = false;
      window.clearTimeout(lookupTimer);
    };
  }, [form.organizationCode]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (
      isLoading ||
      !pendingGoogleProfile?.credential ||
      !resolvedOrganization
    )
      return;

    onComplete({
      credential: pendingGoogleProfile.credential,
      ...form,
      organizationCode: form.organizationCode.trim(),
    });
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <h2>Complete profile</h2>
        <p>
          Enter your organization code to join the correct DroneOps workspace.
        </p>
      </div>
      {error && <div className="auth-alert">{error}</div>}
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
        <label className="field">
          <span>Organization Code</span>
          <input
            value={form.organizationCode}
            onChange={(event) =>
              setForm({ ...form, organizationCode: event.target.value })
            }
            placeholder="Organization code"
            required
          />
          {organizationLookup.isLoading && (
            <div className="organisation-code-status checking">
              <small>Checking organisation code...</small>
            </div>
          )}
          {!organizationLookup.isLoading && resolvedOrganization && (
            <div className="organisation-code-status verified">
              <CheckCircle2 size={14} strokeWidth={2.8} />
              <div className="organisation-code-result">
                <strong>{resolvedOrganization.name}</strong>
                <small>Verified organisation</small>
              </div>
            </div>
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
      </fieldset>
      <ActionButton
        icon={BriefcaseBusiness}
        variant="primary"
        type="submit"
        disabled={
          isLoading ||
          !pendingGoogleProfile?.credential ||
          !resolvedOrganization
        }
        isLoading={isLoading}
      >
        {isLoading ? "Creating access..." : "Create DroneOps access"}
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

export default GoogleProfileSetup;
