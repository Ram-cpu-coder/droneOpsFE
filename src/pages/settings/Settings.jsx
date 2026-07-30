import { AlertTriangle, Bell, CheckCircle2, Database, ImagePlus, Mail, Pencil, Plus, Save, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import ActionButton from "../../components/common/ActionButton";
import MetricCard from "../../components/common/MetricCard";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { userRoles } from "../../data/authData";
import { authService } from "../../features/auth/authService";
import { sessionUserUpdated } from "../../features/auth/authSlice";
import { droneOpsApi } from "../../services/droneOpsApi";
import { defaultThresholds, getEmailChangeToast, toThresholdPayload, toThresholdRows } from "./settingsConfig";

const Settings = ({ user }) => {
  const dispatch = useDispatch();
  const toastTimerRef = useRef(null);
  const [form, setForm] = useState(() => toUserForm(user));
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [imageUpload, setImageUpload] = useState({ isUploading: false, fileName: "", error: "" });
  const [thresholds, setThresholds] = useState(defaultThresholds);
  const [thresholdDraft, setThresholdDraft] = useState(defaultThresholds);
  const [organisation, setOrganisation] = useState(() => toOrganisationForm(user));
  const [organisationDraft, setOrganisationDraft] = useState(() => toOrganisationForm(user));
  const [isEditingOrganisation, setIsEditingOrganisation] = useState(false);
  const [isSavingOrganisation, setIsSavingOrganisation] = useState(false);
  const [isEditingThresholds, setIsEditingThresholds] = useState(false);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);
  const [catalogRows, setCatalogRows] = useState([]);
  const [catalogDraft, setCatalogDraft] = useState(defaultCatalogDraft);
  const [editingCatalogId, setEditingCatalogId] = useState("");
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [toast, setToast] = useState(null);
  const canEditThresholds = Boolean(user?.permissions?.includes("*") || user?.role === "system_administrator");
  const canEditOrganisation = canEditThresholds;
  const canManageCatalog = canEditThresholds;
  const roleLabel = useMemo(
    () => userRoles.find((role) => role.id === user?.role)?.label ?? user?.roleLabel ?? "DroneOps user",
    [user?.role, user?.roleLabel]
  );

  useEffect(() => {
    setForm(toUserForm(user));
    const nextOrganisation = toOrganisationForm(user);
    setOrganisation(nextOrganisation);
    setOrganisationDraft(nextOrganisation);
  }, [user]);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      droneOpsApi.settings.alertThresholds(),
      droneOpsApi.settings.organisation(),
      canManageCatalog ? droneOpsApi.drones.catalog({ includeInactive: true }) : Promise.resolve([])
    ])
      .then(([thresholdResult, organisationResult, catalogResult]) => {
        if (!isMounted) return;
        const nextThresholds = toThresholdRows(thresholdResult);
        const nextOrganisation = toOrganisationForm({ organisation: organisationResult });
        setThresholds(nextThresholds);
        setThresholdDraft(nextThresholds);
        setOrganisation(nextOrganisation);
        setOrganisationDraft(nextOrganisation);
        setCatalogRows(toCatalogRows(catalogResult));
      })
      .catch((error) => {
        if (!isMounted) return;
        showToast({ type: "error", title: "Settings could not be loaded", message: error.message });
      });

    return () => {
      isMounted = false;
    };
  }, [canManageCatalog]);

  const showToast = (nextToast) => {
    setToast(nextToast);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4500);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateOrganisationDraft = (field, value) => {
    setOrganisationDraft((current) => ({ ...current, [field]: value }));
  };

  const handleProfileImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageUpload({ isUploading: true, fileName: file.name, error: "" });

    try {
      const result = await authService.uploadProfileImage(file);
      updateField("profileImageUrl", result.profileImageUrl);
      setImageUpload({ isUploading: false, fileName: file.name, error: "" });
      showToast({ type: "success", title: "Image uploaded", message: "Save your settings to apply the new profile image." });
    } catch (error) {
      setImageUpload({ isUploading: false, fileName: "", error: error.message });
    } finally {
      event.target.value = "";
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const updatedUser = await droneOpsApi.users.updateMe({
        name: form.name,
        email: form.email,
        profileImageUrl: form.profileImageUrl || null
      });
      const session = authService.updateStoredUser(updatedUser);
      if (session?.user) dispatch(sessionUserUpdated(session.user));
      setForm(toUserForm(session?.user ?? updatedUser));
      if (updatedUser.emailChangePending) {
        showToast(getEmailChangeToast(updatedUser.emailChangePending));
      } else {
        showToast({ type: "success", title: "Settings saved", message: "Your DroneOps profile has been updated." });
      }
    } catch (error) {
      showToast({ type: "error", title: "Settings could not be saved", message: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    setIsSendingReset(true);

    try {
      await authService.requestPasswordReset(form.email);
      showToast({ type: "success", title: "Reset link requested", message: "If the account exists, a password reset email has been sent." });
    } catch (error) {
      showToast({ type: "error", title: "Password reset failed", message: error.message });
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleEditOrganisation = () => {
    setOrganisationDraft(organisation);
    setIsEditingOrganisation(true);
  };

  const handleCancelOrganisation = () => {
    setOrganisationDraft(organisation);
    setIsEditingOrganisation(false);
  };

  const handleSaveOrganisation = async () => {
    setIsSavingOrganisation(true);

    try {
      const updatedOrganisation = await droneOpsApi.settings.updateOrganisation({
        name: organisationDraft.name,
        industry: organisationDraft.industry || null
      });
      const nextOrganisation = toOrganisationForm({ organisation: updatedOrganisation });
      setOrganisation(nextOrganisation);
      setOrganisationDraft(nextOrganisation);
      setIsEditingOrganisation(false);
      const session = authService.updateStoredUser({ organisation: updatedOrganisation, organization: updatedOrganisation.name });
      if (session?.user) dispatch(sessionUserUpdated(session.user));
      showToast({ type: "success", title: "Organisation updated", message: "Organisation details were updated for this workspace." });
    } catch (error) {
      showToast({ type: "error", title: "Organisation could not be saved", message: error.message });
    } finally {
      setIsSavingOrganisation(false);
    }
  };

  const updateThresholdDraft = (key, value) => {
    setThresholdDraft((current) => current.map((item) => (
      item.key === key ? { ...item, value: value === "" ? "" : Number(value) } : item
    )));
  };

  const handleEditThresholds = () => {
    setThresholdDraft(thresholds);
    setIsEditingThresholds(true);
  };

  const handleCancelThresholds = () => {
    setThresholdDraft(thresholds);
    setIsEditingThresholds(false);
  };

  const handleSaveThresholds = async () => {
    setIsSavingThresholds(true);

    try {
      const updatedThresholds = await droneOpsApi.settings.updateAlertThresholds(toThresholdPayload(thresholdDraft));
      const nextThresholds = toThresholdRows(updatedThresholds);
      setThresholds(nextThresholds);
      setThresholdDraft(nextThresholds);
      setIsEditingThresholds(false);
      showToast({ type: "success", title: "Alert thresholds updated", message: "Telemetry alerts will now use the new trigger levels." });
    } catch (error) {
      showToast({ type: "error", title: "Thresholds could not be saved", message: error.message });
    } finally {
      setIsSavingThresholds(false);
    }
  };

  const updateCatalogDraft = (field, value) => {
    setCatalogDraft((current) => ({ ...current, [field]: value }));
  };

  const resetCatalogForm = () => {
    setCatalogDraft(defaultCatalogDraft);
    setEditingCatalogId("");
  };

  const handleEditCatalogModel = (row) => {
    setEditingCatalogId(row.id);
    setCatalogDraft({
      manufacturer: row.manufacturer ?? "",
      model: row.model ?? "",
      batteryType: row.batteryType ?? "",
      telemetryProvider: row.telemetryProvider ?? "NONE",
      category: row.category ?? "",
      sourceUrl: row.sourceUrl ?? "",
      isActive: row.isActive !== false,
      lastVerifiedAt: toDateInputValue(row.lastVerifiedAt)
    });
  };

  const handleSaveCatalogModel = async (event) => {
    event.preventDefault();
    setIsSavingCatalog(true);

    try {
      const payload = {
        manufacturer: catalogDraft.manufacturer.trim(),
        model: catalogDraft.model.trim(),
        batteryType: catalogDraft.batteryType.trim(),
        telemetryProvider: catalogDraft.telemetryProvider,
        category: catalogDraft.category.trim() || undefined,
        sourceUrl: catalogDraft.sourceUrl.trim() || undefined,
        isActive: catalogDraft.isActive,
        lastVerifiedAt: catalogDraft.lastVerifiedAt ? new Date(catalogDraft.lastVerifiedAt).toISOString() : undefined
      };

      if (editingCatalogId) {
        await droneOpsApi.drones.updateCatalogModel(editingCatalogId, payload);
      } else {
        await droneOpsApi.drones.createCatalogModel(payload);
      }

      const refreshedCatalog = await droneOpsApi.drones.catalog({ includeInactive: true });
      setCatalogRows(toCatalogRows(refreshedCatalog));
      resetCatalogForm();
      showToast({
        type: "success",
        title: editingCatalogId ? "Catalog model updated" : "Catalog model added",
        message: "Drone registration will now use the updated approved model catalog."
      });
    } catch (error) {
      showToast({ type: "error", title: "Catalog could not be saved", message: error.message });
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleRemoveCatalogModel = async (row) => {
    setIsSavingCatalog(true);

    try {
      await droneOpsApi.drones.removeCatalogModel(row.id);
      const refreshedCatalog = await droneOpsApi.drones.catalog({ includeInactive: true });
      setCatalogRows(toCatalogRows(refreshedCatalog));
      if (editingCatalogId === row.id) resetCatalogForm();
      showToast({ type: "success", title: "Catalog model deactivated", message: `${row.model} will no longer appear in drone registration.` });
    } catch (error) {
      showToast({ type: "error", title: "Catalog model could not be removed", message: error.message });
    } finally {
      setIsSavingCatalog(false);
    }
  };

  return (
    <section className="page-stack">
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className={`toast-card ${toast.type === "error" ? "error" : "success"}`}>
            {toast.type === "error" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            <button className="toast-close" type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      <div className="stats-grid two">
        <MetricCard label="Roles" value={userRoles.length} delta="Configured access roles" icon={ShieldCheck} tone="green" />
        <MetricCard label="Alert Rules" value={thresholds.length} delta="Operational thresholds" icon={Bell} tone="purple" />
      </div>
      <form className="panel account-settings-panel" onSubmit={handleSaveProfile}>
        <SectionHeader
          title="My Account"
          description="Profile details used across DroneOps, notifications, reports, and audit records."
          action={<ActionButton icon={Save} variant="primary" type="submit" isLoading={isSaving} disabled={isSaving || imageUpload.isUploading}>Save Settings</ActionButton>}
        />
        <div className="account-settings-layout">
          <div className="current-user-card">
            <div className="current-user-avatar">
              {form.profileImageUrl ? <img src={form.profileImageUrl} alt="" /> : <span>{getInitials(form.name)}</span>}
            </div>
            <div>
              <h3>{form.name || "DroneOps user"}</h3>
              <p>{form.email}</p>
              <StatusBadge>{roleLabel}</StatusBadge>
            </div>
          </div>
          <div className="form-grid account-settings-form">
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
            </label>
            <div className="profile-metric">
              <ShieldCheck size={18} />
              <span>Role</span>
              <strong>{roleLabel}</strong>
            </div>
            <div className="profile-metric">
              <UserRound size={18} />
              <span>Organisation</span>
              <strong>{user?.organization ?? user?.organisation?.name ?? "DroneOps"}</strong>
            </div>
            <label className="upload-field wide-field">
              <input type="file" accept="image/*" onChange={handleProfileImageChange} disabled={isSaving || imageUpload.isUploading} />
              <span><ImagePlus size={18} /> Upload profile image</span>
              <small>
                {imageUpload.isUploading
                  ? "Uploading image..."
                  : imageUpload.fileName || (form.profileImageUrl ? "Profile image ready" : "Optional PNG, JPG, or WebP")}
              </small>
            </label>
            {imageUpload.error && <div className="auth-alert wide-field">{imageUpload.error}</div>}
            <div className="settings-security-row wide-field">
              <div>
                <strong>Password</strong>
                <p>Send a secure reset link to your account email.</p>
              </div>
              <ActionButton icon={Mail} type="button" onClick={handlePasswordReset} isLoading={isSendingReset} disabled={isSendingReset || !form.email}>
                Reset Password
              </ActionButton>
            </div>
          </div>
        </div>
      </form>
      <div className="settings-grid">
        <div className="panel">
          <SectionHeader
            title="Organisation"
            description="Workspace details shared across DroneOps records."
            action={canEditOrganisation ? (
              isEditingOrganisation ? (
                <div className="button-group compact">
                  <ActionButton type="button" onClick={handleCancelOrganisation} disabled={isSavingOrganisation}>Cancel</ActionButton>
                  <ActionButton icon={Save} variant="primary" type="button" onClick={handleSaveOrganisation} isLoading={isSavingOrganisation} disabled={isSavingOrganisation || !organisationDraft.name.trim()}>
                    Save
                  </ActionButton>
                </div>
              ) : (
                <ActionButton icon={Pencil} type="button" onClick={handleEditOrganisation}>Edit</ActionButton>
              )
            ) : null}
          />
          <div className="form-grid account-settings-form">
            <label className="field">
              <span>Organisation Name</span>
              <input
                value={isEditingOrganisation ? organisationDraft.name : organisation.name}
                onChange={(event) => updateOrganisationDraft("name", event.target.value)}
                disabled={!isEditingOrganisation}
                required
              />
            </label>
            <label className="field">
              <span>Industry</span>
              <input
                value={isEditingOrganisation ? organisationDraft.industry : organisation.industry}
                onChange={(event) => updateOrganisationDraft("industry", event.target.value)}
                disabled={!isEditingOrganisation}
                placeholder="Drone operations"
              />
            </label>
          </div>
          {!canEditOrganisation && <p className="settings-note">Only the System Administrator can change organisation details.</p>}
        </div>
        <div className="panel">
          <SectionHeader
            title="Alert Thresholds"
            description="Telemetry trigger levels used by the backend alert engine."
            action={canEditThresholds ? (
              isEditingThresholds ? (
                <div className="button-group compact">
                  <ActionButton type="button" onClick={handleCancelThresholds} disabled={isSavingThresholds}>Cancel</ActionButton>
                  <ActionButton icon={Save} variant="primary" type="button" onClick={handleSaveThresholds} isLoading={isSavingThresholds} disabled={isSavingThresholds}>
                    Save
                  </ActionButton>
                </div>
              ) : (
                <ActionButton icon={Pencil} type="button" onClick={handleEditThresholds}>Edit</ActionButton>
              )
            ) : null}
          />
          <div className="settings-list threshold-settings-list">
            {(isEditingThresholds ? thresholdDraft : thresholds).map((item) => (
              <div className="settings-row threshold-row" key={item.key}>
                <div className="threshold-copy">
                  <span>{item.label}</span>
                  <p>{item.description}</p>
                </div>
                {isEditingThresholds ? (
                  <label className="threshold-control">
                    <input
                      type="number"
                      min="0"
                      max={item.key === "maximumWindSpeed" ? "250" : "100"}
                      value={item.value}
                      onChange={(event) => updateThresholdDraft(item.key, event.target.value)}
                      required
                    />
                    <span>{item.unit}</span>
                  </label>
                ) : (
                  <strong>{item.value}{item.unit}</strong>
                )}
              </div>
            ))}
          </div>
          {!canEditThresholds && <p className="settings-note">Only the System Administrator can change operational alert thresholds.</p>}
        </div>
        {canManageCatalog && (
          <div className="panel wide">
            <SectionHeader
              title="Drone Catalog"
              description="Approved manufacturers, models, battery types, and telemetry defaults used by fleet registration."
              action={<ActionButton icon={Plus} type="button" onClick={resetCatalogForm}>New Model</ActionButton>}
            />
            <form className="catalog-form" onSubmit={handleSaveCatalogModel}>
              <div className="form-grid account-settings-form">
                <label className="field">
                  <span>Manufacturer</span>
                  <input value={catalogDraft.manufacturer} onChange={(event) => updateCatalogDraft("manufacturer", event.target.value)} required />
                </label>
                <label className="field">
                  <span>Model</span>
                  <input value={catalogDraft.model} onChange={(event) => updateCatalogDraft("model", event.target.value)} required />
                </label>
                <label className="field">
                  <span>Battery Type</span>
                  <input value={catalogDraft.batteryType} onChange={(event) => updateCatalogDraft("batteryType", event.target.value)} required />
                </label>
                <label className="field">
                  <span>Telemetry Provider</span>
                  <select value={catalogDraft.telemetryProvider} onChange={(event) => updateCatalogDraft("telemetryProvider", event.target.value)}>
                    {telemetryProviders.map((provider) => (
                      <option key={provider} value={provider}>{formatOptionLabel(provider)}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Category</span>
                  <input value={catalogDraft.category} onChange={(event) => updateCatalogDraft("category", event.target.value)} placeholder="Enterprise thermal" />
                </label>
                <label className="field">
                  <span>Source URL</span>
                  <input type="url" value={catalogDraft.sourceUrl} onChange={(event) => updateCatalogDraft("sourceUrl", event.target.value)} placeholder="https://manufacturer.example/specs" />
                </label>
                <label className="field">
                  <span>Last Verified</span>
                  <input type="date" value={catalogDraft.lastVerifiedAt} onChange={(event) => updateCatalogDraft("lastVerifiedAt", event.target.value)} />
                </label>
                <label className="checkbox-row catalog-active-toggle">
                  <input type="checkbox" checked={catalogDraft.isActive} onChange={(event) => updateCatalogDraft("isActive", event.target.checked)} />
                  <span>Active in registration</span>
                </label>
              </div>
              <div className="form-actions catalog-form-actions">
                {editingCatalogId && <ActionButton type="button" onClick={resetCatalogForm} disabled={isSavingCatalog}>Cancel Edit</ActionButton>}
                <ActionButton icon={Save} variant="primary" type="submit" isLoading={isSavingCatalog} disabled={isSavingCatalog}>
                  {editingCatalogId ? "Update Model" : "Add Model"}
                </ActionButton>
              </div>
            </form>

            <div className="catalog-table-wrap">
              <table className="data-table catalog-table">
                <thead>
                  <tr>
                    <th>Manufacturer</th>
                    <th>Model</th>
                    <th>Battery Type</th>
                    <th>Telemetry</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {catalogRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.manufacturer}</td>
                      <td><strong>{row.model}</strong></td>
                      <td>{row.batteryType}</td>
                      <td>{formatOptionLabel(row.telemetryProvider)}</td>
                      <td><StatusBadge>{row.isActive ? "Active" : "Inactive"}</StatusBadge></td>
                      <td>
                        <div className="table-actions">
                          <button className="icon-button" type="button" onClick={() => handleEditCatalogModel(row)} aria-label={`Edit ${row.model}`} title="Edit model">
                            <Pencil size={16} />
                          </button>
                          {row.isActive && (
                            <button className="icon-button danger" type="button" onClick={() => handleRemoveCatalogModel(row)} aria-label={`Deactivate ${row.model}`} title="Deactivate model" disabled={isSavingCatalog}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!catalogRows.length && (
                    <tr>
                      <td colSpan="6">
                        <div className="empty-table-state">
                          <Database size={22} />
                          <span>No drone catalog models found.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="panel wide">
          <SectionHeader title="Access Roles" description="Current role definitions used for account access control." />
          <div className="role-grid">
            {userRoles.map((item) => (
              <article className="role-card" key={item.id}>
                <h3>{item.label}</h3>
                <p>{item.summary}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const telemetryProviders = ["NONE", "DJI", "AUTEL", "MAVLINK"];

const defaultCatalogDraft = {
  manufacturer: "",
  model: "",
  batteryType: "",
  telemetryProvider: "NONE",
  category: "",
  sourceUrl: "",
  isActive: true,
  lastVerifiedAt: ""
};

const toUserForm = (user) => ({
  name: user?.name ?? "",
  email: user?.email ?? "",
  profileImageUrl: user?.profileImageUrl ?? ""
});

const toOrganisationForm = (user) => ({
  id: user?.organisation?.id ?? "",
  name: user?.organisation?.name ?? user?.organization ?? "DroneOps",
  industry: user?.organisation?.industry ?? ""
});

const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
};

const toCatalogRows = (catalog = []) => (
  catalog.flatMap((manufacturerGroup) => (
    (manufacturerGroup.models ?? []).map((model) => ({
      ...model,
      manufacturer: manufacturerGroup.manufacturer,
      telemetryProvider: model.telemetryProvider ?? manufacturerGroup.telemetryProvider ?? "NONE"
    }))
  ))
);

const toDateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const formatOptionLabel = (value = "") => (
  value.toString().toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
);

export default Settings;
