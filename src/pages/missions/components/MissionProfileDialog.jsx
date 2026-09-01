import { AlertTriangle, CalendarClock, CheckCircle2, FileWarning, Maximize2, Minimize2, Pencil, Plane, Play, RadioTower, Route, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import CopyableId from "../../../components/common/CopyableId";
import ProgressBar from "../../../components/common/ProgressBar";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import IncidentForm from "../../incidents/components/IncidentForm";
import MissionForm from "./MissionForm";
import MissionRouteMap from "./MissionRouteMap";

const MissionProfileDialog = ({ mission, canManage = false, user, onUpdated, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [riskForm, setRiskForm] = useState(() => createRiskForm(mission.riskAssessment));
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isRiskSaving, setIsRiskSaving] = useState(false);
  const [isRiskEditing, setIsRiskEditing] = useState(false);
  const [liveReplay, setLiveReplay] = useState([]);
  const [showLiveFullscreen, setShowLiveFullscreen] = useState(false);
  const [showFlightIncidentForm, setShowFlightIncidentForm] = useState(false);
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
  const latestTelemetry = liveReplay[liveReplay.length - 1] ?? null;
  const missionDroneIds = useMemo(() => getMissionDroneIds(mission), [mission]);
  const flightIncidentDefaults = useMemo(() => ({
    missionId: mission.uuid ?? mission.systemId ?? mission.id,
    droneIds: missionDroneIds,
    source: "Telemetry",
    locationPoint: latestTelemetry?.location
      ? {
          label: "Live flight position",
          latitude: latestTelemetry.location.latitude,
          longitude: latestTelemetry.location.longitude
        }
      : null
  }), [latestTelemetry, mission, missionDroneIds]);
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
    setIsRiskEditing(false);
  }, [mission.riskAssessment]);

  useEffect(() => {
    let isMounted = true;
    let timerId = 0;
    const canLoadTelemetry = ["ACTIVE", "COMPLETED"].includes(workflowStatus);

    const loadReplay = async () => {
      if (!canLoadTelemetry) {
        setLiveReplay([]);
        return;
      }

      try {
        const rows = await droneOpsApi.missions.replay(mission.uuid ?? mission.systemId ?? mission.id);
        if (isMounted) setLiveReplay(Array.isArray(rows) ? rows : []);
      } catch {
        if (isMounted) setLiveReplay([]);
      } finally {
        if (isMounted && workflowStatus === "ACTIVE") timerId = window.setTimeout(loadReplay, 3000);
      }
    };

    loadReplay();

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [mission, workflowStatus]);

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

  if (showFlightIncidentForm) {
    return (
      <IncidentForm
        initialValues={flightIncidentDefaults}
        onCreated={() => {
          setShowFlightIncidentForm(false);
          onUpdated?.(mission, "incident");
        }}
        onCancel={() => setShowFlightIncidentForm(false)}
      />
    );
  }

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal-dialog profile-dialog ${showLiveFullscreen ? "live-fullscreen-active" : ""}`} role="dialog" aria-modal="true" aria-labelledby="mission-profile-title">
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
            <ProfileMetric icon={Plane} label="Drone" value={mission.drone} />
            <ProfileMetric icon={CalendarClock} label="Mission Planned On" value={formatMissionPlannedOn(mission.plannedStartAt)} />
          </div>

          {["ACTIVE", "COMPLETED"].includes(workflowStatus) && showLiveFullscreen && (
            <MissionLiveOperationPanel
              mission={mission}
              waypoints={waypoints}
              launchLocation={launchLocation}
              operatingLocation={operatingLocation}
              telemetry={latestTelemetry}
              telemetryTrail={liveReplay}
              replayCount={liveReplay.length}
              routeProgress={routeProgress}
              isFullscreen
              isHistorical={workflowStatus === "COMPLETED"}
              onToggleFullscreen={() => setShowLiveFullscreen((current) => !current)}
              onLogIncident={() => setShowFlightIncidentForm(true)}
            />
          )}

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
              {canCompleteRisk && hasRiskAssessment && ["APPROVED", "RISK_ASSESSMENT_COMPLETED"].includes(workflowStatus) && !isRiskEditing && (
                <button className="icon-text-button compact" type="button" onClick={() => setIsRiskEditing(true)}>
                  <Pencil size={15} />
                  <span>Edit</span>
                </button>
              )}
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

              {canCompleteRisk && ["APPROVED", "RISK_ASSESSMENT_COMPLETED"].includes(workflowStatus) && (!hasRiskAssessment || isRiskEditing) && (
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
                  {hasRiskAssessment && (
                    <ActionButton type="button" onClick={() => {
                      setRiskForm(createRiskForm(mission.riskAssessment));
                      setIsRiskEditing(false);
                    }}>
                      Cancel Edit
                    </ActionButton>
                  )}
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
              <h3>Approvals and Workflow Control</h3>
            </div>
            <dl>
              <div>
                <dt>Current step</dt>
                <dd>{getWorkflowDescription(workflowStatus, isSystemAdministrator)}</dd>
              </div>
              <div>
                <dt>Council / authority area</dt>
                <dd>{formatAuthorityReadout(operatingLocation, mission.geofenceConfig)}</dd>
              </div>
              <div>
                <dt>Approval evidence</dt>
                <dd>{mission.synctegralMissionId ? `Synctegral reference ${mission.synctegralMissionId}` : "DroneOps approval and risk assessment records are stored locally."}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="modal-footer profile-footer">
          <div className="form-actions profile-primary-actions">
            {canManage && (
              <>
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
                <>
                  <ActionButton
                    icon={FileWarning}
                    onClick={() => setShowFlightIncidentForm(true)}
                    disabled={isActionLoading}
                  >
                    Log Flight Incident
                  </ActionButton>
                  <ActionButton
                    icon={Maximize2}
                    onClick={() => setShowLiveFullscreen(true)}
                    disabled={isActionLoading}
                  >
                    Live Map
                  </ActionButton>
                  <ActionButton
                    icon={CheckCircle2}
                    variant="primary"
                    onClick={() => handleMissionAction("complete")}
                    disabled={isActionLoading}
                  >
                    {isActionLoading ? "Completing" : "Complete Mission"}
                  </ActionButton>
                </>
              )}
              </>
            )}
            {workflowStatus === "COMPLETED" && (
              <ActionButton
                icon={Maximize2}
                onClick={() => setShowLiveFullscreen(true)}
                disabled={isActionLoading}
              >
                View Telemetry Data
              </ActionButton>
            )}
          </div>
          <div className="form-actions profile-secondary-actions">
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
      if (action === "start") setShowLiveFullscreen(true);
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
      setIsRiskEditing(false);
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

const MissionLiveOperationPanel = ({
  mission,
  waypoints,
  launchLocation,
  operatingLocation,
  telemetry,
  telemetryTrail = [],
  replayCount,
  routeProgress,
  isFullscreen,
  isHistorical = false,
  onToggleFullscreen,
  onLogIncident
}) => {
  const missionState = String(mission.rawStatus ?? mission.status ?? telemetry?.status ?? "").toUpperCase();
  const telemetryState = String(
    telemetry?.status
    ?? getRawTelemetryValue(telemetry, ["aircraft.flight_status", "flight_status"])
    ?? ""
  ).toUpperCase();
  const telemetryIndicatesActive = ["ACTIVE", "IN_FLIGHT"].includes(telemetryState);
  const isCompleted = !telemetryIndicatesActive && (isHistorical || missionState === "COMPLETED" || ["COMPLETED", "MISSION_COMPLETE"].includes(telemetryState));
  const status = isCompleted
    ? "MISSION COMPLETE"
    : telemetryIndicatesActive || missionState === "ACTIVE"
      ? "IN FLIGHT"
      : telemetry?.status ?? "Waiting for telemetry";
  const telemetryTitle = isCompleted ? "Recorded Aircraft Telemetry" : "Live Aircraft Telemetry";
  const missionSummary = [
    { label: "Distance", value: formatDistance(routeProgress?.totalDistanceMeters ?? getRouteDistanceMeters(waypoints)) },
    { label: "Estimated flight time", value: formatMissionDuration(mission.plannedStartAt, mission.plannedEndAt) },
    { label: "Altitude AGL", value: formatAltitudeRange(waypoints, telemetry) },
    { label: "Telemetry records", value: replayCount || "No records" },
    { label: "Mission status", value: getStatusLabel(isCompleted ? "COMPLETED" : mission.rawStatus ?? mission.status), tone: isCompleted ? "complete" : "" }
  ];
  const primaryTelemetry = [
    { label: "AGL", value: formatTelemetryValue(getRawTelemetryValue(telemetry, ["position.altitude_agl_m", "altitude_agl_m"]) ?? telemetry?.location?.altitude, "m") },
    { label: "AMSL", value: formatTelemetryValue(getRawTelemetryValue(telemetry, ["position.altitude_amsl_m", "altitude_msl_m", "altitude_m"]), "m") },
    { label: "Ground speed", value: formatTelemetryValue(getRawTelemetryValue(telemetry, ["motion.ground_speed_mps", "speed_mps"]) ?? telemetry?.velocity?.speed, "m/s") },
    { label: "Battery", value: formatTelemetryPercent(getRawTelemetryValue(telemetry, ["power.remaining_percent", "battery_percent"]) ?? telemetry?.battery?.level) },
    { label: "Latitude", value: formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["position.latitude", "latitude"]) ?? telemetry?.location?.latitude) },
    { label: "Longitude", value: formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["position.longitude", "longitude"]) ?? telemetry?.location?.longitude) },
    { label: "Heading", value: formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["motion.heading_deg", "heading_deg"]) ?? telemetry?.velocity?.heading, "deg") },
    { label: "Flight status", value: formatReadableTelemetry(getRawTelemetryValue(telemetry, ["aircraft.flight_status", "flight_status", "flightStatus"]) ?? telemetry?.simulator?.flightStatus ?? telemetry?.status) },
    { label: "Engine", value: formatReadableTelemetry(getRawTelemetryValue(telemetry, ["aircraft.engine_status", "engine_status", "engineStatus"]) ?? telemetry?.simulator?.engineStatus) },
    { label: "Current leg", value: formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["mission_context.leg", "current_leg"]) ?? telemetry?.simulator?.leg) },
    { label: "Waypoint", value: formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["mission_context.waypoint", "current_waypoint"]) ?? telemetry?.simulator?.waypoint) },
    { label: "Terrain", value: formatReadableTelemetry(getRawTelemetryValue(telemetry, ["position.terrain_quality", "terrain_quality", "navigation.gps_health"])) },
    { label: "Battery voltage", value: formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["power.voltage_v", "battery_voltage_v"]) ?? telemetry?.battery?.voltage, "V") },
    { label: "Command link", value: formatTelemetryPercent(getRawTelemetryValue(telemetry, ["link.command_quality_percent", "command_link_percent"]) ?? telemetry?.signal?.strength) },
    { label: "Elapsed", value: formatTelemetryDuration(getRawTelemetryValue(telemetry, ["timing.simulation_elapsed_s", "elapsed_seconds"]) ?? telemetry?.simulator?.elapsedSeconds) },
    { label: "Remaining", value: formatTelemetryDistance(getRawTelemetryValue(telemetry, ["mission_context.remaining_distance_m", "remaining_distance_m"]) ?? telemetry?.simulator?.remainingDistanceMeters) }
  ];
  const telemetryGroups = [
    {
      title: "Mission / timing",
      rows: compactTelemetryRows([
        ["External mission", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["mission_id", "mission.mission_id"]) ?? telemetry?.simulator?.missionId)],
        ["Sequence", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["sequence"]) ?? telemetry?.simulator?.sequence)],
        ["Current waypoint", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["mission_context.waypoint", "current_waypoint"]) ?? telemetry?.simulator?.waypoint)],
        ["Current leg", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["mission_context.leg", "current_leg"]) ?? telemetry?.simulator?.leg)],
        ["Elapsed", formatTelemetryDuration(getRawTelemetryValue(telemetry, ["timing.simulation_elapsed_s", "elapsed_seconds"]) ?? telemetry?.simulator?.elapsedSeconds)],
        ["Remaining distance", formatTelemetryDistance(getRawTelemetryValue(telemetry, ["mission_context.remaining_distance_m", "remaining_distance_m"]) ?? telemetry?.simulator?.remainingDistanceMeters)],
        ["Updated", telemetry?.timestamp ? formatDateTime(telemetry.timestamp) : "No data"]
      ])
    },
    {
      title: "Position / terrain",
      rows: compactTelemetryRows([
        ["Latitude", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["position.latitude", "latitude"]) ?? telemetry?.location?.latitude)],
        ["Longitude", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["position.longitude", "longitude"]) ?? telemetry?.location?.longitude)],
        ["AGL", formatTelemetryValue(getRawTelemetryValue(telemetry, ["position.altitude_agl_m", "altitude_agl_m"]) ?? telemetry?.location?.altitude, "m")],
        ["AMSL", formatTelemetryValue(getRawTelemetryValue(telemetry, ["position.altitude_amsl_m", "altitude_msl_m", "altitude_m"]), "m")],
        ["Terrain MSL", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["position.terrain_elevation_msl_m", "terrain_elevation_msl_m"]), "m")],
        ["Terrain quality", formatReadableTelemetry(getRawTelemetryValue(telemetry, ["position.terrain_quality", "terrain_quality", "navigation.gps_health"]))]
      ])
    },
    {
      title: "Power / aircraft",
      rows: compactTelemetryRows([
        ["Battery", formatTelemetryPercent(getRawTelemetryValue(telemetry, ["power.remaining_percent", "battery_percent"]) ?? telemetry?.battery?.level)],
        ["Battery voltage", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["power.voltage_v", "battery_voltage_v"]) ?? telemetry?.battery?.voltage, "V")],
        ["Battery current", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["power.current_a", "battery_current_a"]), "A")],
        ["Battery temperature", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["power.temperature_c", "battery_temperature_c"]), "C")],
        ["Flight mode", formatReadableTelemetry(getRawTelemetryValue(telemetry, ["aircraft.flight_mode", "flight_mode", "flightMode"]) ?? telemetry?.simulator?.flightMode)],
        ["Flight status", formatReadableTelemetry(getRawTelemetryValue(telemetry, ["aircraft.flight_status", "flight_status", "flightStatus"]) ?? telemetry?.simulator?.flightStatus ?? telemetry?.status)],
        ["Engine status", formatReadableTelemetry(getRawTelemetryValue(telemetry, ["aircraft.engine_status", "engine_status", "engineStatus"]) ?? telemetry?.simulator?.engineStatus)],
        ["Armed", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["aircraft.armed", "raw_vendor_telemetry.armed", "armed"]))]
      ])
    },
    {
      title: "Navigation / link",
      rows: compactTelemetryRows([
        ["Heading", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["motion.heading_deg", "heading_deg"]) ?? telemetry?.velocity?.heading, "deg")],
        ["Ground speed", formatTelemetryValue(getRawTelemetryValue(telemetry, ["motion.ground_speed_mps", "speed_mps"]) ?? telemetry?.velocity?.speed, "m/s")],
        ["Vertical speed", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["motion.vertical_speed_mps", "vertical_speed_mps"]), "m/s")],
        ["GNSS fix", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["navigation.gnss_fix", "gnss_fix", "gnss"]))],
        ["Satellites", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["navigation.satellites", "satellites"]))],
        ["HDOP", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["navigation.hdop", "hdop"]))],
        ["RTK status", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["navigation.rtk_status", "rtk_status"]))],
        ["Command quality", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["link.command_quality_percent", "command_link_percent"]), "%")],
        ["Video quality", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["link.video_quality_percent", "video_quality_percent"]), "%")],
        ["RSSI", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["link.rssi_dbm", "rssi_dbm"]), "dBm")]
      ])
    },
    {
      title: "Authority / extras",
      rows: compactTelemetryRows([
        ["Council", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["mission_context.council", "council_name"]))],
        ["Council match", formatReadableTelemetry(getRawTelemetryValue(telemetry, ["mission_context.council_match_quality", "council_match_quality"]))],
        ["Pilot", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["pilot"]))],
        ["CPU load", formatTelemetryPercent(getRawTelemetryValue(telemetry, ["raw_vendor_telemetry.cpu_load_percent", "cpu_load_percent"]))],
        ["Roll", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["attitude.roll_deg", "roll_deg"]), "deg")],
        ["Pitch", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["attitude.pitch_deg", "pitch_deg"]), "deg")],
        ["Yaw", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["attitude.yaw_deg", "yaw_deg"]), "deg")],
        ["Gimbal pitch", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["gimbal.pitch_deg", "gimbal_pitch_deg"]), "deg")],
        ["Gimbal yaw", formatRawTelemetryValue(getRawTelemetryValue(telemetry, ["gimbal.yaw_deg", "gimbal_yaw_deg"]), "deg")]
      ])
    }
  ].filter((group) => group.rows.length);

  return (
    <section className={`mission-live-panel ${isFullscreen ? "fullscreen" : ""}`}>
      <div className="mission-live-header">
        <div>
          <div className="profile-section-title">
            <RadioTower size={18} />
            <span className={`mission-live-state-dot ${isCompleted ? "complete" : "live"}`} aria-hidden="true" />
            <h3>{isCompleted ? "Recorded Flight Operation" : "Live Flight Operation"}</h3>
          </div>
          <p>{isHistorical ? "Mission map, final telemetry values, and replay evidence captured during the completed operation." : "Map, flight path, telemetry, and incident response for the active mission."}</p>
        </div>
        <div className="mission-live-actions">
          <span className={`mission-live-status ${isCompleted ? "complete" : "active"}`}>{status}</span>
          {!isHistorical && <ActionButton icon={FileWarning} onClick={onLogIncident}>Log Incident</ActionButton>}
          <button className="icon-button" type="button" onClick={onToggleFullscreen} aria-label={isFullscreen ? "Exit full screen live operation" : "Expand live operation"}>
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>

      <details className="mission-live-summary" open>
        <summary>Mission Summary</summary>
        <div>
          {missionSummary.map((item) => (
            <TelemetryReadout key={item.label} label={item.label} value={item.value} compact tone={item.tone} />
          ))}
        </div>
      </details>

      <div className="mission-live-grid">
        <div className="mission-live-map">
          <MissionRouteMap
            waypoints={waypoints}
            launchSite={launchLocation}
            operatingArea={operatingLocation}
            telemetry={telemetry}
            telemetryTrail={telemetryTrail}
            telemetryMode={isCompleted ? "recorded" : "live"}
          />
        </div>
        <aside className="mission-live-telemetry" aria-label="Live telemetry readout">
          <div className="mission-live-readout-heading">
            <strong>{telemetryTitle}</strong>
            <span>{isHistorical ? "Final captured record" : `Record ${replayCount || 0}`}</span>
          </div>
          <div className="mission-live-readout-grid">
            {primaryTelemetry.map((item) => (
              <TelemetryReadout key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
          <p className="mission-live-telemetry-note">Vendor-neutral telemetry fields from the simulator/API. Empty values mean the simulator did not provide that measurement.</p>
          <div className="mission-live-accordion-list">
            {telemetryGroups.map((group) => (
              <TelemetryDetails key={group.title} title={group.title} rows={group.rows} />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
};

const TelemetryReadout = ({ label, value, compact = false, tone = "" }) => (
  <div className={`mission-live-readout ${compact ? "compact" : ""} ${tone ? `tone-${tone}` : ""}`}>
    <span>{label}</span>
    <strong>{value ?? "No data"}</strong>
  </div>
);

const TelemetryDetails = ({ title, rows }) => (
  <details className="mission-live-details">
    <summary>{title}</summary>
    <dl>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "No data"}</dd>
        </div>
      ))}
    </dl>
  </details>
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

const getRouteDistanceMeters = (waypoints) => {
  const points = waypoints.filter(hasWaypointCoordinates);
  if (points.length < 2) return null;

  return points.slice(1).reduce((total, point, index) => (
    total + getDistanceMeters(points[index], point)
  ), 0);
};

const getDistanceMeters = (from, to) => {
  const earthRadiusMeters = 6371008.8;
  const fromLatitude = toRadians(Number(from.latitude));
  const toLatitude = toRadians(Number(to.latitude));
  const deltaLatitude = toRadians(Number(to.latitude) - Number(from.latitude));
  const deltaLongitude = toRadians(Number(to.longitude) - Number(from.longitude));
  const haversine = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const toRadians = (degrees) => degrees * Math.PI / 180;

const formatMissionDuration = (start, end) => {
  if (!start || !end) return "Not scheduled";
  const durationMinutes = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return "Not scheduled";
  return `${durationMinutes.toFixed(1)} min`;
};

const formatAltitudeRange = (waypoints, telemetry) => {
  const altitudes = waypoints
    .map((waypoint) => Number(waypoint.altitude))
    .filter(Number.isFinite);
  const liveAltitude = Number(getRawTelemetryValue(telemetry, "position.altitude_agl_m") ?? telemetry?.location?.altitude);

  if (altitudes.length >= 2) return `${Math.min(...altitudes)}-${Math.max(...altitudes)} m`;
  if (Number.isFinite(liveAltitude)) return `${liveAltitude.toFixed(1)} m`;
  return "Not available";
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

const getMissionDroneIds = (mission) => {
  const assignmentIds = mission.droneAssignments?.map((assignment) => assignment.drone?.id ?? assignment.droneId).filter(Boolean) ?? [];
  return [...new Set([mission.drone?.id, mission.droneId, ...assignmentIds].filter(Boolean))];
};

const formatAuthorityReadout = (operatingLocation, geofenceConfig) => {
  const configuredCouncil = geofenceConfig?.councilName ?? geofenceConfig?.authorityName;
  if (configuredCouncil) return configuredCouncil;
  if (operatingLocation?.label && operatingLocation.label !== "Operating area") return operatingLocation.label;
  return "Authority/council approval evidence can be attached once the external authority dataset is available.";
};

const formatTelemetryPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "No data";
};

const formatTelemetryValue = (value, unit) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "No data";
  return `${Number.isInteger(number) ? number : number.toFixed(2)} ${unit}`;
};

const getRawTelemetryValue = (telemetry, path) => {
  const paths = Array.isArray(path) ? path : [path];
  const raw = telemetry?.simulator?.raw;
  const candidates = [
    raw,
    raw?.telemetry,
    raw?.record,
    raw?.data,
    raw?.raw_vendor_telemetry,
    telemetry?.simulator,
    telemetry
  ].filter(Boolean);

  for (const candidate of candidates) {
    for (const currentPath of paths) {
      if (!currentPath) continue;
      const value = currentPath.split(".").reduce((current, key) => current?.[key], candidate);
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }

  return undefined;
};

const formatRawTelemetryValue = (value, unit = "") => {
  if (value === null || value === undefined || value === "") return "No data";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const number = Number(value);
  if (Number.isFinite(number)) {
    const displayValue = Number.isInteger(number) ? number : number.toFixed(2);
    return unit ? `${displayValue} ${unit}` : `${displayValue}`;
  }
  return String(value);
};

const compactTelemetryRows = (rows) => rows.filter(([, value]) => isTelemetryValueAvailable(value));

const isTelemetryValueAvailable = (value) => (
  value !== null &&
  value !== undefined &&
  value !== "" &&
  value !== "No data" &&
  value !== "NaN" &&
  value !== "NaN m" &&
  value !== "NaN m/s" &&
  value !== "NaN %" &&
  value !== "NaN deg"
);

const formatTelemetryDuration = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "No data";

  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  if (!minutes) return `${remainingSeconds} sec`;
  return `${minutes} min ${remainingSeconds} sec`;
};

const formatTelemetryDistance = (value) => {
  const meters = Number(value);
  if (!Number.isFinite(meters)) return "No data";
  if (Math.abs(meters) >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
};

const formatReadableTelemetry = (value) => {
  if (!value) return "No data";
  return String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
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
