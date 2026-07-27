import { ImagePlus, Mail, Pencil, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import StatusBadge from "../../../components/common/StatusBadge";
import { userRoles } from "../../../data/authData";
import { authService } from "../../../features/auth/authService";
import { droneOpsApi } from "../../../services/droneOpsApi";

const apiRoleByRoleId = {
  operations_manager: "OPERATIONS_MANAGER",
  remote_pilot: "REMOTE_PILOT",
  maintenance_coordinator: "MAINTENANCE_COORDINATOR",
  safety_officer: "SAFETY_OFFICER",
  compliance_officer: "COMPLIANCE_OFFICER",
  system_administrator: "SYSTEM_ADMINISTRATOR"
};

const UserProfileDialog = ({ user, currentUser, canManage = false, onUpdated, onDeleted, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const [imageUpload, setImageUpload] = useState({ isUploading: false, fileName: "", error: "" });
  const [form, setForm] = useState(() => toFormState(user));
  const roleLabel = userRoles.find((role) => role.id === user.role)?.label ?? user.role;
  const canDelete = canManage && user.id !== currentUser?.id;
  const initials = useMemo(() => getInitials(user.name), [user.name]);

  useEffect(() => {
    setForm(toFormState(user));
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setError("");
    setImageUpload({ isUploading: false, fileName: "", error: "" });
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        return;
      }
      onClose?.();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, showDeleteConfirm]);

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const updated = await droneOpsApi.users.update(user.id, {
        name: form.name,
        email: form.email,
        role: apiRoleByRoleId[form.role] ?? form.role,
        profileImageUrl: form.profileImageUrl || null,
        isVerified: form.isVerified
      });
      onUpdated?.(updated);
      setIsEditing(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    try {
      await droneOpsApi.users.remove(user.id);
      setShowDeleteConfirm(false);
      onDeleted?.(user);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleProfileImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageUpload({ isUploading: true, fileName: file.name, error: "" });
    setError("");

    try {
      const result = await authService.uploadProfileImage(file);
      setForm((current) => ({ ...current, profileImageUrl: result.profileImageUrl }));
      setImageUpload({ isUploading: false, fileName: file.name, error: "" });
    } catch (uploadError) {
      setImageUpload({ isUploading: false, fileName: "", error: uploadError.message });
    } finally {
      event.target.value = "";
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <form className="modal-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="user-profile-title" onSubmit={handleSave}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">User Profile</p>
            <h2 id="user-profile-title">{user.name}</h2>
            <p>{roleLabel} access inside {user.organization}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close user profile">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-alert">{error}</div>}
          <div className="profile-hero user-profile-hero">
            <UserAvatar user={user} initials={initials} />
            <div>
              <h3>{user.name}</h3>
              <p>{user.email}</p>
            </div>
            <StatusBadge>{user.isVerified ? "Verified" : "Awaiting Approval"}</StatusBadge>
          </div>

          <div className="profile-metrics">
            <ProfileMetric icon={ShieldCheck} label="Role" value={roleLabel} />
            <ProfileMetric icon={UserRound} label="Organisation" value={user.organization} />
            <ProfileMetric icon={Mail} label="Last Login" value={formatDateTime(user.lastLoginAt, "Not logged in yet")} />
          </div>

          {isEditing ? (
            <div className="form-layout user-profile-form">
              <FormSection title="Account Details">
                <FormField label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
                <FormField label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required />
                <label className="field">
                  <span>Role</span>
                  <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                    {userRoles.map((role) => (
                      <option key={role.id} value={role.id}>{role.label}</option>
                    ))}
                  </select>
                </label>
                <label className="upload-field wide-field user-profile-upload">
                  <input type="file" accept="image/*" onChange={handleProfileImageChange} disabled={isSaving || imageUpload.isUploading} />
                  <span><ImagePlus size={18} /> Upload profile image</span>
                  <small>
                    {imageUpload.isUploading
                      ? "Uploading image..."
                      : imageUpload.fileName || (form.profileImageUrl ? "Image ready. Save user to apply it." : "Optional PNG, JPG, or WebP")}
                  </small>
                </label>
                {imageUpload.error && <div className="auth-alert wide-field">{imageUpload.error}</div>}
                {form.profileImageUrl && (
                  <div className="uploaded-image-preview wide-field">
                    <img src={form.profileImageUrl} alt="" />
                    <span>Profile image selected</span>
                  </div>
                )}
                <label className="confirm-row user-verified-toggle">
                  <input
                    type="checkbox"
                    checked={form.isVerified}
                    onChange={(event) => setForm({ ...form, isVerified: event.target.checked })}
                  />
                  <span>User is verified and allowed to access DroneOps.</span>
                </label>
              </FormSection>
            </div>
          ) : (
            <div className="profile-grid">
              <ProfileSection icon={UserRound} title="Identity">
                <ProfileRow label="Name" value={user.name} />
                <ProfileRow label="Email" value={user.email} />
                <ProfileRow label="Organisation" value={user.organization} />
                <ProfileRow label="Profile Image" value={user.profileImageUrl ? "Available" : "Not uploaded"} />
              </ProfileSection>

              <ProfileSection icon={ShieldCheck} title="Access">
                <ProfileRow label="Role" value={roleLabel} />
                <ProfileRow label="Verification" value={user.isVerified ? "Verified" : "Awaiting Approval"} />
                <ProfileRow label="Created" value={formatDateTime(user.createdAt)} />
                <ProfileRow label="Last Login" value={formatDateTime(user.lastLoginAt, "Not logged in yet")} />
              </ProfileSection>
            </div>
          )}
        </div>

        <div className="modal-footer profile-footer">
          {canManage && (
            <div className="form-actions">
              {isEditing ? (
                <>
                  <ActionButton type="button" onClick={() => setIsEditing(false)}>Cancel</ActionButton>
                  <ActionButton icon={Pencil} variant="primary" type="submit" isLoading={isSaving} disabled={isSaving || imageUpload.isUploading}>Save User</ActionButton>
                </>
              ) : (
                <>
                  <ActionButton icon={Pencil} type="button" onClick={() => setIsEditing(true)}>Edit</ActionButton>
                  <ActionButton
                    icon={Trash2}
                    variant="danger"
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!canDelete}
                    title={canDelete ? "Delete user" : "You cannot delete your own active account"}
                  >
                    Delete
                  </ActionButton>
                </>
              )}
            </div>
          )}
          <div className="form-actions">
            <ActionButton type="button" onClick={onClose}>Close</ActionButton>
          </div>
        </div>
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowDeleteConfirm(false)}>
            <div className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-description">
              <div className="delete-confirm-icon">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 id="delete-user-title">Delete {user.name}?</h3>
                <p id="delete-user-description">
                  This removes the user from this organisation. Users with linked operational records may need their role or verification status updated instead.
                </p>
              </div>
              <div className="delete-confirm-actions">
                <ActionButton type="button" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </ActionButton>
                <ActionButton icon={Trash2} variant="danger" type="button" onClick={handleDelete}>
                  Delete User
                </ActionButton>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
};

const UserAvatar = ({ user, initials }) => (
  <div className="user-profile-avatar">
    {user.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : <span>{initials}</span>}
  </div>
);

const ProfileMetric = ({ icon: Icon, label, value }) => (
  <div className="profile-metric">
    <Icon size={18} />
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ProfileSection = ({ icon: Icon, title, children }) => (
  <section className="profile-section">
    <div className="profile-section-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
    <dl>{children}</dl>
  </section>
);

const ProfileRow = ({ label, value }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value || "Not provided"}</dd>
  </div>
);

const FormSection = ({ title, children }) => (
  <section className="form-section">
    <div className="form-section-title">
      <UserRound size={18} />
      <h3>{title}</h3>
    </div>
    <div className="form-grid">{children}</div>
  </section>
);

const FormField = ({ label, value, onChange, type = "text", placeholder, required = false }) => (
  <label className="field">
    <span>{label}</span>
    <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
  </label>
);

const toFormState = (user) => ({
  name: user.name ?? "",
  email: user.email ?? "",
  role: user.role ?? "remote_pilot",
  profileImageUrl: user.profileImageUrl ?? "",
  isVerified: Boolean(user.isVerified)
});

const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
};

const formatDateTime = (value, fallback = "Not provided") => {
  if (!value) return fallback;
  return new Date(value).toLocaleString();
};

export default UserProfileDialog;
