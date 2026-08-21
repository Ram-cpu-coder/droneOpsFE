import { AlertTriangle, CalendarClock, CheckCircle2, MapPinned, Pencil, Play, Route, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import CopyableId from "../../../components/common/CopyableId";
import ProgressBar from "../../../components/common/ProgressBar";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import MissionForm from "./MissionForm";
import MissionRouteMap from "./MissionRouteMap";

const MissionProfileDialog = ({ mission, canManage = false, user, onUpdated, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [riskForm, setRiskForm] = useState(() => createRiskForm(mission.riskAssessment));
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isRiskSaving, setIsRiskSaving] = useState(false);
  const isSystemAdministrator = ["SYSTEM_ADMINISTRATOR", "system_administrator"].includes(user?.role);
  const canCompleteRisk = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("risk:complete") || user?.permissions?.includes("risk:manage"));
  const workflowStatus = mission.rawStatus ?? mission.status;
  const hasRiskAssessment = Boolean(mission.riskAssessment);
  const routeProgress = mission.plannedRoute?.progress;
  const waypoints = toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates);
  const launchLocation = mission.plannedRoute?.launchSite ?? toSavedLocation(mission.launchSite);
  const operatingLocation = mission.plannedRoute?.operatingArea ?? toSavedLocation(mission.operatingArea);
  const routeEndpoints = getRouteEndpoints(waypoints);
  const routeSummary = getRouteSummary(waypoints);
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

  useEffect(() => {
    setRiskForm(createRiskForm(mission.riskAssessment));
  }, [mission.riskAssessment]);

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
            <h2 id="mission-profile-title">{mission.serialNumber ?? mission.id}</h2>
            <p>{mission.name}</p>
            <ProfileIdentity id={mission.uuid ?? mission.systemId} />
          </div>
          <div className="profile-header-actions">
            <div className="profile-header-buttons">
              {canManage && (
                <ActionButton icon={Pencil} onClick={() => setIsEditing(true)}>Edit</ActionButton>
              )}
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close mission profile">
                <X size={18} />
              </button>
            </div>
            <StatusBadge>{mission.status}</StatusBadge>
          </div>
        </div>

        <div className="modal-body">
          {error && <div className="auth-alert">{error}</div>}

          <div className="profile-metrics">
            <ProfileMetric icon={UserRound} label="Pilot" value={mission.pilot} />
            <ProfileMetric icon={MapPinned} label="Drone" value={mission.drone} />
            <ProfileMetric icon={CalendarClock} label="Mission Planned On" value={formatMissionPlannedOn(mission.plannedStartAt)} />
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
              <ProfileRow label="Launch Site" value={formatLocationReadout(launchLocation, mission.launchSite)} />
              <ProfileRow label="Operating Area" value={formatLocationReadout(operatingLocation, mission.operatingArea)} />
              <ProfileRow label="Start Point" value={routeEndpoints.start} />
              <ProfileRow label="End Point" value={routeEndpoints.end} />
            </ProfileSection>

            <ProfileSection icon={CalendarClock} title="Timing">
              <ProfileRow label="Mission Planned On" value={formatDateTime(mission.plannedStartAt)} />
              <ProfileRow label="Mission Deadline" value={formatDateTime(mission.plannedEndAt)} />
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
            <MissionRouteMap waypoints={waypoints} launchSite={launchLocation} operatingArea={operatingLocation} />
            <div className="mission-route-compact-summary">
              <span>{routeSummary}</span>
            </div>
            <div className="mission-route-summary">
              <ProfileRow label="Launch Site" value={formatLocationReadout(launchLocation, mission.launchSite)} />
              <ProfileRow label="Operating Area" value={formatLocationReadout(operatingLocation, mission.operatingArea)} />
              <ProfileRow label="Route Start" value={routeEndpoints.start} />
              <ProfileRow label="Route End" value={routeEndpoints.end} />
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
          </section>

          <section className="profile-section mission-readiness-section">
            <div className="profile-section-title">
              <ShieldCheck size={18} />
              <h3>Pre-flight Risk Assessment</h3>
            </div>
            <div className="risk-assessment-panel">
              <div className="risk-assessment-status">
                <StatusBadge type="risk">{mission.riskAssessment?.level ?? "Required"}</StatusBadge>
                <p>{hasRiskAssessment ? "Assessment completed. Mission can move to start checks." : "Complete this assessment before starting the mission."}</p>
              </div>

              {hasRiskAssessment && (
                <div className="risk-assessment-readout">
                  <RiskReadout title="Hazards" items={mission.riskAssessment.hazards} primaryKey="category" secondaryKey="risk" />
                  <RiskReadout title="Mitigations" items={mission.riskAssessment.mitigations} primaryKey="hazard" secondaryKey="action" />
                </div>
              )}

              {canCompleteRisk && ["APPROVED", "RISK_ASSESSMENT_COMPLETED"].includes(workflowStatus) && (
                <form className="risk-assessment-form" onSubmit={handleRiskAssessmentSubmit}>
                  <label className="field">
                    <span>Risk Level</span>
                    <select value={riskForm.level} onChange={(event) => updateRiskField("level", event.target.value)} required>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Hazards</span>
                    <textarea value={riskForm.hazardsText} onChange={(event) => updateRiskField("hazardsText", event.target.value)} rows={3} placeholder="Weather: wind gusts&#10;Airspace: nearby restricted zone" required />
                  </label>
                  <label className="field">
                    <span>Mitigations</span>
                    <textarea value={riskForm.mitigationsText} onChange={(event) => updateRiskField("mitigationsText", event.target.value)} rows={3} placeholder="Weather: delay launch if gusts exceed threshold&#10;Airspace: maintain approved geofence" required />
                  </label>
                  <ActionButton icon={ShieldCheck} variant="primary" type="submit" disabled={isRiskSaving}>
                    {isRiskSaving ? "Saving Assessment" : hasRiskAssessment ? "Update Assessment" : "Complete Assessment"}
                  </ActionButton>
                </form>
              )}

              {!canCompleteRisk && !hasRiskAssessment && (
                <div className="risk-assessment-note">
                  <AlertTriangle size={16} />
                  <span>A remote pilot, safety officer, or system administrator must complete this before start.</span>
                </div>
              )}
            </div>
          </section>

          <section className="profile-section mission-readiness-section">
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
              {workflowStatus === "RISK_ASSESSMENT_COMPLETED" && (
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

  async function handleRiskAssessmentSubmit(event) {
    event.preventDefault();
    setIsRiskSaving(true);
    setError("");

    try {
      const missionId = mission.uuid ?? mission.id;
      const assessment = await droneOpsApi.missions.saveRiskAssessment(missionId, {
        level: riskForm.level,
        hazards: parseRiskLines(riskForm.hazardsText, "category", "risk"),
        mitigations: parseRiskLines(riskForm.mitigationsText, "hazard", "action")
      });

      onUpdated?.({ ...mission, status: "RISK_ASSESSMENT_COMPLETED", rawStatus: "RISK_ASSESSMENT_COMPLETED", riskAssessment: assessment }, "riskAssessment");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsRiskSaving(false);
    }
  }

  function updateRiskField(field, value) {
    setRiskForm((current) => ({ ...current, [field]: value }));
  }
};

const ProfileMetric = ({ icon: Icon, label, value }) => (
  <div className="profile-metric">
    <Icon size={18} />
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ProfileIdentity = ({ id }) => (
  <div className="profile-identity-list" aria-label="Record identity">
    <span><strong>ID</strong><CopyableId value={id} /></span>
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

const RiskReadout = ({ title, items = [], primaryKey, secondaryKey }) => (
  <div>
    <strong>{title}</strong>
    {Array.isArray(items) && items.length > 0 ? (
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>
            <span>{item?.[primaryKey] ?? "Item"}</span>
            <small>{item?.[secondaryKey] ?? "Not provided"}</small>
          </li>
        ))}
      </ul>
    ) : (
      <p>No {title.toLowerCase()} recorded.</p>
    )}
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

const hasWaypointCoordinates = (waypoint) => {
  if (!waypoint) return false;
  const latitude = Number(waypoint.latitude);
  const longitude = Number(waypoint.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
};

const formatLocationReadout = (location, fallback) => {
  if (location && hasWaypointCoordinates(location)) {
    const label = location.label || "Selected location";
    const radius = Number(location.radiusMeters);
    const radiusText = Number.isFinite(radius) ? ` | Radius ${formatRadius(radius)}` : "";
    return (
      <span className="location-readout">
        <span>{label}</span>
        <small>{Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}{radiusText}</small>
      </span>
    );
  }

  return fallback ?? "Not selected";
};

const formatMissionPlannedOn = (value) => {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatRadius = (radiusMeters) => (
  radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(1)} km` : `${Math.round(radiusMeters)} m`
);

const getWaypointDisplayLabel = (waypoint, index, total) => {
  if (index === 0) return "Start Point";
  if (index === total - 1) return "End Point";
  return waypoint.label ?? `Stop ${index}`;
};

const getRouteEndpoints = (waypoints) => {
  const start = waypoints[0];
  const end = waypoints[waypoints.length - 1];

  return {
    start: start && hasWaypointCoordinates(start) ? formatWaypointReadout(start, 0, waypoints.length) : "Not selected",
    end: end && hasWaypointCoordinates(end) ? formatWaypointReadout(end, waypoints.length - 1, waypoints.length) : "Not selected"
  };
};

const formatWaypointReadout = (waypoint, index, total) => (
  <span className="location-readout">
    <span>{getWaypointDisplayLabel(waypoint, index, total)}</span>
    <small>{Number(waypoint.latitude).toFixed(5)}, {Number(waypoint.longitude).toFixed(5)}</small>
  </span>
);

const getRouteSummary = (waypoints) => {
  const selectedPoints = waypoints.filter(hasWaypointCoordinates).length;
  if (selectedPoints < 2) return "Route path not fully selected";

  const stopCount = Math.max(selectedPoints - 2, 0);
  if (stopCount === 0) return "Start to end route selected";
  if (stopCount === 1) return "Start to end route selected with 1 stop";
  return `Start to end route selected with ${stopCount} stops`;
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
  if (status === "RISK_ASSESSMENT_COMPLETED") return "Risk Assessment Completed";
  return status;
};

const createRiskForm = (assessment) => ({
  level: assessment?.level ?? "LOW",
  hazardsText: formatRiskLines(assessment?.hazards, "category", "risk"),
  mitigationsText: formatRiskLines(assessment?.mitigations, "hazard", "action")
});

const formatRiskLines = (items, primaryKey, secondaryKey) => {
  if (!Array.isArray(items)) return "";
  return items.map((item) => `${item?.[primaryKey] ?? ""}: ${item?.[secondaryKey] ?? ""}`.trim()).filter(Boolean).join("\n");
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

const parseRiskLines = (text, primaryKey, secondaryKey) => {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [primary, ...secondaryParts] = line.split(":");
      const secondary = secondaryParts.join(":").trim();
      return {
        [primaryKey]: primary.trim(),
        [secondaryKey]: secondary || line
      };
    });
};

const getWorkflowDescription = (status, isSystemAdministrator) => {
  if (status === "PLANNED") {
    return isSystemAdministrator
      ? "This mission is waiting for approval. Approve it before the team can move it forward."
      : "This mission is waiting for system administrator approval before it can be started.";
  }

  if (status === "APPROVED") {
    return "Complete the pre-flight risk assessment before starting this mission.";
  }

  if (status === "RISK_ASSESSMENT_COMPLETED") {
    return "Risk assessment is complete. This mission is ready to start.";
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
