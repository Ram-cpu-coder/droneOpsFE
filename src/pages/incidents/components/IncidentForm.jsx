import { AlertTriangle, CheckCircle2, ChevronDown, FileText, FileUp, Image as ImageIcon, MapPinned, RadioTower, Save, Search, UserRoundCheck, Video, X } from "lucide-react";
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
const MAX_EVIDENCE_FILE_BYTES = 20 * 1024 * 1024;
const allowedEvidenceMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);
const allowedEvidenceExtensions = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".mp4", ".mov", ".webm", ".pdf", ".doc", ".docx", ".txt"];
const initialForm = {
  incidentCode: "",
  title: "",
  type: "",
  severity: "LOW",
  droneId: "",
  droneIds: [],
  missionId: "",
  assignedToId: "",
  source: "Manual Report",
  location: "",
  locationPoint: null,
  details: ""
};
const emptyInitialValues = {};

const IncidentForm = ({ incident = null, mode = "create", initialValues = emptyInitialValues, onCreated, onUpdated, onCancel }) => {
  const [form, setForm] = useState(() => toFormState(incident, initialValues));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [evidenceError, setEvidenceError] = useState("");
  const errorRef = useRef(null);
  const formBodyRef = useRef(null);
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const loadMissions = useCallback(() => droneOpsApi.missions.list(), []);
  const loadUsers = useCallback(() => droneOpsApi.users.list(), []);
  const { data: drones } = useApiResource(loadDrones, [], { cacheKey: "drones:list", staleMs: 10000 });
  const { data: missions } = useApiResource(loadMissions, [], { cacheKey: "missions:list", staleMs: 10000 });
  const { data: users } = useApiResource(loadUsers, [], { cacheKey: "users:list", staleMs: 30000 });

  const ownerOptions = useMemo(
    () => users.filter((user) => ["SAFETY_OFFICER", "MAINTENANCE_COORDINATOR", "OPERATIONS_MANAGER", "SYSTEM_ADMINISTRATOR"].includes(user.role)),
    [users]
  );
  const droneOptions = useMemo(
    () => drones.map((drone) => ({
      value: drone.uuid ?? drone.id,
      label: drone.droneCode ?? drone.id,
      title: [drone.manufacturer, drone.model].filter(Boolean).join(" ") || "Drone",
      meta: formatReadableValue(drone.status),
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
  const selectedDrones = useMemo(
    () => form.droneIds.map((droneId) => drones.find((drone) => (drone.uuid ?? drone.id) === droneId)).filter(Boolean),
    [drones, form.droneIds]
  );
  const selectedMission = useMemo(() => missions.find((mission) => (mission.uuid ?? mission.id) === form.missionId) ?? null, [missions, form.missionId]);
  const selectedOwner = useMemo(() => ownerOptions.find((owner) => owner.id === form.assignedToId) ?? null, [ownerOptions, form.assignedToId]);
  const readinessItems = [
    { label: "Title", complete: Boolean(form.title.trim()), detail: form.title.trim() || "Required" },
    { label: "Incident type", complete: Boolean(form.type), detail: getIncidentTypeLabel(form.type) || "Required" },
    { label: "Severity", complete: Boolean(form.severity), detail: formatReadableValue(form.severity) },
    { label: "Drone", complete: form.droneIds.length > 0, detail: selectedDrones.length ? `${selectedDrones.length} drone(s) linked` : "Required" },
    { label: "Source", complete: Boolean(form.source), detail: form.source || "Required" },
    { label: "Location", complete: Boolean(form.locationPoint), detail: form.locationPoint ? "Selected on map" : "Required" }
  ];
  const isIncidentReady = readinessItems.every((item) => item.complete);

  useEffect(() => {
    setForm(toFormState(incident, initialValues));
    setEvidenceFiles([]);
    setEvidenceError("");
  }, [incident, initialValues]);

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
      if (evidenceError) {
        setError(evidenceError);
        return;
      }

      const locationLabel = form.locationPoint ? formatLocationLabel(form.locationPoint) : undefined;
      const payload = {
        ...(mode === "edit" && form.incidentCode ? { incidentCode: form.incidentCode } : {}),
        title: form.title,
        type: form.type,
        severity: form.severity,
        droneId: form.droneIds[0] || undefined,
        droneIds: form.droneIds,
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
      const savedIncidentId = savedIncident?.id ?? incident?.uuid ?? incident?.idRaw ?? incident?.id;
      const evidenceUploadFailures = [];

      for (const file of evidenceFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name);
        try {
          await droneOpsApi.incidents.uploadEvidence(savedIncidentId, formData);
        } catch (uploadError) {
          evidenceUploadFailures.push(`${file.name}: ${uploadError.message}`);
        }
      }

      setForm(initialForm);
      setEvidenceFiles([]);
      if (mode === "edit") {
        onUpdated?.({ ...savedIncident, evidenceUploadFailures });
      } else {
        onCreated?.({ ...savedIncident, evidenceUploadFailures });
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
    <div className="modal-backdrop" role="presentation">
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
              <div className="assignment-picker-row">
                <div className="assignment-picker-copy">
                  <span>Affected Drones</span>
                  <strong>{selectedDrones.length ? `${selectedDrones.length} linked` : `${droneOptions.length} available`}</strong>
                </div>
                <MultiSearchableSelectField
                  label=""
                  className="assignment-picker-search"
                  value={form.droneIds}
                  onChange={(value) => {
                    setForm((current) => ({ ...current, droneIds: value, droneId: value[0] ?? "" }));
                    setFieldErrors((current) => {
                      if (!current.droneId) return current;
                      const nextErrors = { ...current };
                      delete nextErrors.droneId;
                      return nextErrors;
                    });
                  }}
                  options={droneOptions}
                  placeholder="Search drones"
                  error={fieldErrors.droneId}
                />
              </div>
              <IncidentSummaryCard type="drone" items={selectedDrones} />
              <div className="assignment-picker-row">
                <div className="assignment-picker-copy">
                  <span>Related Mission</span>
                  <strong>{selectedMission ? "Linked" : "Optional"}</strong>
                </div>
                <SearchableSelectField
                  label=""
                  className="assignment-picker-search"
                  value={form.missionId}
                  onChange={(value) => updateField("missionId", value)}
                  options={missionOptions}
                  placeholder="Search missions"
                />
              </div>
              <IncidentSummaryCard type="mission" item={selectedMission} />
              <SelectField label="Source" value={form.source} onChange={(value) => updateField("source", value)} options={incidentSources} error={fieldErrors.source} />
            </FormSection>

            <FormSection icon={UserRoundCheck} title="Follow Up" className="incident-followup-section">
              <div className="assignment-picker-row">
                <div className="assignment-picker-copy">
                  <span>Assigned Owner</span>
                  <strong>{selectedOwner ? "Assigned" : `${assigneeOptions.length} available`}</strong>
                </div>
                <SearchableSelectField
                  label=""
                  className="assignment-picker-search"
                  value={form.assignedToId}
                  onChange={(value) => updateField("assignedToId", value)}
                  options={assigneeOptions}
                  placeholder="Search owner"
                />
              </div>
              <IncidentSummaryCard type="owner" item={selectedOwner} />
            </FormSection>

            <FormSection icon={MapPinned} title="Incident Location" className="wide-form-section">
              <IncidentLocationPicker value={form.locationPoint} onChange={(value) => updateField("locationPoint", value)} error={fieldErrors.locationPoint} />
            </FormSection>

            <FormSection icon={FileUp} title="Incident Evidence Capture" className="wide-form-section">
              <EvidenceCaptureField
                files={evidenceFiles}
                error={evidenceError}
                onChange={(files) => {
                  const validationError = validateEvidenceFiles(files);
                  setEvidenceError(validationError);
                  if (!validationError) setEvidenceFiles(files);
                }}
                onRemove={(nextFiles) => {
                  setEvidenceFiles(nextFiles);
                  setEvidenceError(validateEvidenceFiles(nextFiles));
                }}
              />
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
  error = "",
  className = ""
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
    <div className={`field searchable-select-field ${className} ${error ? "has-error" : ""}`} ref={wrapperRef}>
      {label && <span>{label}</span>}
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
        <button type="button" className="combo-toggle" onClick={() => setIsOpen((current) => !current)} aria-label={`Toggle ${(label || placeholder).toLowerCase()} options`}>
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

const MultiSearchableSelectField = ({
  label,
  options,
  value = [],
  onChange,
  placeholder = "Search",
  error = "",
  className = ""
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selectedValues = Array.isArray(value) ? value : [];

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

  const toggleValue = (optionValue) => {
    const nextValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
      : [...selectedValues, optionValue];
    onChange?.(nextValues);
  };

  return (
    <div className={`field searchable-select-field ${className} ${error ? "has-error" : ""}`} ref={wrapperRef}>
      {label && <span>{label}</span>}
      <div className={`field-search-input combo-input ${isOpen ? "open" : ""}`}>
        <Search size={16} />
        <input
          type="text"
          value={isOpen ? query : (selectedValues.length ? `${selectedValues.length} selected` : "")}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder={selectedValues.length ? "" : placeholder}
        />
        <button type="button" className="combo-toggle" onClick={() => setIsOpen((current) => !current)} aria-label={`Toggle ${(label || placeholder).toLowerCase()} options`}>
          <ChevronDown size={16} />
        </button>
      </div>
      {error && <small className="field-error">{error}</small>}
      {isOpen && (
        <div className="combo-options multi-combo-options" role="listbox" aria-label={label} aria-multiselectable="true">
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const optionLabel = typeof option === "string" ? option : option.label;
              const optionTitle = typeof option === "string" ? option : option.title;
              const optionMeta = typeof option === "string" ? "" : option.meta;
              const isSelected = selectedValues.includes(optionValue);

              return (
                <button
                  key={optionValue}
                  type="button"
                  className={`combo-option multi-combo-option ${isSelected ? "selected" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggleValue(optionValue)}
                >
                  <span className={`combo-checkbox ${isSelected ? "checked" : ""}`} aria-hidden="true">
                    {isSelected && <CheckCircle2 size={14} />}
                  </span>
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

const EvidenceCaptureField = ({ files, error = "", onChange, onRemove }) => {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const previewLimit = 4;
  const visibleFiles = showAllFiles ? files : files.slice(0, previewLimit);
  const hiddenFileCount = Math.max(files.length - previewLimit, 0);

  const removeFile = (fileName, index) => {
    onRemove?.(files.filter((file, fileIndex) => file.name !== fileName || fileIndex !== index));
  };

  const handleFileSelection = (event) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const mergedFiles = mergeEvidenceFiles(files, selectedFiles);
    onChange(mergedFiles);
    setShowAllFiles(false);
    event.target.value = "";
  };

  return (
    <div className="incident-evidence-upload">
      <label className="incident-evidence-dropzone">
        <FileUp size={22} />
        <div>
          <strong>Attach evidence files</strong>
          <span>User-captured evidence is stored with the incident. DroneOps also attaches the recent telemetry black box automatically.</span>
        </div>
        <input
          type="file"
          accept={allowedEvidenceExtensions.join(",")}
          multiple
          onChange={handleFileSelection}
        />
      </label>
      <div className={`incident-evidence-policy ${error ? "has-error" : ""}`}>
        <span>{error || "Accepted: photos, videos, PDF, Word, or text documents. Maximum 20 MB per file."}</span>
      </div>
      {files.length > 0 && (
        <div className="incident-evidence-selection">
          <div className="incident-evidence-selection-header">
            <div>
              <strong>{files.length} attachment{files.length === 1 ? "" : "s"} selected</strong>
              <span>{formatFileSize(files.reduce((total, file) => total + file.size, 0))} total</span>
            </div>
            {hiddenFileCount > 0 && (
              <button className="incident-evidence-toggle" type="button" onClick={() => setShowAllFiles((current) => !current)}>
                {showAllFiles ? "Show less" : `See ${hiddenFileCount} more`}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="incident-evidence-file-list">
            {visibleFiles.map((file, index) => {
              const fileKind = getEvidenceFileKind(file);
              const fileIndex = files.indexOf(file);

              return (
                <div className={`incident-evidence-file ${fileKind.value}`} key={`${file.name}-${file.lastModified}-${index}`}>
                  <button className="incident-evidence-remove" type="button" onClick={() => removeFile(file.name, fileIndex)} aria-label={`Remove ${file.name}`}>
                    <X size={15} />
                  </button>
                  <div className="incident-evidence-preview" aria-hidden="true">
                    <EvidenceFilePreview file={file} fileKind={fileKind} />
                  </div>
                  <div className="incident-evidence-file-copy">
                    <span>{fileKind.label}</span>
                    <strong title={file.name}>{file.name}</strong>
                    <small>{formatFileSize(file.size)}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const EvidenceFilePreview = ({ file, fileKind }) => {
  const [previewUrl, setPreviewUrl] = useState("");
  const Icon = fileKind.icon;

  useEffect(() => {
    if (!["photo", "video"].includes(fileKind.value)) return undefined;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file, fileKind.value]);

  if (fileKind.value === "photo" && previewUrl) {
    return <img src={previewUrl} alt="" />;
  }

  if (fileKind.value === "video" && previewUrl) {
    return <video src={previewUrl} muted playsInline preload="metadata" />;
  }

  return <Icon size={22} />;
};

const IncidentSummaryCard = ({ type, item, items }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedItems = Array.isArray(items) ? items : (item ? [item] : []);

  if (!selectedItems.length) {
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

  if (items) {
    const visibleItems = isExpanded ? selectedItems : selectedItems.slice(0, 3);
    const hiddenCount = selectedItems.length - visibleItems.length;

    return (
      <div className="assignment-summary-card assignment-summary-list">
        <span>{type === "drone" ? `${selectedItems.length} drone(s) linked` : `${selectedItems.length} owner(s) assigned`}</span>
        {visibleItems.map((selectedItem) => (
          <div className="assignment-summary-row" key={selectedItem.id}>
            <strong>
              {type === "drone"
                ? ([selectedItem.manufacturer, selectedItem.model].filter(Boolean).join(" ") || selectedItem.droneCode || "Drone linked")
                : selectedItem.name}
            </strong>
            <small>
              {type === "drone"
                ? [selectedItem.droneCode, formatReadableValue(selectedItem.status)].filter(Boolean).join(" | ")
                : [formatReadableValue(selectedItem.role), selectedItem.email].filter(Boolean).join(" | ")}
            </small>
          </div>
        ))}
        {hiddenCount > 0 && (
          <button className="assignment-expand-button" type="button" onClick={() => setIsExpanded(true)}>
            +{hiddenCount} more selected
          </button>
        )}
        {isExpanded && selectedItems.length > 3 && (
          <button className="assignment-expand-button" type="button" onClick={() => setIsExpanded(false)}>
            Show fewer
          </button>
        )}
      </div>
    );
  }

  const selectedItem = selectedItems[0];

  if (type === "drone") {
    return (
      <div className="assignment-summary-card">
        <span>{selectedItem.droneCode ?? selectedItem.id}</span>
        <strong>{[selectedItem.manufacturer, selectedItem.model].filter(Boolean).join(" ") || "Drone linked"}</strong>
        <small>{formatReadableValue(selectedItem.status) || "Aircraft selected"}</small>
      </div>
    );
  }

  if (type === "mission") {
    return (
      <div className="assignment-summary-card">
        <span>{selectedItem.missionCode ?? selectedItem.id}</span>
        <strong>{selectedItem.name ?? "Mission linked"}</strong>
        <small>{[selectedItem.type, formatReadableValue(selectedItem.status)].filter(Boolean).join(" | ") || "Related mission selected"}</small>
      </div>
    );
  }

  return (
    <div className="assignment-summary-card">
      <span>{formatReadableValue(selectedItem.role)}</span>
      <strong>{selectedItem.name}</strong>
      <small>{selectedItem.email ?? "Owner selected"}</small>
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
  if (!form.droneIds.length) errors.droneId = "At least one affected drone is required.";
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

const validateEvidenceFiles = (files = []) => {
  const invalidFile = files.find((file) => !allowedEvidenceMimeTypes.has(file.type));
  if (invalidFile) {
    return `${invalidFile.name} is not supported. Upload only photos, videos, PDF, Word, or text documents.`;
  }

  const oversizedFile = files.find((file) => file.size > MAX_EVIDENCE_FILE_BYTES);
  if (oversizedFile) {
    return `${oversizedFile.name} is too large. Each attachment must be 20 MB or smaller.`;
  }

  return "";
};

const toFormState = (incident, initialValues = {}) => {
  if (!incident) return {
    ...initialForm,
    ...initialValues,
    droneId: initialValues.droneId ?? initialValues.droneIds?.[0] ?? initialForm.droneId,
    droneIds: initialValues.droneIds ?? initialForm.droneIds
  };
  const location = incident.location ?? incident.place ?? "";
  return {
    incidentCode: incident.incidentCode ?? incident.id ?? "",
    title: incident.title ?? "",
    type: incident.type ?? "",
    severity: incident.severity ?? "LOW",
    droneId: incident.drone?.id ?? incident.droneId ?? "",
    droneIds: getIncidentDroneIds(incident),
    missionId: incident.mission?.id ?? incident.missionId ?? "",
    assignedToId: incident.assignedTo?.id ?? incident.assignedToId ?? "",
    source: incident.source ?? "Manual Report",
    location,
    locationPoint: toSavedLocation(location),
    details: incident.details ?? ""
  };
};

const getIncidentDroneIds = (incident) => {
  const linkIds = incident.droneLinks?.map((link) => link.drone?.id ?? link.droneId).filter(Boolean) ?? [];
  return [...new Set([incident.drone?.id ?? incident.droneId, ...linkIds].filter(Boolean))];
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

const getEvidenceFileKind = (file) => {
  if (file.type.startsWith("image/")) return { value: "photo", label: "Photo", icon: ImageIcon };
  if (file.type.startsWith("video/")) return { value: "video", label: "Video", icon: Video };
  return { value: "document", label: "Document", icon: FileText };
};

const mergeEvidenceFiles = (currentFiles, selectedFiles) => {
  const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;
  const existingKeys = new Set(currentFiles.map(fileKey));
  const nextFiles = [...currentFiles];

  selectedFiles.forEach((file) => {
    if (existingKeys.has(fileKey(file))) return;
    existingKeys.add(fileKey(file));
    nextFiles.push(file);
  });

  return nextFiles;
};

const formatFileSize = (bytes = 0) => {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export default IncidentForm;
