import { AlertTriangle, MapPinned, Pencil, ShieldCheck, Trash2, UserRoundCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import ActionButton from "../../../components/common/ActionButton";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import IncidentForm from "./IncidentForm";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

const IncidentProfileDialog = ({ incident, canManage = false, onUpdated, onDeleted, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const incidentLocation = useMemo(() => parseIncidentLocation(incident.place ?? incident.location), [incident.location, incident.place]);
  const displayLocation = resolvedAddress || incidentLocation?.label || incident.place || "No location recorded";
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

  useEffect(() => {
    setResolvedAddress("");
    if (!incidentLocation || !mapboxToken || incidentLocation.label !== "Selected location") return;
    let isMounted = true;

    reverseGeocodeIncidentLocation(incidentLocation.latitude, incidentLocation.longitude).then((address) => {
      if (isMounted) setResolvedAddress(address);
    });

    return () => {
      isMounted = false;
    };
  }, [incidentLocation]);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError("");

    try {
      await droneOpsApi.incidents.remove(incident.uuid ?? incident.idRaw ?? incident.id);
      setShowDeleteConfirm(false);
      onDeleted?.(incident);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <IncidentForm
        incident={incident}
        mode="edit"
        onUpdated={onUpdated}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="incident-profile-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Incident Profile</p>
            <h2 id="incident-profile-title">{incident.id}</h2>
            <p>{incident.title}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close incident profile">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-alert">{error}</div>}
          <div className="profile-hero">
            <div className="profile-aircraft-icon">
              <AlertTriangle size={42} />
            </div>
            <div>
              <h3>{incident.title}</h3>
              <p>{incident.typeLabel ?? incident.type ?? "Operational incident"}</p>
            </div>
            <StatusBadge type="risk">{incident.severity}</StatusBadge>
          </div>

          <div className="profile-metrics">
            <ProfileMetric icon={ShieldCheck} label="Status" value={incident.status} />
            <ProfileMetric icon={UserRoundCheck} label="Owner" value={incident.owner} />
            <ProfileMetric icon={MapPinned} label="Location" value={displayLocation} />
          </div>

          <div className="profile-grid">
            <ProfileSection icon={AlertTriangle} title="Incident Summary">
              <ProfileRow label="Incident ID" value={incident.id} />
              <ProfileRow label="Type" value={incident.typeLabel ?? incident.type} />
              <ProfileRow label="Severity" value={incident.severity} />
              <ProfileRow label="Status" value={incident.status} />
            </ProfileSection>

            <ProfileSection icon={UserRoundCheck} title="Ownership">
              <ProfileRow label="Assigned Owner" value={incident.owner} />
              <ProfileRow label="Drone" value={incident.droneLabel ?? "Not linked"} />
              <ProfileRow label="Mission" value={incident.missionLabel ?? "Not linked"} />
              <ProfileRow label="Source" value={incident.source ?? "Manual Report"} />
            </ProfileSection>

            <ProfileSection icon={MapPinned} title="Timeline">
              <ProfileRow label="Reported" value={formatDateTime(incident.createdAt, incident.time)} />
              <ProfileRow label="Updated" value={formatDateTime(incident.updatedAt)} />
              <ProfileRow label="Location" value={displayLocation} />
              <ProfileRow label="Tracking" value={incident.status} />
            </ProfileSection>
          </div>

          <IncidentLocationMap location={incidentLocation} address={displayLocation} fallback={incident.place} />

          <section className="profile-location-card">
            <div className="profile-location-header">
              <div>
                <h3>Incident Narrative</h3>
                <p>Operational summary, context, and follow-up notes.</p>
              </div>
              <StatusBadge>{incident.status}</StatusBadge>
            </div>
            <div className="dialog-rich-text">
              <p>{incident.details}</p>
            </div>
          </section>
        </div>

        <div className="modal-footer profile-footer">
          {canManage && (
            <div className="form-actions">
              <ActionButton icon={Pencil} onClick={() => setIsEditing(true)}>Edit</ActionButton>
              <ActionButton icon={Trash2} variant="danger" onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}>Delete</ActionButton>
            </div>
          )}
          <div className="form-actions">
            <ActionButton onClick={onClose}>Close</ActionButton>
          </div>
        </div>
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isDeleting && setShowDeleteConfirm(false)}>
            <div className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-incident-title" aria-describedby="delete-incident-description">
              <div className="delete-confirm-icon">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 id="delete-incident-title">Delete {incident.id}?</h3>
                <p id="delete-incident-description">
                  This removes the incident from the register and audit history will keep the deletion record.
                </p>
              </div>
              <div className="delete-confirm-actions">
                <ActionButton type="button" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                  Cancel
                </ActionButton>
                <ActionButton icon={Trash2} variant="danger" type="button" onClick={handleDelete} disabled={isDeleting} isLoading={isDeleting}>
                  {isDeleting ? "Deleting" : "Delete Incident"}
                </ActionButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
};

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

