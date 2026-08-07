import { AlertTriangle, CheckCircle2, ChevronDown, MapPinned, RadioTower, Save, Search, UserRoundCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import { useApiResource } from "../../../hooks/useApiResource";
import { droneOpsApi } from "../../../services/droneOpsApi";
import IncidentLocationPicker from "./IncidentLocationPicker";

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
  locationPoint: null,
  details: ""
};

const IncidentForm = ({ incident = null, mode = "create", onCreated, onUpdated, onCancel }) => {
  const [form, setForm] = useState(() => toFormState(incident));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const errorRef = useRef(null);
  const formBodyRef = useRef(null);
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const loadMissions = useCallback(() => droneOpsApi.missions.list(), []);
  const loadUsers = useCallback(() => droneOpsApi.users.list(), []);
  const { data: drones } = useApiResource(loadDrones, []);
  const { data: missions } = useApiResource(loadMissions, []);
  const { data: users } = useApiResource(loadUsers, []);

  const ownerOptions = useMemo(
    () => users.filter((user) => ["SAFETY_OFFICER", "MAINTENANCE_COORDINATOR", "OPERATIONS_MANAGER", "SYSTEM_ADMINISTRATOR"].includes(user.role)),
    [users]
  );
  const droneOptions = useMemo(
    () => drones.map((drone) => ({
      value: drone.uuid ?? drone.id,
      label: drone.droneCode ?? drone.id,
      title: [drone.manufacturer, drone.model].filter(Boolean).join(" ") || "Drone",
      meta: [formatReadableValue(drone.status), drone.batteryType].filter(Boolean).join(" | "),
      searchText: `${drone.droneCode ?? drone.id} ${drone.model ?? ""} ${drone.manufacturer ?? ""} ${drone.serialNumber ?? ""}`.toLowerCase()
    })),
    [drones]
  );
  const missionOptions = useMemo(
    () => missions.map((mission) => ({
      value: mission.uuid ?? mission.id,
      label: mission.missionCode ?? mission.id,
      title: mission.name ?? "Mission",
      meta: [mission.type, formatReadableValue(mission.status)].filter(Boolean).join(" | "),
      searchText: `${mission.missionCode ?? mission.id} ${mission.name ?? ""} ${mission.type ?? ""}`.toLowerCase()
    })),
    [missions]
  );
  const assigneeOptions = useMemo(
    () => ownerOptions.map((owner) => ({
      value: owner.id,
      label: owner.name,
      title: owner.name,
      meta: owner.email ?? formatReadableValue(owner.role),
      searchText: `${owner.name} ${owner.email ?? ""} ${owner.role ?? ""}`.toLowerCase()
    })),
    [ownerOptions]
  );
  const selectedDrone = useMemo(() => drones.find((drone) => (drone.uuid ?? drone.id) === form.droneId) ?? null, [drones, form.droneId]);
  const selectedMission = useMemo(() => missions.find((mission) => (mission.uuid ?? mission.id) === form.missionId) ?? null, [missions, form.missionId]);
  const selectedOwner = useMemo(() => ownerOptions.find((owner) => owner.id === form.assignedToId) ?? null, [ownerOptions, form.assignedToId]);
  const readinessItems = [
    { label: "Title", complete: Boolean(form.title.trim()), detail: form.title.trim() || "Required" },
    { label: "Incident type", complete: Boolean(form.type), detail: getIncidentTypeLabel(form.type) || "Required" },
    { label: "Severity", complete: Boolean(form.severity), detail: formatReadableValue(form.severity) },
    { label: "Drone", complete: Boolean(form.droneId), detail: selectedDrone ? `${selectedDrone.droneCode ?? selectedDrone.id} linked` : "Required" },
    { label: "Source", complete: Boolean(form.source), detail: form.source || "Required" },
    { label: "Location", complete: Boolean(form.locationPoint), detail: form.locationPoint ? "Selected on map" : "Required" }
  ];
  const isIncidentReady = readinessItems.every((item) => item.complete);

  useEffect(() => {
    setForm(toFormState(incident));
  }, [incident]);

  useEffect(() => {
    if (!error) return;

    window.requestAnimationFrame(() => {
      formBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [error]);

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
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setFieldErrors({});

    try {
      const nextFieldErrors = getIncidentFieldErrors(form);
      if (Object.keys(nextFieldErrors).length) {
        setFieldErrors(nextFieldErrors);
        setError("Review the highlighted incident fields before submitting.");
        return;
      }

      const locationLabel = form.locationPoint ? formatLocationLabel(form.locationPoint) : undefined;
      const payload = {
        ...(mode === "edit" && form.incidentCode ? { incidentCode: form.incidentCode } : {}),
        title: form.title,
        type: form.type,
        severity: form.severity,
        droneId: form.droneId,
        missionId: form.missionId || undefined,
        assignedToId: form.assignedToId || undefined,
        source: form.source || undefined,
        location: locationLabel,
        place: locationLabel,
        details: form.details || undefined
      };

      const savedIncident = mode === "edit"
        ? await droneOpsApi.incidents.update(incident?.uuid ?? incident?.idRaw ?? incident?.id, payload)
        : await droneOpsApi.incidents.create(payload);

      setForm(initialForm);
      if (mode === "edit") {
        onUpdated?.(savedIncident);
      } else {
        onCreated?.(savedIncident);
      }
    } catch (requestError) {
      const submitError = getIncidentSubmitErrorMessage(requestError.message);
      setError(submitError.message);
      setFieldErrors(submitError.fieldErrors);
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

        <div className="modal-body" ref={formBodyRef}>
          {error && <div className="auth-alert" ref={errorRef}>{error}</div>}

          <div className="form-layout modal-form-layout incident-form-layout">
            <FormSection icon={AlertTriangle} title="Incident Details" className="incident-details-section">
              <Field label="Title" value={form.title} onChange={(value) => updateField("title", value)} placeholder="Low battery during inspection" required error={fieldErrors.title} />
              <SelectField label="Incident Type" value={form.type} onChange={(value) => updateField("type", value)} options={incidentTypes} required error={fieldErrors.type} />
              <SelectField label="Severity" value={form.severity} onChange={(value) => updateField("severity", value)} options={severityLevels} required error={fieldErrors.severity} />
            </FormSection>

            <FormSection icon={RadioTower} title="Linked Records" className="incident-linked-section">
              <SearchableSelectField
                label="Drone"
                value={form.droneId}
                onChange={(value) => updateField("droneId", value)}
                options={droneOptions}
                placeholder="Search drone ID, model, serial"
                error={fieldErrors.droneId}
              />
              <IncidentSummaryCard type="drone" item={selectedDrone} />
              <SearchableSelectField
                label="Mission"
                value={form.missionId}
                onChange={(value) => updateField("missionId", value)}
                options={missionOptions}
                placeholder="Search mission ID or name"
              />
              <IncidentSummaryCard type="mission" item={selectedMission} />
              <SelectField label="Source" value={form.source} onChange={(value) => updateField("source", value)} options={incidentSources} error={fieldErrors.source} />
            </FormSection>

            <FormSection icon={UserRoundCheck} title="Follow Up" className="incident-followup-section">
              <SearchableSelectField
                label="Assigned Owner"
                value={form.assignedToId}
                onChange={(value) => updateField("assignedToId", value)}
                options={assigneeOptions}
                placeholder="Search owner name or email"
              />
              <IncidentSummaryCard type="owner" item={selectedOwner} />
            </FormSection>

            <FormSection icon={MapPinned} title="Incident Location" className="wide-form-section">
              <IncidentLocationPicker value={form.locationPoint} onChange={(value) => updateField("locationPoint", value)} error={fieldErrors.locationPoint} />
            </FormSection>

            <FormSection icon={MapPinned} title="Notes" className="wide-form-section">
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
          <ReadinessBar items={readinessItems} isReady={isIncidentReady} />
          <div className="form-actions">
            <ActionButton onClick={onCancel}>Cancel</ActionButton>
            <ActionButton icon={Save} variant="primary" type="submit" disabled={isSaving}>
              {isSaving ? (mode === "edit" ? "Saving" : "Logging") : (mode === "edit" ? "Save Incident" : "Log Incident")}
            </ActionButton>
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
};

const FormSection = ({ icon: Icon, title, children, className = "" }) => (
  <section className={`form-section ${className}`}>
    <div className="form-section-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
    <div className="form-grid">{children}</div>
  </section>
);

const Field = ({ label, type = "text", placeholder = "", value, onChange, required = false, error = "" }) => (
  <label className={`field ${error ? "has-error" : ""}`}>
    <span>{label}</span>
    <input type={type} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} required={required} />
    {error && <small className="field-error">{error}</small>}
  </label>
);

const SelectField = ({ label, options, value, onChange, required = false, error = "" }) => (
  <label className={`field ${error ? "has-error" : ""}`}>
    <span>{label}</span>
    <select value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} required={required}>
      <option value="" disabled>Select {label.toLowerCase()}</option>
      {options.map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        return <option key={value} value={value}>{label}</option>;
      })}
    </select>
    {error && <small className="field-error">{error}</small>}
  </label>
);

