import { BatteryCharging, CalendarClock, Cpu, MapPin, Navigation, Pencil, Plane, RadioTower, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import BatteryMeter from "../../../components/common/BatteryMeter";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const droneStatuses = ["AVAILABLE", "IN_MISSION", "MAINTENANCE", "GROUNDED", "DISCONNECTED", "AWAITING_APPROVAL"];
const certificationStatuses = ["CERTIFIED", "AWAITING_APPROVAL", "AWAITING_RENEWAL", "EXPIRED", "GROUNDED_PENDING_INSPECTION"];
const telemetryProviders = ["NONE", "GENERIC_REST", "DJI", "AUTEL", "MAVLINK"];

const DroneProfileDialog = ({ drone, canManage = false, onUpdated, onDeleted, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => toEditableForm(drone));
  const telemetry = drone.latestTelemetry;
  const droneUuid = drone.uuid ?? drone.idRaw ?? drone.id;
  const locationState = useMemo(() => getDroneLocationState(drone), [drone]);

  useEffect(() => {
    setForm(toEditableForm(drone));
  }, [drone]);

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

  const previewDrone = useMemo(() => ({
    ...drone,
    ...form,
    id: form.droneCode || drone.id,
    flightHours: Number(form.flightHours || 0),
    purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : drone.purchaseDate
  }), [drone, form]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const updatedDrone = await droneOpsApi.drones.update(droneUuid, {
        droneCode: form.droneCode,
        model: form.model,
        manufacturer: form.manufacturer || undefined,
        serialNumber: form.serialNumber,
        batteryType: form.batteryType || undefined,
        firmwareVersion: form.firmwareVersion || undefined,
        status: form.status,
        flightHours: Number(form.flightHours || 0),
        purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : undefined,
        certificationStatus: form.certificationStatus,
        telemetryProvider: form.telemetryProvider,
        externalDeviceId: form.externalDeviceId || undefined,
        connectorConfig: form.telemetryUrl ? { telemetryUrl: form.telemetryUrl } : undefined
      });

      onUpdated?.(updatedDrone);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError("");

    try {
      await droneOpsApi.drones.remove(droneUuid);
      setShowDeleteConfirm(false);
      onDeleted?.(drone);
    } catch (requestError) {
      setError(`${requestError.message}. If this drone has mission or telemetry history, set its status to GROUNDED instead of deleting it.`);
    } finally {
      setIsDeleting(false);
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <form className="modal-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="drone-profile-title" onSubmit={handleSave}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Drone Profile</p>
            <h2 id="drone-profile-title">{previewDrone.id}</h2>
            <p>{previewDrone.model} {previewDrone.manufacturer ? `by ${previewDrone.manufacturer}` : ""}</p>
          </div>
          <div className="profile-header-actions">
            {canManage && (
              <ActionButton icon={Pencil} onClick={() => setIsEditing((current) => !current)}>
                {isEditing ? "View" : "Edit"}
              </ActionButton>
            )}
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close drone profile">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {error && <div className="auth-alert">{error}</div>}

          <div className="profile-hero">
            <div className="profile-aircraft-icon">
              <Plane size={42} />
            </div>
            <div>
              <h3>{previewDrone.id}</h3>
              <p>{previewDrone.serialNumber}</p>
            </div>
            <StatusBadge>{previewDrone.status}</StatusBadge>
          </div>

          <div className="profile-metrics">
            <ProfileMetric icon={BatteryCharging} label="Battery" value={`${drone.battery ?? 0}%`}>
              <BatteryMeter value={drone.battery ?? 0} />
            </ProfileMetric>
            <ProfileMetric icon={RadioTower} label="Signal" value={`${drone.signal ?? 0}%`} />
            <ProfileMetric icon={Plane} label="Flight Hours" value={previewDrone.flightHours} />
          </div>

          {!isEditing && (
            <ProfileLocationMap
              drone={previewDrone}
              locationState={locationState}
            />
          )}

          {isEditing ? (
            <div className="profile-edit-grid">
              <Field label="Drone ID" value={form.droneCode} onChange={(value) => updateField("droneCode", value)} required />
              <Field label="Model" value={form.model} onChange={(value) => updateField("model", value)} required />
              <Field label="Manufacturer" value={form.manufacturer} onChange={(value) => updateField("manufacturer", value)} />
              <Field label="Serial Number" value={form.serialNumber} onChange={(value) => updateField("serialNumber", value)} required />
              <Field label="Battery Type" value={form.batteryType} onChange={(value) => updateField("batteryType", value)} />
              <Field label="Firmware Version" value={form.firmwareVersion} onChange={(value) => updateField("firmwareVersion", value)} />
              <SelectField label="Status" value={form.status} onChange={(value) => updateField("status", value)} options={droneStatuses} />
              <Field label="Flight Hours" type="number" value={form.flightHours} onChange={(value) => updateField("flightHours", value)} min="0" />
              <Field label="Purchase Date" type="date" value={form.purchaseDate} onChange={(value) => updateField("purchaseDate", value)} />
              <SelectField label="Certification" value={form.certificationStatus} onChange={(value) => updateField("certificationStatus", value)} options={certificationStatuses} />
              <SelectField label="Telemetry Provider" value={form.telemetryProvider} onChange={(value) => updateField("telemetryProvider", value)} options={telemetryProviders} />
              <Field label="External Drone ID" value={form.externalDeviceId} onChange={(value) => updateField("externalDeviceId", value)} />
              <Field label="Vendor Telemetry URL" value={form.telemetryUrl} onChange={(value) => updateField("telemetryUrl", value)} />
            </div>
          ) : (
            <div className="profile-grid">
              <ProfileSection icon={Cpu} title="Aircraft Details">
                <ProfileRow label="Model" value={drone.model} />
                <ProfileRow label="Manufacturer" value={drone.manufacturer} />
                <ProfileRow label="Battery Type" value={drone.batteryType} />
                <ProfileRow label="Firmware" value={drone.firmwareVersion} />
                <ProfileRow label="Certification" value={drone.certificationStatus} />
                <ProfileRow label="Telemetry Provider" value={drone.telemetryProvider} />
                <ProfileRow label="External Drone ID" value={drone.externalDeviceId} />
                <ProfileRow label="Connector Status" value={drone.connectorStatus} />
              </ProfileSection>

              <ProfileSection icon={CalendarClock} title="Lifecycle">
                <ProfileRow label="Purchased" value={formatDate(drone.purchaseDate)} />
                <ProfileRow label="Next Service" value={drone.nextMaintenance} />
                <ProfileRow label="Created" value={formatDate(drone.createdAt)} />
                <ProfileRow label="Updated" value={formatDate(drone.updatedAt)} />
              </ProfileSection>

              <ProfileSection icon={MapPin} title="Latest Telemetry">
                <ProfileRow label="Location" value={locationState.hasLocation ? formatCoordinate(locationState.location) : "No location recorded"} />
                <ProfileRow label="Map Status" value={locationState.isOffline ? "Offline - showing last known location" : locationState.hasLocation ? "Live location" : "Waiting for telemetry"} />
                <ProfileRow label="Altitude" value={telemetry?.location?.altitude !== undefined ? `${telemetry.location.altitude} m` : "No data"} />
                <ProfileRow label="Speed" value={telemetry ? `${telemetry.velocity.speed} m/s` : "No data"} />
                <ProfileRow label="Heading" value={telemetry ? `${telemetry.velocity.heading} deg` : "No data"} />
                <ProfileRow label="Last Seen" value={locationState.timestamp ? formatDateTime(locationState.timestamp) : "No data"} />
              </ProfileSection>
            </div>
          )}
        </div>

        <div className="modal-footer profile-footer">
          {canManage && (
            <ActionButton icon={Trash2} variant="danger" onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}>
              Delete Drone
            </ActionButton>
          )}
          <div className="form-actions">
            <ActionButton onClick={onClose}>Cancel</ActionButton>
            {isEditing && (
              <ActionButton icon={Save} variant="primary" type="submit" disabled={isSaving}>
                {isSaving ? "Saving" : "Save Changes"}
              </ActionButton>
            )}
          </div>
        </div>
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isDeleting && setShowDeleteConfirm(false)}>
            <div className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-drone-title" aria-describedby="delete-drone-description">
              <div className="delete-confirm-icon">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 id="delete-drone-title">Delete {drone.id}?</h3>
                <p id="delete-drone-description">
                  This removes the drone from the fleet inventory. If it has mission or telemetry history, deleting may be blocked by the backend.
                </p>
              </div>
              <div className="delete-confirm-actions">
                <ActionButton type="button" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                  Cancel
                </ActionButton>
                <ActionButton icon={Trash2} variant="danger" type="button" onClick={handleDelete} disabled={isDeleting} isLoading={isDeleting}>
                  {isDeleting ? "Deleting" : "Delete Drone"}
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

const ProfileMetric = ({ icon: Icon, label, value, children }) => (
  <div className="profile-metric">
    <Icon size={18} />
    <span>{label}</span>
    <strong>{value}</strong>
    {children}
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

const ProfileLocationMap = ({ drone, locationState }) => {
  const mapPreviewUrl = locationState.hasLocation ? buildStaticMapPreview(locationState.location) : "";

  return (
    <section className={`profile-location-card ${locationState.isOffline ? "is-offline" : ""}`}>
      <div className="profile-location-header">
        <div>
          <h3>Drone Location</h3>
          <p>{locationState.label}</p>
        </div>
        <span className={locationState.isOffline ? "offline" : "online"}>
          {locationState.isOffline ? "Offline" : locationState.hasLocation ? "Live" : "No GPS"}
        </span>
      </div>
      <div className="profile-location-map" aria-label={`${drone.id} location map`}>
        {locationState.hasLocation && mapPreviewUrl ? (
          <>
            <img className="profile-location-image" src={mapPreviewUrl} alt={`${drone.id} map location`} />
            <div className={`profile-drone-marker centered ${locationState.isOffline ? "offline" : "live"}`}>
              <span />
              <Navigation size={24} />
            </div>
          </>
        ) : locationState.hasLocation ? (
          <div className={`profile-drone-marker static ${locationState.isOffline ? "offline" : "live"}`}>
            <span />
            <Navigation size={24} />
          </div>
        ) : (
          <div className="profile-location-empty">
            <MapPin size={24} />
            <strong>No location yet</strong>
          </div>
        )}
        {locationState.hasLocation && (
          <div className="profile-location-label">
            <strong>{drone.id}</strong>
            <span>{formatCoordinate(locationState.location)}</span>
          </div>
        )}
      </div>
      <div className="profile-location-meta">
        <span>{locationState.hasLocation ? formatCoordinate(locationState.location) : "Coordinates unavailable"}</span>
        <span>{locationState.timestamp ? `Last seen ${formatDateTime(locationState.timestamp)}` : "No timestamp"}</span>
      </div>
    </section>
  );
};

const ProfileRow = ({ label, value }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value || "Not provided"}</dd>
  </div>
);

const Field = ({ label, type = "text", value, onChange, required = false, min }) => (
  <label className="field">
    <span>{label}</span>
    <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={required} min={min} />
  </label>
);

const SelectField = ({ label, options, value, onChange }) => (
  <label className="field">
    <span>{label}</span>
    <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </label>
);

const toEditableForm = (drone) => ({
  droneCode: drone.droneCode ?? drone.id ?? "",
  model: drone.model ?? "",
  manufacturer: drone.manufacturer ?? "",
  serialNumber: drone.serialNumber ?? "",
  batteryType: drone.batteryType ?? "",
  firmwareVersion: drone.firmwareVersion ?? "",
  status: drone.status ?? "AVAILABLE",
  flightHours: drone.flightHours ?? 0,
  purchaseDate: drone.purchaseDate ? new Date(drone.purchaseDate).toISOString().slice(0, 10) : "",
  certificationStatus: drone.certificationStatus ?? "AWAITING_APPROVAL",
  telemetryProvider: drone.telemetryProvider ?? "NONE",
  externalDeviceId: drone.externalDeviceId ?? "",
  telemetryUrl: drone.connectorConfig?.telemetryUrl ?? ""
});

const getDroneLocationState = (drone) => {
  const telemetryLocation = drone.latestTelemetry?.location;
  const latestTimestamp = drone.latestTelemetry?.timestamp ?? drone.lastTelemetryAt ?? drone.updatedAt;
  const fallbackLocation = extractFallbackLocation(drone);
  const location = normalizeLocation(telemetryLocation) ?? normalizeLocation(fallbackLocation);
  const isDisconnected = ["DISCONNECTED", "GROUNDED"].includes(drone.status) || drone.connectorStatus === "OFFLINE";
  const isStale = latestTimestamp ? Date.now() - new Date(latestTimestamp).getTime() > 30000 : true;
  const isOffline = Boolean(location) && (!telemetryLocation || isDisconnected || isStale);

  return {
    hasLocation: Boolean(location),
    isOffline,
    location,
    timestamp: latestTimestamp,
    label: !location
      ? "Waiting for first GPS telemetry."
      : isOffline
        ? "Showing last known location because the drone is offline."
        : "Showing current live telemetry location."
  };
};

const extractFallbackLocation = (drone) => {
  if (drone.lastLocation) return drone.lastLocation;
  if (drone.location && typeof drone.location === "object") return drone.location;

  if (typeof drone.location === "string") {
    const [latitude, longitude] = drone.location.split(",").map((item) => Number(item.trim()));
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
  }

  if (Number.isFinite(Number(drone.latitude)) && Number.isFinite(Number(drone.longitude))) {
    return { latitude: Number(drone.latitude), longitude: Number(drone.longitude) };
  }

  return null;
};

const normalizeLocation = (location) => {
  if (!location) return null;
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng ?? location.lon);
  const altitude = Number(location.altitude ?? 0);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, altitude };
};

const buildStaticMapPreview = ({ latitude, longitude }) => {
  if (!mapboxToken) return "";
  const lng = Number(longitude).toFixed(6);
  const lat = Number(latitude).toFixed(6);
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${lng},${lat},13,0/720x360?access_token=${mapboxToken}`;
};

const formatDate = (value) => {
  if (!value) return "Not provided";
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return "Not provided";
  return new Date(value).toLocaleString();
};

const formatCoordinate = ({ latitude, longitude }) => {
  return `${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}`;
};

export default DroneProfileDialog;
