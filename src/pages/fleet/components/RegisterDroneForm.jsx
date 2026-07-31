import { AlertTriangle, CalendarClock, ClipboardCheck, Cpu, FileCheck2, Info, Plane, RadioTower, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import { droneOpsApi } from "../../../services/droneOpsApi";

const droneStatuses = [
  "AVAILABLE",
  "IN_MISSION",
  "MAINTENANCE",
  "GROUNDED",
  "DISCONNECTED",
  "AWAITING_APPROVAL"
];
const certificationStatuses = [
  "CERTIFIED",
  "AWAITING_APPROVAL",
  "AWAITING_RENEWAL",
  "EXPIRED",
  "GROUNDED_PENDING_INSPECTION"
];
const telemetryProviders = ["NONE", "DJI", "AUTEL", "MAVLINK"];

const initialForm = {
  model: "",
  manufacturer: "",
  serialNumber: "",
  batteryType: "",
  firmwareVersion: "",
  status: "AWAITING_APPROVAL",
  flightHours: 0,
  purchaseDate: "",
  nextInspectionDue: "",
  lastMaintenanceDate: "",
  inspectionThresholdHours: "",
  certificationStatus: "AWAITING_APPROVAL",
  certificationReference: "",
  certificationExpiry: "",
  remoteId: "",
  telemetryProvider: "NONE",
  externalDeviceId: ""
};

const RegisterDroneForm = ({ onRegistered, onCancel }) => {
  const validationToastTimerRef = useRef(null);
  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [modelCatalog, setModelCatalog] = useState([]);
  const [validationToast, setValidationToast] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const needsCertificationDetails = form.certificationStatus === "CERTIFIED";
  const manufacturerOptions = modelCatalog.map((entry) => entry.manufacturer);
  const selectedModelOptions = getModelOptions(modelCatalog, form.manufacturer);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel?.();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(validationToastTimerRef.current);
    };
  }, [onCancel]);

  useEffect(() => {
    let isMounted = true;

    droneOpsApi.drones.catalog()
      .then((catalog) => {
        if (isMounted) setModelCatalog(Array.isArray(catalog) ? catalog : []);
      })
      .catch(() => {
        if (isMounted) showRegistrationError("Drone model catalog could not be loaded. Please try again.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateField = (field, value) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _removed, ...nextErrors } = current;
      return nextErrors;
    });
    setForm((current) => {
      if (field === "manufacturer") {
        return {
          ...current,
          manufacturer: value,
          model: "",
          batteryType: ""
        };
      }

      if (field === "model") {
        const selectedModel = getModelOptions(modelCatalog, current.manufacturer).find((item) => item.model === value);
        return {
          ...current,
          model: value,
          batteryType: selectedModel?.batteryType ?? current.batteryType
        };
      }

      if (field === "certificationStatus" && value !== "CERTIFIED" && current.status === "AVAILABLE") {
        return { ...current, certificationStatus: value, status: "AWAITING_APPROVAL" };
      }

      return { ...current, [field]: value };
    });
  };

  const showRegistrationError = (message) => {
    setValidationToast({
      title: "Drone registration needs review",
      message
    });
    window.clearTimeout(validationToastTimerRef.current);
    validationToastTimerRef.current = window.setTimeout(() => setValidationToast(null), 4500);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const validationError = validateDroneRegistration(form);
      if (validationError) {
        setFieldErrors(validationError.fields ?? {});
        showRegistrationError(validationError.message);
        return;
      }

      setFieldErrors({});
      const registeredDrone = await droneOpsApi.drones.create({
        model: form.model,
        manufacturer: form.manufacturer,
        serialNumber: form.serialNumber,
        batteryType: form.batteryType,
        firmwareVersion: form.firmwareVersion,
        status: form.status,
        flightHours: Number(form.flightHours || 0),
        purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : undefined,
        lastMaintenanceDate: form.lastMaintenanceDate ? new Date(form.lastMaintenanceDate).toISOString() : undefined,
        nextMaintenanceDate: form.nextInspectionDue ? new Date(form.nextInspectionDue).toISOString() : undefined,
        inspectionThresholdHours: form.inspectionThresholdHours ? Number(form.inspectionThresholdHours) : undefined,
        certificationStatus: form.certificationStatus,
        certificationReference: form.certificationReference || undefined,
        certificationExpiry: form.certificationExpiry ? new Date(form.certificationExpiry).toISOString() : undefined,
        remoteId: form.remoteId || undefined,
        telemetryProvider: form.telemetryProvider,
        externalDeviceId: form.externalDeviceId || undefined,
        connectorConfig: undefined
      });
      setForm(initialForm);
      setIsConfirmed(false);
      onRegistered?.({
        ...registeredDrone,
        droneCode: registeredDrone.droneCode
      });
    } catch (requestError) {
      setFieldErrors({});
      showRegistrationError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel?.()}>
      {validationToast && (
        <div className="modal-toast-region" role="status" aria-live="polite">
          <div className="toast-card error">
            <AlertTriangle size={20} />
            <div>
              <strong>{validationToast.title}</strong>
              <p>{validationToast.message}</p>
            </div>
            <button className="toast-close" type="button" onClick={() => setValidationToast(null)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      <form className="modal-dialog registration-dialog" role="dialog" aria-modal="true" aria-labelledby="register-drone-title" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Fleet Registry</p>
            <h2 id="register-drone-title">Register New Drone</h2>
            <p>Capture aircraft identity, compliance, payload, assignment, and maintenance details before it joins the fleet.</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close drone registration">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-layout modal-form-layout">
            <FormSection icon={Plane} title="Aircraft Identity" variant="primary">
              <SelectField label="Manufacturer" value={form.manufacturer} onChange={(value) => updateField("manufacturer", value)} options={manufacturerOptions} required disabled={!manufacturerOptions.length} />
              <SelectField label="Model" value={form.model} onChange={(value) => updateField("model", value)} options={selectedModelOptions.map((item) => item.model)} required disabled={!form.manufacturer || !selectedModelOptions.length} />
              <Field label="Serial Number" value={form.serialNumber} onChange={(value) => updateField("serialNumber", value)} placeholder="From the aircraft body, box, or vendor record" required help="This is the manufacturer serial number. It must be unique." />
              <ReadOnlyField label="Battery Type" value={form.batteryType || "Select model first"} />
            </FormSection>

            <FormSection icon={FileCheck2} title="Readiness">
              <SelectField label="Status" value={form.status} onChange={(value) => updateField("status", value)} options={droneStatuses} help="Use Available only after certification is valid and the aircraft is ready for assignment." />
              <SelectField label="Certification Status" value={form.certificationStatus} onChange={(value) => updateField("certificationStatus", value)} options={certificationStatuses} help="Certified means the certificate has been checked and is still valid." />
              {needsCertificationDetails && (
                <>
                  <Field label="Certification Reference" value={form.certificationReference} onChange={(value) => updateField("certificationReference", value)} placeholder="Certificate or approval number" help="Official approval, registration, or compliance document reference." />
                  <Field label="Certification Expiry" type="date" value={form.certificationExpiry} onChange={(value) => updateField("certificationExpiry", value)} help="Expired certification cannot be marked Certified or Available." />
                </>
              )}
              {!needsCertificationDetails && (
                <InfoNote text="When certification is still being checked, keep the drone in Awaiting Approval, Maintenance, or Grounded." />
              )}
            </FormSection>

            <FormSection icon={Cpu} title="Operations">
              <Field label="Firmware Version" value={form.firmwareVersion} onChange={(value) => updateField("firmwareVersion", value)} placeholder="v12.4.1" />
              <Field label="Flight Hours" type="number" value={form.flightHours} onChange={(value) => updateField("flightHours", value)} placeholder="0" min="0" />
              <Field label="Remote ID" value={form.remoteId} onChange={(value) => updateField("remoteId", value)} placeholder="Optional broadcast ID" help="Only enter this if the drone or compliance record provides it." />
            </FormSection>

            <FormSection icon={CalendarClock} title="Maintenance">
              <Field label="Purchase Date" type="date" value={form.purchaseDate} onChange={(value) => updateField("purchaseDate", value)} max={todayInputValue()} error={fieldErrors.purchaseDate} />
              <Field label="Next Inspection Due" type="date" value={form.nextInspectionDue} onChange={(value) => updateField("nextInspectionDue", value)} error={fieldErrors.nextInspectionDue} />
              <Field label="Last Maintenance Date" type="date" value={form.lastMaintenanceDate} onChange={(value) => updateField("lastMaintenanceDate", value)} max={todayInputValue()} error={fieldErrors.lastMaintenanceDate} />
              <Field label="Flight-Hour Inspection Threshold" type="number" value={form.inspectionThresholdHours} onChange={(value) => updateField("inspectionThresholdHours", value)} placeholder="50" min="0" />
            </FormSection>

            <section className="form-section advanced-form-section">
              <button className="advanced-toggle" type="button" onClick={() => setShowAdvanced((current) => !current)} aria-expanded={showAdvanced}>
                <span>
                  <RadioTower size={18} />
                  <strong>Advanced Telemetry Connector</strong>
                </span>
                <small>{showAdvanced ? "Hide" : "Configure"}</small>
              </button>
              <p className="advanced-note">
                DroneOps can infer the provider from manufacturer. Use this only when a vendor API or device identity must be configured.
              </p>
              {showAdvanced && (
                <div className="form-grid advanced-grid">
                  <SelectField label="Telemetry Provider" value={form.telemetryProvider} onChange={(value) => updateField("telemetryProvider", value)} options={telemetryProviders} />
                  {form.telemetryProvider !== "NONE" && (
                    <Field
                      label={getExternalIdLabel(form.telemetryProvider)}
                      value={form.externalDeviceId}
                      onChange={(value) => updateField("externalDeviceId", value)}
                      placeholder={getExternalIdPlaceholder(form.telemetryProvider)}
                      help="This comes from the vendor portal, flight controller, or device management page."
                    />
                  )}
                  <InfoNote text="Provider and device ID connect this drone to the correct vendor telemetry source." />
                </div>
              )}
            </section>

            <div className="form-section readiness-note">
              <ClipboardCheck size={18} />
              <div>
                <strong>Before registering</strong>
                <span>Available drones must be inspected, certified, unexpired, and ready for assignment. Use Awaiting Approval when documents still need review.</span>
              </div>
            </div>
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
            <span>I confirm the drone information is correct and the aircraft is safe to add to the fleet.</span>
          </label>
          <div className="form-actions">
            <ActionButton onClick={onCancel}>Cancel</ActionButton>
            <ActionButton icon={Save} variant="primary" type="submit" disabled={isSaving || !isConfirmed}>
              {isSaving ? "Registering" : "Register Drone"}
            </ActionButton>
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
};

const FormSection = ({ icon: Icon, title, children, variant = "" }) => {
  return (
    <section className={`form-section ${variant ? `form-section-${variant}` : ""}`}>
      <div className="form-section-title">
        <Icon size={18} />
        <h3>{title}</h3>
      </div>
      <div className="form-grid">{children}</div>
    </section>
  );
};

const Field = ({ label, type = "text", placeholder = "", value, onChange, required = false, min, max, help, error }) => {
  return (
    <label className={`field ${error ? "has-error" : ""}`}>
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} required={required} min={min} max={max} />
      {error ? <small className="field-error">{error}</small> : help && <small>{help}</small>}
    </label>
  );
};

const InfoNote = ({ text }) => (
  <div className="field-note wide-field">
    <Info size={15} />
    <span>{text}</span>
  </div>
);

const SelectField = ({ label, options, value, onChange, help, required = false, disabled = false }) => {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} required={required} disabled={disabled}>
        <option value="" disabled>Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>{formatOptionLabel(option)}</option>
        ))}
      </select>
      {help && <small>{help}</small>}
    </label>
  );
};

