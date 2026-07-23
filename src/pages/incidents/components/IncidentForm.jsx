import { AlertTriangle, MapPinned, RadioTower, Save, UserRoundCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import { drones, incidents, missions } from "../../../data/droneOpsData";

const severityLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const incidentSources = ["Telemetry", "Weather", "Pilot Report", "Maintenance", "Geofence", "Manual Report"];
const incidentTypes = [
  { value: "LOSS_OF_SIGNAL", label: "Loss of signal" },
  { value: "GEOFENCE_BREACH", label: "Geofence alert" },
  { value: "LOW_BATTERY", label: "Low battery" },
  { value: "COLLISION", label: "Collision" },
  { value: "EMERGENCY_LANDING", label: "Emergency landing" },
  { value: "EQUIPMENT_FAILURE", label: "Equipment issue" },
  { value: "WEATHER_EVENT", label: "Weather event" }
];
const ownerOptionsSource = Array.from(new Set(incidents.map((incident) => incident.owner).filter(Boolean))).map((owner) => ({
  id: owner,
  name: owner,
  role: owner === "Maintenance" ? "MAINTENANCE_COORDINATOR" : "SAFETY_OFFICER"
}));

const initialForm = {
  incidentCode: "",
  title: "",
  type: "",
  severity: "LOW",
  droneId: "",
  missionId: "",
  assignedToId: "",
  source: "Manual Report",
  location: "",
  details: ""
};

const IncidentForm = ({ incident = null, mode = "create", onCreated, onUpdated, onCancel }) => {
  const [form, setForm] = useState(() => toFormState(incident));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const ownerOptions = useMemo(
    () => ownerOptionsSource.filter((user) => ["SAFETY_OFFICER", "MAINTENANCE_COORDINATOR", "OPERATIONS_MANAGER", "SYSTEM_ADMINISTRATOR"].includes(user.role)),
    []
  );

  useEffect(() => {
    setForm(toFormState(incident));
  }, [incident]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel?.();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const payload = {
        id: incident?.uuid ?? incident?.idRaw ?? incident?.id ?? form.incidentCode,
        incidentCode: form.incidentCode,
        title: form.title,
        type: form.type,
        severity: form.severity,
        droneId: form.droneId,
        missionId: form.missionId || undefined,
        assignedToId: form.assignedToId || undefined,
        source: form.source || undefined,
        location: form.location || undefined,
        place: form.location || undefined,
        details: form.details || undefined,
        owner: ownerOptionsSource.find((owner) => owner.id === form.assignedToId)?.name ?? form.assignedToId ?? "Unassigned",
        drone: form.droneId || undefined,
        mission: form.missionId || undefined,
        status: incident?.status ?? "Open",
        time: incident?.time ?? "Just now",
        createdAt: incident?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setForm(initialForm);
      setIsConfirmed(false);
      if (mode === "edit") {
        onUpdated?.({
          ...payload,
          incidentCode: payload.incidentCode ?? form.incidentCode
        });
      } else {
        onCreated?.({
          ...payload,
          incidentCode: payload.incidentCode ?? form.incidentCode
        });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel?.()}>
      <form className="modal-dialog registration-dialog" role="dialog" aria-modal="true" aria-labelledby="log-incident-title" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Incident Register</p>
            <h2 id="log-incident-title">{mode === "edit" ? "Update Incident" : "Log Incident"}</h2>
            <p>{mode === "edit" ? "Adjust the incident details, ownership, and follow-up information." : "Record what happened, link the drone, and assign someone to follow up."}</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close incident form">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-alert">{error}</div>}

          <div className="form-layout modal-form-layout">
            <FormSection icon={AlertTriangle} title="Incident Details">
              <Field label="Incident ID" value={form.incidentCode} onChange={(value) => updateField("incidentCode", value)} placeholder="INC-2204" required />
              <Field label="Title" value={form.title} onChange={(value) => updateField("title", value)} placeholder="Low battery during inspection" required />
              <SelectField label="Incident Type" value={form.type} onChange={(value) => updateField("type", value)} options={incidentTypes} required />
              <SelectField label="Severity" value={form.severity} onChange={(value) => updateField("severity", value)} options={severityLevels} required />
            </FormSection>

            <FormSection icon={RadioTower} title="Linked Records">
              <SelectField
                label="Drone"
                value={form.droneId}
                onChange={(value) => updateField("droneId", value)}
                options={drones.map((drone) => ({ value: drone.id, label: `${drone.droneCode ?? drone.id} - ${drone.model}` }))}
                required
              />
              <SelectField
                label="Mission"
                value={form.missionId}
                onChange={(value) => updateField("missionId", value)}
                options={missions.map((mission) => ({ value: mission.id, label: `${mission.missionCode ?? mission.id} - ${mission.name}` }))}
              />
              <SelectField label="Source" value={form.source} onChange={(value) => updateField("source", value)} options={incidentSources} />
            </FormSection>

            <FormSection icon={UserRoundCheck} title="Follow Up">
              <SelectField
                label="Assigned Owner"
                value={form.assignedToId}
                onChange={(value) => updateField("assignedToId", value)}
                options={ownerOptions.map((owner) => ({ value: owner.id, label: owner.name }))}
              />
              <Field label="Location" value={form.location} onChange={(value) => updateField("location", value)} placeholder="Site B - Zone 2" />
            </FormSection>

            <FormSection icon={MapPinned} title="Notes">
              <TextareaField
                label="What happened?"
                value={form.details}
                onChange={(value) => updateField("details", value)}
                placeholder="Add a short description, immediate action taken, and any useful evidence."
              />
            </FormSection>
          </div>
        </div>

        <div className="modal-footer">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={isConfirmed}
              onChange={(event) => setIsConfirmed(event.target.checked)}
              required
            />
            <span>I confirm the incident details are accurate and ready to submit.</span>
          </label>
          <div className="form-actions">
            <ActionButton onClick={onCancel}>Cancel</ActionButton>
            <ActionButton icon={Save} variant="primary" type="submit" disabled={isSaving || !isConfirmed}>
              {isSaving ? (mode === "edit" ? "Saving" : "Logging") : (mode === "edit" ? "Save Incident" : "Log Incident")}
            </ActionButton>
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
};

const FormSection = ({ icon: Icon, title, children }) => (
  <section className="form-section">
    <div className="form-section-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
    <div className="form-grid">{children}</div>
  </section>
);

const Field = ({ label, type = "text", placeholder = "", value, onChange, required = false }) => (
  <label className="field">
    <span>{label}</span>
    <input type={type} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} required={required} />
  </label>
);

const SelectField = ({ label, options, value, onChange, required = false }) => (
  <label className="field">
    <span>{label}</span>
    <select value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} required={required}>
      <option value="" disabled>Select {label.toLowerCase()}</option>
      {options.map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        return <option key={value} value={value}>{label}</option>;
      })}
    </select>
  </label>
);

const TextareaField = ({ label, placeholder = "", value, onChange }) => (
  <label className="field wide-field">
    <span>{label}</span>
    <textarea value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} rows={4} />
  </label>
);

const toFormState = (incident) => {
  if (!incident) return initialForm;
  return {
    incidentCode: incident.incidentCode ?? incident.id ?? "",
    title: incident.title ?? "",
    type: incident.type ?? "",
    severity: incident.severity ?? "LOW",
    droneId: incident.drone?.id ?? incident.droneId ?? "",
    missionId: incident.mission?.id ?? incident.missionId ?? "",
    assignedToId: incident.assignedTo?.id ?? incident.assignedToId ?? "",
    source: incident.source ?? "Manual Report",
    location: incident.location ?? incident.place ?? "",
    details: incident.details ?? ""
  };
};

export default IncidentForm;