const SearchableSelectField = ({
  label,
  options,
  value,
  onChange,
  placeholder = "Search",
  error = ""
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const selectedOption = useMemo(
    () => options.find((option) => (typeof option === "string" ? option : option.value) === value) ?? null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const searchText = typeof option === "string"
        ? option.toLowerCase()
        : (option.searchText ?? option.label ?? "").toLowerCase();
      return searchText.includes(normalizedQuery);
    });
  }, [options, query]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const inputValue = isOpen ? query : (selectedOption ? (typeof selectedOption === "string" ? selectedOption : `${selectedOption.label}${selectedOption.title ? ` - ${selectedOption.title}` : ""}`) : "");

  return (
    <div className={`field searchable-select-field ${error ? "has-error" : ""}`} ref={wrapperRef}>
      <span>{label}</span>
      <div className={`field-search-input combo-input ${isOpen ? "open" : ""}`}>
        <Search size={16} />
        <input
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder={selectedOption ? "" : placeholder}
        />
        <button type="button" className="combo-toggle" onClick={() => setIsOpen((current) => !current)} aria-label={`Toggle ${label.toLowerCase()} options`}>
          <ChevronDown size={16} />
        </button>
      </div>
      <input type="hidden" value={value ?? ""} readOnly />
      {error && <small className="field-error">{error}</small>}
      {isOpen && (
        <div className="combo-options" role="listbox" aria-label={label}>
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const optionLabel = typeof option === "string" ? option : option.label;
              const optionTitle = typeof option === "string" ? option : option.title;
              const optionMeta = typeof option === "string" ? "" : option.meta;
              const isSelected = optionValue === value;

              return (
                <button
                  key={optionValue}
                  type="button"
                  className={`combo-option ${isSelected ? "selected" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange?.(optionValue);
                    setQuery("");
                    setIsOpen(false);
                  }}
                >
                  <span className="combo-option-main">
                    <span className="combo-option-copy">
                      <strong>{optionTitle || optionLabel}</strong>
                      <small>{optionMeta || optionLabel}</small>
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="combo-empty">No records matched your search.</div>
          )}
        </div>
      )}
    </div>
  );
};

const TextareaField = ({ label, placeholder = "", value, onChange }) => (
  <label className="field wide-field">
    <span>{label}</span>
    <textarea value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} rows={4} />
  </label>
);

const IncidentSummaryCard = ({ type, item }) => {
  if (!item) {
    const emptyCopy = {
      drone: ["No drone linked", "Select the affected drone"],
      mission: ["No mission linked", "Optional, link the related mission"],
      owner: ["No owner assigned", "Optional, assign a follow-up owner"]
    };
    const [label, detail] = emptyCopy[type] ?? ["No record selected", "Select a record"];
    return (
      <div className="assignment-summary-card empty">
        <span>{label}</span>
        <strong>{detail}</strong>
      </div>
    );
  }

  if (type === "drone") {
    return (
      <div className="assignment-summary-card">
        <span>{item.droneCode ?? item.id}</span>
        <strong>{[item.manufacturer, item.model].filter(Boolean).join(" ") || "Drone linked"}</strong>
        <small>{[formatReadableValue(item.status), item.batteryType].filter(Boolean).join(" | ") || "Aircraft selected"}</small>
      </div>
    );
  }

  if (type === "mission") {
    return (
      <div className="assignment-summary-card">
        <span>{item.missionCode ?? item.id}</span>
        <strong>{item.name ?? "Mission linked"}</strong>
        <small>{[item.type, formatReadableValue(item.status)].filter(Boolean).join(" | ") || "Related mission selected"}</small>
      </div>
    );
  }

  return (
    <div className="assignment-summary-card">
      <span>{formatReadableValue(item.role)}</span>
      <strong>{item.name}</strong>
      <small>{item.email ?? "Owner selected"}</small>
    </div>
  );
};

const ReadinessBar = ({ items, isReady }) => {
  const missingItems = items.filter((item) => !item.complete).map((item) => item.label.toLowerCase());
  return (
    <div className={`mission-readiness-footer incident-readiness-footer ${isReady ? "ready" : ""}`}>
      {isReady ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      <span>{isReady ? "Incident record is ready to submit." : `Missing: ${missingItems.join(", ")}`}</span>
    </div>
  );
};

const getIncidentFieldErrors = (form) => {
  const errors = {};

  if (!form.title.trim()) errors.title = "Title is required.";
  if (!form.type) errors.type = "Incident type is required.";
  if (!form.severity) errors.severity = "Severity is required.";
  if (!form.droneId) errors.droneId = "Affected drone is required.";
  if (!form.source) errors.source = "Source is required.";
  if (!form.locationPoint) errors.locationPoint = "Select the incident location on the map.";

  return errors;
};

const getIncidentSubmitErrorMessage = (message = "") => {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("incident code") && normalizedMessage.includes("required")) {
    return {
      message: "Incident could not be logged right now. Please refresh and try again.",
      fieldErrors: {}
    };
  }

  const fieldErrors = {};
  if (normalizedMessage.includes("title")) fieldErrors.title = "Title is required.";
  if (normalizedMessage.includes("type")) fieldErrors.type = "Incident type is required.";
  if (normalizedMessage.includes("severity")) fieldErrors.severity = "Severity is required.";
  if (normalizedMessage.includes("drone")) fieldErrors.droneId = "Affected drone is required.";

  return {
    message: message || "Incident could not be logged. Review the highlighted fields and try again.",
    fieldErrors
  };
};

const toFormState = (incident) => {
  if (!incident) return initialForm;
  const location = incident.location ?? incident.place ?? "";
  return {
    incidentCode: incident.incidentCode ?? incident.id ?? "",
    title: incident.title ?? "",
    type: incident.type ?? "",
    severity: incident.severity ?? "LOW",
    droneId: incident.drone?.id ?? incident.droneId ?? "",
    missionId: incident.mission?.id ?? incident.missionId ?? "",
    assignedToId: incident.assignedTo?.id ?? incident.assignedToId ?? "",
    source: incident.source ?? "Manual Report",
    location,
    locationPoint: toSavedLocation(location),
    details: incident.details ?? ""
  };
};

const toSavedLocation = (value) => {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
  if (!match) return null;

  return {
    label: value.replace(/\s*\(.+\)\s*$/, ""),
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
};

const formatLocationLabel = (location) => (
  `${location.label || "Selected location"} (${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)})`
);

const getIncidentTypeLabel = (value) => incidentTypes.find((type) => type.value === value)?.label ?? "";

const formatReadableValue = (value = "") => (
  value.toString().toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
);

export default IncidentForm;
