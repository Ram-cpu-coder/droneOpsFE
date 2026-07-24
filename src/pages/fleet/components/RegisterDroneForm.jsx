import { CalendarClock, ClipboardCheck, Cpu, FileCheck2, Plane, RadioTower, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
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
const batteryTypes = ["Li-ion 6S", "LiPo 4S", "LiPo 6S", "Smart battery pack", "Emergency battery pack"];
const telemetryProviders = ["NONE", "GENERIC_REST", "DJI", "AUTEL", "MAVLINK"];

const initialForm = {
  droneCode: "",
  model: "",
  manufacturer: "",
  serialNumber: "",
  batteryType: "",
  firmwareVersion: "",
  status: "AVAILABLE",
  flightHours: 0,
  purchaseDate: "",
  nextInspectionDue: "",
  lastMaintenanceDate: "",
  inspectionThresholdHours: "",
  certificationStatus: "CERTIFIED",
  certificationReference: "",
  certificationExpiry: "",
  remoteId: "",
  telemetryProvider: "NONE",
  externalDeviceId: "",
  telemetryUrl: ""
};

const RegisterDroneForm = ({ onRegistered, onCancel }) => {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

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
      const registeredDrone = await droneOpsApi.drones.create({
        droneCode: form.droneCode,
        model: form.model,
        manufacturer: form.manufacturer,
        serialNumber: form.serialNumber,
        batteryType: form.batteryType,
        firmwareVersion: form.firmwareVersion,
        status: form.status,
        flightHours: Number(form.flightHours || 0),
        purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : undefined,
        certificationStatus: form.certificationStatus,
        telemetryProvider: form.telemetryProvider,
        externalDeviceId: form.externalDeviceId || undefined,
        connectorConfig: form.telemetryUrl ? { telemetryUrl: form.telemetryUrl } : undefined
      });
      setForm(initialForm);
      setIsConfirmed(false);
      onRegistered?.({
        ...registeredDrone,
        droneCode: registeredDrone.droneCode ?? form.droneCode
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel?.()}>
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
          {error && <div className="auth-alert">{error}</div>}

          <div className="form-layout modal-form-layout">
            <FormSection icon={Plane} title="Aircraft Identity">
              <Field label="Drone ID" value={form.droneCode} onChange={(value) => updateField("droneCode", value)} placeholder="DRN-007" required />
              <Field label="Model" value={form.model} onChange={(value) => updateField("model", value)} placeholder="Matrice 350 RTK" required />
              <Field label="Manufacturer" value={form.manufacturer} onChange={(value) => updateField("manufacturer", value)} placeholder="DJI / Autel / Custom" />
              <Field label="Serial Number" value={form.serialNumber} onChange={(value) => updateField("serialNumber", value)} placeholder="SN-2026-0007" required />
            </FormSection>

            <FormSection icon={Cpu} title="Operational Metadata">
              <SelectField label="Battery Type" value={form.batteryType} onChange={(value) => updateField("batteryType", value)} options={batteryTypes} />
              <Field label="Firmware Version" value={form.firmwareVersion} onChange={(value) => updateField("firmwareVersion", value)} placeholder="v12.4.1" />
              <SelectField label="Status" value={form.status} onChange={(value) => updateField("status", value)} options={droneStatuses} />
              <Field label="Flight Hours" type="number" value={form.flightHours} onChange={(value) => updateField("flightHours", value)} placeholder="0" min="0" />
            </FormSection>

            <FormSection icon={CalendarClock} title="Lifecycle Dates">
              <Field label="Purchase Date" type="date" value={form.purchaseDate} onChange={(value) => updateField("purchaseDate", value)} />
              <Field label="Next Inspection Due" type="date" value={form.nextInspectionDue} onChange={(value) => updateField("nextInspectionDue", value)} />
              <Field label="Last Maintenance Date" type="date" value={form.lastMaintenanceDate} onChange={(value) => updateField("lastMaintenanceDate", value)} />
              <Field label="Flight-Hour Inspection Threshold" type="number" value={form.inspectionThresholdHours} onChange={(value) => updateField("inspectionThresholdHours", value)} placeholder="50" min="0" />
            </FormSection>

            <FormSection icon={FileCheck2} title="Certification">
              <SelectField label="Certification Status" value={form.certificationStatus} onChange={(value) => updateField("certificationStatus", value)} options={certificationStatuses} />
              <Field label="Certification Reference" value={form.certificationReference} onChange={(value) => updateField("certificationReference", value)} placeholder="CASA-RPA-0007" />
              <Field label="Certification Expiry" type="date" value={form.certificationExpiry} onChange={(value) => updateField("certificationExpiry", value)} />
              <Field label="Remote ID" value={form.remoteId} onChange={(value) => updateField("remoteId", value)} placeholder="RID-DRN-007" />
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
                    />
                  )}
                  {form.telemetryProvider === "GENERIC_REST" && (
                    <Field
                      label="Vendor Telemetry URL"
                      value={form.telemetryUrl}
                      onChange={(value) => updateField("telemetryUrl", value)}
                      placeholder="https://vendor.example.com/live/drone-id"
                    />
                  )}
                  <RuleItem title="How it works" text="The provider and external ID tell the backend which company connector should fetch live telemetry for this drone." />
                </div>
              )}
            </section>

            <FormSection icon={ClipboardCheck} title="Ready To Fly">
              <RuleItem title="Inspection" text="The drone has been checked before adding it to the fleet." />
              <RuleItem title="Battery" text="Battery type and firmware details are up to date." />
              <RuleItem title="Certification" text="Certification information is available for the operations team." />
              <RuleItem title="Status" text="Use AVAILABLE when this drone can be assigned to work." />
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

const FormSection = ({ icon: Icon, title, children }) => {
  return (
    <section className="form-section">
      <div className="form-section-title">
        <Icon size={18} />
        <h3>{title}</h3>
      </div>
      <div className="form-grid">{children}</div>
    </section>
  );
};

const Field = ({ label, type = "text", placeholder = "", value, onChange, required = false, min }) => {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} required={required} min={min} />
    </label>
  );
};

const SelectField = ({ label, options, value, onChange }) => {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange?.(event.target.value)}>
        <option value="" disabled>Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
};

const RuleItem = ({ title, text }) => {
  return (
    <div className="rule-item">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
};

const getExternalIdLabel = (provider) => {
  if (provider === "MAVLINK") return "MAVLink System ID";
  if (provider === "GENERIC_REST") return "Vendor Drone ID";
  return "Vendor Serial / Device ID";
};

const getExternalIdPlaceholder = (provider) => {
  if (provider === "DJI") return "DJI serial or device ID";
  if (provider === "AUTEL") return "Autel serial or device ID";
  if (provider === "MAVLINK") return "PX4/ArduPilot system ID";
  if (provider === "GENERIC_REST") return "Vendor drone identifier";
  return "External drone identifier";
};

export default RegisterDroneForm;