const ReadOnlyField = ({ label, value }) => (
  <label className="field">
    <span>{label}</span>
    <input value={value ?? ""} readOnly />
  </label>
);

const getExternalIdLabel = (provider) => {
  if (provider === "MAVLINK") return "MAVLink System ID";
  return "Vendor Serial / Device ID";
};

const getExternalIdPlaceholder = (provider) => {
  if (provider === "DJI") return "DJI serial or device ID";
  if (provider === "AUTEL") return "Autel serial or device ID";
  if (provider === "MAVLINK") return "PX4/ArduPilot system ID";
  return "External drone identifier";
};

const getModelOptions = (catalog, manufacturer) => (
  catalog.find((entry) => entry.manufacturer === manufacturer)?.models ?? []
);

const formatOptionLabel = (value = "") => (
  value.toString().toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
);

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const toDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const validateDroneRegistration = (form) => {
  const today = toDateOnly(todayInputValue());
  const purchaseDate = toDateOnly(form.purchaseDate);
  const lastMaintenanceDate = toDateOnly(form.lastMaintenanceDate);
  const nextInspectionDue = toDateOnly(form.nextInspectionDue);
  const certificationExpiry = toDateOnly(form.certificationExpiry);

  if (!form.manufacturer) return validationResult("Manufacturer is required.");
  if (!form.model) return validationResult("Model is required.");
  if (!form.batteryType) return validationResult("Battery type could not be detected for this model.");
  if (purchaseDate && purchaseDate > today) return validationResult("Purchase date cannot be in the future.", { purchaseDate: "Cannot be in the future." });
  if (lastMaintenanceDate && lastMaintenanceDate > today) return validationResult("Last maintenance date cannot be in the future.", { lastMaintenanceDate: "Cannot be in the future." });
  if (purchaseDate && lastMaintenanceDate && lastMaintenanceDate < purchaseDate) {
    return validationResult("Last maintenance date cannot be before the purchase date.", {
      purchaseDate: "Check this purchase date.",
      lastMaintenanceDate: "Cannot be before purchase date."
    });
  }
  if (lastMaintenanceDate && nextInspectionDue && nextInspectionDue < lastMaintenanceDate) {
    return validationResult("Next inspection due cannot be before the last maintenance date.", {
      lastMaintenanceDate: "Check this maintenance date.",
      nextInspectionDue: "Cannot be before last maintenance."
    });
  }
  if (form.certificationStatus === "CERTIFIED" && !form.certificationReference.trim()) {
    return validationResult("Certification reference is required when certification status is Certified.");
  }
  if (form.certificationStatus === "CERTIFIED" && !certificationExpiry) {
    return validationResult("Certification expiry is required when certification status is Certified.");
  }
  if (form.certificationStatus === "CERTIFIED" && certificationExpiry < today) {
    return validationResult("Expired certification cannot be marked Certified.");
  }
  if (form.status === "AVAILABLE" && form.certificationStatus !== "CERTIFIED") {
    return validationResult("Only certified drones can be marked Available.");
  }
  if (form.status === "AVAILABLE" && certificationExpiry && certificationExpiry < today) {
    return validationResult("A drone with expired certification cannot be marked Available.");
  }
  if (form.telemetryProvider !== "NONE" && !form.externalDeviceId.trim()) {
    return validationResult("Vendor drone/device ID is required when a telemetry connector is selected.");
  }

  return null;
};

const validationResult = (message, fields = {}) => ({ message, fields });

export default RegisterDroneForm;