const formatDateTime = (value, fallback) => {
  if (value) return new Date(value).toLocaleString();
  return fallback || "Not provided";
};

const IncidentLocationMap = ({ location, address, fallback }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!mapboxToken || !location || mapRef.current || !mapContainerRef.current) return;
    let isMounted = true;

    const setupMap = async () => {
      try {
        const mapboxModule = await import("mapbox-gl");
        if (!isMounted) return;

        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = mapboxToken;
        mapRef.current = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/navigation-night-v1",
          center: [location.longitude, location.latitude],
          zoom: 14,
          pitch: 18
        });
        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current.on("load", () => {
          if (!isMounted) return;
          setMapReady(true);

          const markerElement = document.createElement("div");
          markerElement.className = "incident-profile-map-marker";
          markerElement.innerHTML = "<span>!</span>";
          markerRef.current = new mapboxgl.Marker({ element: markerElement })
            .setLngLat([location.longitude, location.latitude])
            .addTo(mapRef.current);
        });
      } catch (setupError) {
        if (isMounted) setMapError(setupError.message);
      }
    };

    setupMap();

    return () => {
      isMounted = false;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [location]);

  return (
    <section className="profile-location-card incident-profile-map-card">
      <div className="profile-location-header">
        <div>
          <h3>Incident Location</h3>
          <p>{location ? address : fallback || "No map location recorded."}</p>
        </div>
        <span className={location ? "online" : "offline"}>{location ? "Mapped" : "No GPS"}</span>
      </div>
      {mapboxToken && location ? (
        <div className="incident-profile-map" ref={mapContainerRef}>
          {!mapReady && !mapError && <div className="mission-profile-map-status">Loading incident map...</div>}
          {mapError && <div className="mission-profile-map-status error">{mapError}</div>}
        </div>
      ) : (
        <div className="incident-profile-map-empty">
          <MapPinned size={24} />
          <strong>Map unavailable</strong>
          <span>{location ? "Mapbox token is not configured." : "This incident does not have saved coordinates."}</span>
        </div>
      )}
      {location && (
        <div className="profile-location-meta">
          <span>Coordinates: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span>
        </div>
      )}
    </section>
  );
};

const parseIncidentLocation = (value) => {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
  if (!match) return null;

  return {
    label: normalizeIncidentAddress(value.replace(/\s*\(.+\)\s*$/, "")),
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
};

const normalizeIncidentAddress = (label) => {
  const trimmedLabel = label?.trim();
  if (!trimmedLabel || trimmedLabel.toLowerCase() === "incident location") return "Selected location";
  return trimmedLabel;
};

const reverseGeocodeIncidentLocation = async (latitude, longitude) => {
  try {
    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?limit=1&access_token=${mapboxToken}`);
    const result = await response.json().catch(() => ({}));
    return result.features?.[0]?.place_name ?? "Selected location";
  } catch {
    return "Selected location";
  }
};

export default IncidentProfileDialog;
