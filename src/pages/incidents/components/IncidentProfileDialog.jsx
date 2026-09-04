import { Activity, AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, FileImage, FileText, MapPinned, Pencil, ShieldCheck, Trash2, UserRoundCheck, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import HeaderDockedTabs from "../../../components/common/HeaderDockedTabs";
import CopyableId from "../../../components/common/CopyableId";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import IncidentForm from "./IncidentForm";
import MissionRouteMap from "../../missions/components/MissionRouteMap";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const profileTabs = [
  { id: "overview", label: "Overview" },
  { id: "location", label: "Location" },
  { id: "narrative", label: "Narrative" },
  { id: "evidence", label: "Evidence" }
];

const IncidentProfileDialog = ({ incident, canManage = false, onUpdated, onDeleted, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const bodyRef = useRef(null);
  const selectTab = (id) => {
    setActiveTab(id);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [evidenceRecord, setEvidenceRecord] = useState(null);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const incidentLocation = useMemo(() => parseIncidentLocation(incident.place ?? incident.location), [incident.location, incident.place]);
  const displayLocation = resolvedAddress || incidentLocation?.label || incident.place || "No location recorded";
  const displayLocationReadout = <LocationReadout address={displayLocation} location={incidentLocation} />;
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

  useEffect(() => {
    const incidentId = incident.uuid ?? incident.idRaw ?? incident.id;
    let isMounted = true;

    setEvidenceRecord(null);
    setEvidenceError("");
    setIsEvidenceLoading(true);

    droneOpsApi.incidents.evidence(incidentId)
      .then((record) => {
        if (isMounted) setEvidenceRecord(record);
      })
      .catch((requestError) => {
        if (isMounted) setEvidenceError(requestError.message);
      })
      .finally(() => {
        if (isMounted) setIsEvidenceLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [incident.id, incident.idRaw, incident.uuid]);

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
      <div className="modal-dialog profile-dialog incident-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="incident-profile-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Incident Profile</p>
            <h2 id="incident-profile-title">{incident.id}</h2>
            <p>{incident.title}</p>
            <ProfileIdentity id={incident.uuid ?? incident.idRaw} />
          </div>
          <div className="profile-header-actions">
            <div className="profile-header-buttons">
              {canManage && (
                <ActionButton icon={Pencil} onClick={() => setIsEditing(true)}>Edit</ActionButton>
              )}
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close incident profile">
                <X size={18} />
              </button>
            </div>
            <StatusBadge>{incident.status}</StatusBadge>
          </div>
        </div>

        <div className="modal-body" ref={bodyRef}>
          <HeaderDockedTabs>
          <div className="mission-profile-tabs incident-profile-tabs" role="tablist" aria-label="Incident profile sections">
            {profileTabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`incident-tab-${tab.id}`}
                aria-controls={`incident-panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => {
                  const nextIndex = event.key === "ArrowRight" ? (index + 1) % profileTabs.length
                    : event.key === "ArrowLeft" ? (index + profileTabs.length - 1) % profileTabs.length
                      : event.key === "Home" ? 0 : event.key === "End" ? profileTabs.length - 1 : null;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  selectTab(profileTabs[nextIndex].id);
                  event.currentTarget.parentElement.children[nextIndex].focus();
                }}
              >
                <strong>{tab.label}</strong>
              </button>
            ))}
          </div>
          </HeaderDockedTabs>
          {error && <div className="auth-alert">{error}</div>}

          {activeTab === "overview" && (
          <div role="tabpanel" id="incident-panel-overview" aria-labelledby="incident-tab-overview" tabIndex={0}>
          <div className="profile-metrics">
            <ProfileMetric icon={ShieldCheck} label="Status" value={incident.status} />
            <ProfileMetric icon={UserRoundCheck} label="Owner" value={incident.owner} />
            <ProfileMetric icon={MapPinned} label="Location" value={displayLocationReadout} />
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
              <ProfileRow label="Location" value={displayLocationReadout} />
              <ProfileRow label="Tracking" value={incident.status} />
            </ProfileSection>
          </div>

          </div>
          )}
          {activeTab === "location" && (
          <div role="tabpanel" id="incident-panel-location" aria-labelledby="incident-tab-location" tabIndex={0}>
          <IncidentLocationMap incident={incident} location={incidentLocation} address={displayLocation} fallback={incident.place} />
          </div>
          )}

          {activeTab === "narrative" && (
          <div role="tabpanel" id="incident-panel-narrative" aria-labelledby="incident-tab-narrative" tabIndex={0}>
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
          )}

          {activeTab === "evidence" && (
          <div role="tabpanel" id="incident-panel-evidence" aria-labelledby="incident-tab-evidence" tabIndex={0}>
          <IncidentEvidenceCapture incident={incident} evidenceRecord={evidenceRecord} isLoading={isEvidenceLoading} error={evidenceError} />
          </div>
          )}
        </div>

        <div className="modal-footer profile-footer">
          {canManage && (
            <div className="form-actions">
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

const ProfileIdentity = ({ id }) => (
  <div className="profile-identity-list" aria-label="Record identity">
    <span><strong>ID</strong><CopyableId value={id} /></span>
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

const IncidentEvidenceCapture = ({ incident, evidenceRecord, isLoading = false, error = "" }) => {
  const [showAllDocuments, setShowAllDocuments] = useState(false);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState(null);
  const blackBox = evidenceRecord?.blackBox ?? incident.evidence?.blackBox ?? null;
  const replay = Array.isArray(blackBox?.replay) ? blackBox.replay : [];
  const documents = Array.isArray(evidenceRecord?.documents)
    ? evidenceRecord.documents
    : Array.isArray(incident.evidenceDocuments)
      ? incident.evidenceDocuments
      : [];
  const latestPoints = replay.slice(-6).reverse();
  const documentPreviewLimit = 6;
  const visibleDocuments = showAllDocuments ? documents : documents.slice(0, documentPreviewLimit);
  const hiddenDocumentCount = Math.max(documents.length - documentPreviewLimit, 0);

  return (
    <section className="profile-location-card incident-evidence-card">
      <div className="profile-location-header">
        <div>
          <h3>Incident Evidence Capture</h3>
          <p>System telemetry black box and user-provided photo/video evidence for this incident.</p>
        </div>
        <StatusBadge>{isLoading ? "Loading" : replay.length ? `${replay.length} telemetry pts` : "No replay"}</StatusBadge>
      </div>

      {error && <div className="incident-evidence-empty error">Evidence could not be loaded. {error}</div>}

      <div className="incident-evidence-overview">
        <EvidenceMetric icon={Activity} label="Telemetry Window" value={blackBox ? formatEvidenceWindow(blackBox.windowSeconds) : "Not captured"} />
        <EvidenceMetric icon={MapPinned} label="Last Position" value={formatEvidencePoint(blackBox?.summary?.lastLocation)} />
        <EvidenceMetric icon={ShieldCheck} label="Last Status" value={blackBox?.summary?.status ?? "Not available"} />
        <EvidenceMetric icon={FileImage} label="Attachments" value={isLoading ? "Loading..." : `${documents.length} file${documents.length === 1 ? "" : "s"}`} />
      </div>

      {blackBox?.summary?.message && <div className="incident-evidence-empty">{blackBox.summary.message}</div>}

      {latestPoints.length > 0 && (
        <div className="incident-telemetry-replay">
          <div className="incident-telemetry-replay-header">
            <strong>Black box replay</strong>
            <span>{formatDateTime(blackBox.from)} - {formatDateTime(blackBox.to)}</span>
          </div>
          <div className="incident-telemetry-track">
            {latestPoints.map((point, index) => (
              <div className="incident-telemetry-point" key={point.id ?? `${point.timestamp}-${index}`}>
                <span>{formatDateTime(point.timestamp)}</span>
                <strong>{point.droneCode ?? "Drone"} | {point.status ?? "Telemetry"}</strong>
                <small>
                  {formatEvidencePoint(point.location)} | Alt {formatNumber(point.location?.altitude)} m | Speed {formatNumber(point.velocity?.speed)} m/s | Battery {point.battery?.level ?? "--"}%
                </small>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="incident-evidence-empty">Loading uploaded evidence...</div>
      ) : documents.length > 0 ? (
        <div className="incident-evidence-documents">
          <div className="incident-evidence-selection-header">
            <div>
              <strong>{documents.length} attachment{documents.length === 1 ? "" : "s"} stored</strong>
              <span>User-uploaded evidence linked to {incident.id}</span>
            </div>
            {hiddenDocumentCount > 0 && (
              <button className="incident-evidence-toggle" type="button" onClick={() => setShowAllDocuments((current) => !current)}>
                {showAllDocuments ? "Show less" : `See ${hiddenDocumentCount} more`}
              </button>
            )}
          </div>
          <div className="incident-media-grid">
            {visibleDocuments.map((document) => (
              <EvidenceDocumentCard
                document={document}
                key={document.id}
                onOpen={() => setActiveDocumentIndex(documents.findIndex((item) => item.id === document.id))}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="incident-evidence-empty">No uploaded evidence has been attached to this incident yet.</div>
      )}
      {activeDocumentIndex !== null && documents[activeDocumentIndex] && (
        <EvidenceViewer
          documents={documents}
          activeIndex={activeDocumentIndex}
          onChange={setActiveDocumentIndex}
          onClose={() => setActiveDocumentIndex(null)}
        />
      )}
    </section>
  );
};

const EvidenceDocumentCard = ({ document, onOpen }) => {
  const evidenceType = getDocumentEvidenceType(document);
  const Icon = evidenceType === "video" ? Video : evidenceType === "photo" ? FileImage : FileText;
  const fileUrl = document.fileUrl ?? document.url ?? "";
  const filename = getEvidenceFilename(document);

  return (
    <button className={`incident-media-card ${evidenceType}`} type="button" onClick={onOpen} title={filename}>
      <div className="incident-media-preview" aria-hidden="true">
        {evidenceType === "photo" && fileUrl ? (
          <img src={fileUrl} alt="" />
        ) : evidenceType === "video" && fileUrl ? (
          <video src={fileUrl} muted playsInline preload="metadata" />
        ) : (
          <Icon size={22} />
        )}
      </div>
      <div className="incident-media-copy">
        <span>{formatReadableEvidenceType(evidenceType)}</span>
        <strong>{filename}</strong>
        <small>{formatDateTime(document.createdAt)}</small>
      </div>
      <ExternalLink size={16} className="incident-media-open-icon" />
    </button>
  );
};

const EvidenceViewer = ({ documents, activeIndex, onChange, onClose }) => {
  const activeDocument = documents[activeIndex];
  const evidenceType = getDocumentEvidenceType(activeDocument);
  const fileUrl = activeDocument.fileUrl ?? activeDocument.url ?? "";
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < documents.length - 1;

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && canGoPrevious) onChange(activeIndex - 1);
      if (event.key === "ArrowRight" && canGoNext) onChange(activeIndex + 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, canGoNext, canGoPrevious, onChange, onClose]);

  const viewer = (
    <div className="evidence-viewer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="evidence-viewer-dialog" role="dialog" aria-modal="true" aria-label="Incident evidence viewer">
        <div className="evidence-viewer-header">
          <div>
            <span>{activeIndex + 1} of {documents.length}</span>
            <h3>{getEvidenceFilename(activeDocument)}</h3>
            <p>{formatReadableEvidenceType(evidenceType)} | {formatDateTime(activeDocument.createdAt)}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close evidence viewer">
            <X size={18} />
          </button>
        </div>

        <div className={`evidence-viewer-stage ${evidenceType}`}>
          {evidenceType === "photo" && fileUrl && <img src={fileUrl} alt={getEvidenceFilename(activeDocument)} />}
          {evidenceType === "video" && fileUrl && <video src={fileUrl} controls playsInline />}
          {evidenceType === "document" && canPreviewDocument(activeDocument) && fileUrl && <iframe src={fileUrl} title={getEvidenceFilename(activeDocument)} />}
          {evidenceType === "document" && !canPreviewDocument(activeDocument) && (
            <div className="evidence-viewer-fallback">
              <FileText size={42} />
              <strong>Preview not available inside the browser</strong>
              <span>Word documents cannot be rendered natively by the browser. Download the original file to open it in Word.</span>
              {fileUrl && (
                <button type="button" onClick={() => downloadEvidenceFile(activeDocument)}>
                  Download original file
                </button>
              )}
            </div>
          )}
        </div>

        <div className="evidence-viewer-footer">
          <button type="button" onClick={() => onChange(activeIndex - 1)} disabled={!canGoPrevious}>
            <ChevronLeft size={17} />
            Previous
          </button>
          <span>{activeIndex + 1} / {documents.length}</span>
          <button type="button" onClick={() => onChange(activeIndex + 1)} disabled={!canGoNext}>
            Next
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
};

const EvidenceMetric = ({ icon: Icon, label, value }) => (
  <div className="incident-evidence-metric">
    <Icon size={17} />
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const LocationReadout = ({ address, location }) => {
  const coordinates = formatIncidentCoordinates(location);

  return (
    <span className="location-readout">
      <span>{address || "No location recorded"}</span>
      {coordinates && <small>{coordinates}</small>}
    </span>
  );
};

const formatDateTime = (value, fallback) => {
  if (value) return new Date(value).toLocaleString();
  return fallback || "Not provided";
};

const IncidentLocationMap = ({ incident, location, address, fallback }) => {
  const missionRoute = getIncidentMissionRoute(incident);

  return (
    <section className="profile-location-card incident-profile-map-card">
      <div className="profile-location-header">
        <div>
          <h3>Incident Location</h3>
          <p>{location ? <LocationReadout address={address} location={location} /> : fallback || "No map location recorded."}</p>
        </div>
        <span className={location ? "online" : "offline"}>{location ? "Mapped" : "No GPS"}</span>
      </div>
      {missionRoute.hasRoute || location ? (
        <div className="incident-profile-route-map">
          <MissionRouteMap
            context={{ incident: incident.id, title: incident.title, status: incident.status, severity: incident.severity, owner: incident.owner, narrative: incident.details }}
            waypoints={missionRoute.waypoints}
            launchSite={missionRoute.launchSite}
            operatingArea={missionRoute.operatingArea}
            authorityAnalysis={missionRoute.authorityAnalysis}
            incidentLocation={location ? { ...location, label: "Incident Location" } : null}
          />
        </div>
      ) : (
        <div className="incident-profile-map-empty">
          <MapPinned size={24} />
          <strong>Map unavailable</strong>
          <span>{fallback || "This incident does not have saved coordinates."}</span>
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

const formatIncidentCoordinates = (location) => {
  if (!location) return "";
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};

const formatEvidenceWindow = (seconds = 0) => {
  if (!seconds) return "Not captured";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min before incident`;
};

const formatEvidencePoint = (location) => {
  if (!location) return "Not available";
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "Not available";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};

const getIncidentMissionRoute = (incident) => {
  const route = incident?.mission?.plannedRoute ?? incident?.plannedRoute ?? {};
  const waypoints = Array.isArray(route.waypoints)
    ? route.waypoints
    : Array.isArray(route.coordinates)
      ? route.coordinates.map(([longitude, latitude], index) => ({ label: `Waypoint ${index + 1}`, longitude, latitude }))
      : [];

  return {
    hasRoute: waypoints.filter(hasCoordinates).length >= 2,
    waypoints,
    launchSite: route.launchSite,
    operatingArea: route.operatingArea,
    authorityAnalysis: route.routeAnalysis?.authorityAnalysis ?? incident?.mission?.geofenceConfig?.authorityAnalysis ?? null
  };
};

const hasCoordinates = (point) => {
  if (!point) return false;
  return Number.isFinite(Number(point.latitude ?? point.lat)) && Number.isFinite(Number(point.longitude ?? point.lng ?? point.lon));
};

const formatNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(number >= 10 ? 0 : 1) : "--";
};

const getDocumentEvidenceType = (document) => {
  const metadataType = document.metadata?.evidenceType?.toString().toLowerCase();
  if (["photo", "video", "document"].includes(metadataType)) return metadataType;

  const mimeType = getEvidenceMimeType(document);
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
};

const canPreviewDocument = (document) => {
  const mimeType = getEvidenceMimeType(document);
  const title = getEvidenceFilename(document).toLowerCase();

  return mimeType === "application/pdf" || mimeType === "text/plain" || title.endsWith(".pdf") || title.endsWith(".txt");
};

const getEvidenceMimeType = (document) => (
  document.mimeType?.toString().toLowerCase() ?? document.metadata?.mimeType?.toString().toLowerCase() ?? ""
);

const getEvidenceFilename = (document) => (
  document.metadata?.originalName || document.title || "incident-evidence"
);

const downloadEvidenceFile = async (document) => {
  const fileUrl = document.fileUrl ?? document.url ?? "";
  if (!fileUrl) return;

  const filename = getEvidenceFilename(document);

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerEvidenceDownload(objectUrl, filename);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    triggerEvidenceDownload(fileUrl, filename);
  }
};

const triggerEvidenceDownload = (url, filename) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const formatReadableEvidenceType = (value = "document") => (
  value.toString().toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
);

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
