import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness } from "lucide-react";
import ActionButton from "../../components/common/ActionButton";
import { userRoles } from "../../data/authData";

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
  const initialOrganization = useMemo(() => {
    return profile?.hostedDomain ? `${profile.hostedDomain} Operations` : "";
  }, [profile?.hostedDomain]);

  const [form, setForm] = useState({
    organization: initialOrganization,
    role: "operations_manager",
  });

  useEffect(() => {
    if (!initialOrganization) return;
    setForm((current) =>
      current.organization
        ? current
        : { ...current, organization: initialOrganization },
    );
  }, [initialOrganization]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (
      isLoading ||
      !pendingGoogleProfile?.credential ||
      !form.organization.trim()
    )
      return;

    onComplete({
      credential: pendingGoogleProfile.credential,
      ...form,
      organization: form.organization.trim(),
    });
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <h2>Complete profile</h2>
        <p>
          Confirm your DroneOps organization and role before we create your
          workspace access.
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
          <span>Organization</span>
          <input
            value={form.organization}
            onChange={(event) =>
              setForm({ ...form, organization: event.target.value })
            }
            placeholder="Organization name"
            required
          />
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
          !form.organization.trim()
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
