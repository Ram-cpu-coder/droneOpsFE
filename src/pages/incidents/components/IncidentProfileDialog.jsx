import { AlertTriangle, MapPinned, Pencil, ShieldCheck, Trash2, UserRoundCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import IncidentForm from "./IncidentForm";

const IncidentProfileDialog = ({ incident, canManage = false, onUpdated, onDeleted, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete ${incident.id} from the incident register?`);
    if (!confirmed) return;

    try {
      await droneOpsApi.incidents.remove(incident.uuid ?? incident.idRaw ?? incident.id);
      onDeleted?.(incident);
    } catch (requestError) {
      setError(requestError.message);
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
            <ProfileMetric icon={MapPinned} label="Location" value={incident.place} />
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
              <ProfileRow label="Location" value={incident.place} />
              <ProfileRow label="Tracking" value={incident.status} />
            </ProfileSection>
          </div>

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
              <ActionButton icon={Trash2} variant="danger" onClick={handleDelete}>Delete</ActionButton>
            </div>
          )}
          <div className="form-actions">
            <ActionButton onClick={onClose}>Close</ActionButton>
          </div>
        </div>
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

export default IncidentProfileDialog;
