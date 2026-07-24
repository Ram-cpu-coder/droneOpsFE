import { CalendarClock, CheckCircle2, MapPinned, Pencil, Play, Route, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import ProgressBar from "../../../components/common/ProgressBar";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import MissionForm from "./MissionForm";

const MissionProfileDialog = ({ mission, canManage = false, user, onUpdated, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);
  const isSystemAdministrator = ["SYSTEM_ADMINISTRATOR", "system_administrator"].includes(user?.role);
  const workflowStatus = mission.rawStatus ?? mission.status;
  const routeProgress = mission.plannedRoute?.progress;
  const waypoints = toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates);
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

  if (isEditing) {
    return (
      <MissionForm
        mission={mission}
        mode="edit"
        canEditStatus={isSystemAdministrator}
        onUpdated={onUpdated}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="mission-profile-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Mission Profile</p>
            <h2 id="mission-profile-title">{mission.id}</h2>
            <p>{mission.name}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close mission profile">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-alert">{error}</div>}
          <div className="profile-hero">
            <div className="profile-aircraft-icon">
              <Route size={42} />
            </div>
            <div>
              <h3>{mission.name}</h3>
              <p>{mission.type} mission</p>
            </div>
            <StatusBadge>{mission.status}</StatusBadge>
          </div>

          <div className="profile-metrics">
            <ProfileMetric icon={UserRound} label="Pilot" value={mission.pilot} />
            <ProfileMetric icon={MapPinned} label="Drone" value={mission.drone} />
            <ProfileMetric icon={CalendarClock} label="ETA" value={mission.eta} />
          </div>

          <div className="profile-grid">
            <ProfileSection icon={Route} title="Mission Overview">
              <ProfileRow label="Mission ID" value={mission.id} />
              <ProfileRow label="Type" value={mission.type} />
              <ProfileRow label="Status" value={getStatusLabel(workflowStatus)} />
              <ProfileRow label="Risk" value={mission.risk} />
            </ProfileSection>

            <ProfileSection icon={UserRound} title="Assignments">
              <ProfileRow label="Assigned Pilot" value={mission.pilot} />
              <ProfileRow label="Assigned Drone" value={mission.drone} />
              <ProfileRow label="Launch Site" value={mission.launchSite ?? "Not set"} />
              <ProfileRow label="Operating Area" value={mission.operatingArea ?? "Not set"} />
            </ProfileSection>

            <ProfileSection icon={CalendarClock} title="Timing">
              <ProfileRow label="Planned Start" value={formatDateTime(mission.plannedStartAt)} />
              <ProfileRow label="Planned End" value={formatDateTime(mission.plannedEndAt)} />
              <ProfileRow label="Updated" value={formatDateTime(mission.updatedAt)} />
              <ProfileRow label="Created" value={formatDateTime(mission.createdAt)} />
            </ProfileSection>
          </div>

          <section className="profile-location-card">
            <div className="profile-location-header">
              <div>
                <h3>Mission Progress</h3>
                <p>{routeProgress?.source === "TELEMETRY" ? "Calculated from live telemetry and GPS waypoints." : "Current completion and route planning notes."}</p>
              </div>
              <strong>{Number(mission.progress ?? 0)}%</strong>
            </div>
            <div className="mission-progress-panel">
              <ProgressBar value={Number(mission.progress ?? 0)} />
            </div>
            {routeProgress?.source === "TELEMETRY" && (
              <div className="mission-route-summary">
                <ProfileRow label="Waypoints reached" value={`${routeProgress.reachedWaypoints ?? 0} of ${routeProgress.totalWaypoints ?? waypoints.length}`} />
                <ProfileRow label="Route distance" value={formatDistance(routeProgress.totalDistanceMeters)} />
                <ProfileRow label="Distance from route" value={formatDistance(routeProgress.distanceToRouteMeters)} />
                <ProfileRow label="Last telemetry" value={formatDateTime(routeProgress.lastTelemetryAt)} />
              </div>
            )}
            <div className="mission-notes-panel">
              <strong>Route Notes</strong>
              <p>{mission.routeNotes ?? mission.plannedRoute?.notes ?? "No route notes captured for this mission yet."}</p>
            </div>
            {waypoints.length > 0 && (
              <div className="mission-waypoint-list">
                <strong>GPS Waypoints</strong>
                {waypoints.map((waypoint, index) => (
                  <div key={`${waypoint.label}-${index}`}>
                    <span>{waypoint.label}</span>
                    <small>{formatWaypoint(waypoint)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="profile-section">
            <div className="profile-section-title">
              <CheckCircle2 size={18} />
              <h3>Workflow Control</h3>
            </div>
            <dl>
              <div>
                <dt>Current step</dt>
                <dd>{getWorkflowDescription(workflowStatus, isSystemAdministrator)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="modal-footer profile-footer">
          {canManage && (
            <div className="form-actions">
              <ActionButton icon={Pencil} onClick={() => setIsEditing(true)}>Edit</ActionButton>
              {isSystemAdministrator && workflowStatus === "PLANNED" && (
                <ActionButton
                  icon={CheckCircle2}
                  variant="primary"
                  onClick={() => handleMissionAction("approve")}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? "Approving" : "Approve Mission"}
                </ActionButton>
              )}
              {workflowStatus === "APPROVED" && (
                <ActionButton
                  icon={Play}
                  variant="primary"
                  onClick={() => handleMissionAction("start")}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? "Starting" : "Start Mission"}
                </ActionButton>
              )}
              {workflowStatus === "ACTIVE" && (
                <ActionButton
                  icon={CheckCircle2}
                  variant="primary"
                  onClick={() => handleMissionAction("complete")}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? "Completing" : "Complete Mission"}
                </ActionButton>
              )}
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

  async function handleMissionAction(action) {
    setIsActionLoading(true);
    setError("");

    try {
      const missionId = mission.uuid ?? mission.id;
      let updatedMission;

      if (action === "approve") updatedMission = await droneOpsApi.missions.approve(missionId);
      if (action === "start") updatedMission = await droneOpsApi.missions.start(missionId);
      if (action === "complete") updatedMission = await droneOpsApi.missions.complete(missionId);

      onUpdated?.(updatedMission, action);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsActionLoading(false);
    }
  }
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

const formatDateTime = (value) => {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
};

const formatDistance = (value) => {
  const meters = Number(value);
  if (!Number.isFinite(meters)) return "Not available";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
};

const formatWaypoint = (waypoint) => {
  const latitude = Number(waypoint.latitude);
  const longitude = Number(waypoint.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "Invalid coordinates";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};

const toWaypointRows = (waypoints) => {
  if (!Array.isArray(waypoints)) return [];

  return waypoints.map((waypoint, index) => {
    if (Array.isArray(waypoint)) {
      return {
        label: `Waypoint ${index + 1}`,
        longitude: waypoint[0],
        latitude: waypoint[1]
      };
    }

    return {
      label: waypoint.label ?? waypoint.name ?? `Waypoint ${index + 1}`,
      latitude: waypoint.latitude ?? waypoint.lat,
      longitude: waypoint.longitude ?? waypoint.lng ?? waypoint.lon
    };
  });
};

const getStatusLabel = (status) => {
  if (status === "PLANNED") return "Awaiting Approval";
  return status;
};

const getWorkflowDescription = (status, isSystemAdministrator) => {
  if (status === "PLANNED") {
    return isSystemAdministrator
      ? "This mission is waiting for approval. Approve it before the team can move it forward."
      : "This mission is waiting for system administrator approval before it can be started.";
  }

  if (status === "APPROVED") {
    return "The mission is approved and ready to be started.";
  }

  if (status === "ACTIVE") {
    return "The mission is active and can be completed when operations finish.";
  }

  if (status === "COMPLETED") {
    return "The mission has been completed.";
  }

  return "This mission is currently in a locked lifecycle state.";
};

export default MissionProfileDialog;
