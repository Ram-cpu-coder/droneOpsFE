import { AlertTriangle, CalendarClock, CheckCircle2, FileWarning, Maximize2, Minimize2, Pencil, Plane, Play, RadioTower, RefreshCw, Route, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import ActionButton from "../../../components/common/ActionButton";
import HeaderDockedTabs from "../../../components/common/HeaderDockedTabs";
import CopyableId from "../../../components/common/CopyableId";
import ProgressBar from "../../../components/common/ProgressBar";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import IncidentForm from "../../incidents/components/IncidentForm";
import MissionForm from "./MissionForm";
import MissionRouteMap from "./MissionRouteMap";

const MissionProfileDialog = ({ mission, canManage = false, user, onUpdated, onClose }) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [riskForm, setRiskForm] = useState(() => createRiskForm(mission.riskAssessment));
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isRiskSaving, setIsRiskSaving] = useState(false);
  const [isRiskEditing, setIsRiskEditing] = useState(false);
  const [authorityApprovalDraft, setAuthorityApprovalDraft] = useState({});
  const [isAuthoritySaving, setIsAuthoritySaving] = useState(false);
  const [authoritySaveMessage, setAuthoritySaveMessage] = useState("");
  const [activeProfileTab, setActiveProfileTab] = useState("overview");
  const [liveReplay, setLiveReplay] = useState([]);
  const [showLiveFullscreen, setShowLiveFullscreen] = useState(false);
  const [showFlightIncidentForm, setShowFlightIncidentForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncingSynctegral, setIsSyncingSynctegral] = useState(false);
  const isSystemAdministrator = ["SYSTEM_ADMINISTRATOR", "system_administrator"].includes(user?.role);
  const canCompleteRisk = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("risk:complete") || user?.permissions?.includes("risk:manage"));
  const workflowStatus = mission.rawStatus ?? mission.status;
  const hasRiskAssessment = Boolean(mission.riskAssessment);
  const routeProgress = mission.plannedRoute?.progress;
  const waypoints = toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates);
  const launchLocation = mission.plannedRoute?.launchSite ?? toSavedLocation(mission.launchSite);
  const operatingLocation = mission.plannedRoute?.operatingArea ?? toSavedLocation(mission.operatingArea);
  const authorityAnalysis = mission.plannedRoute?.routeAnalysis?.authorityAnalysis ?? mission.geofenceConfig?.authorityAnalysis ?? null;
  const councilApprovalState = getCouncilApprovalState(mission.geofenceConfig, authorityAnalysis, authorityApprovalDraft);
  const canEditAuthorityApprovals = canManage && !["ACTIVE", "COMPLETED", "ABORTED", "CANCELLED"].includes(workflowStatus);
  const canDeleteMission = canManage && workflowStatus !== "ACTIVE";
  const routeSummary = getRouteSummary(waypoints);
  const latestTelemetry = liveReplay[liveReplay.length - 1] ?? null;
  const profileTabs = [
    { id: "overview", label: "Overview", detail: "Plan and route" },
    {
      id: "permissions",
      label: "Council Permissions",
      detail: councilApprovalState.ready ? "Ready before flight" : `${councilApprovalState.pendingCount} pending`
    },
    { id: "integration", label: "Synctegral", detail: mission.synctegralSyncStatus ?? "Pending" },
    { id: "preflight", label: "Pre-flight", detail: hasRiskAssessment ? "Risk done" : "Risk required" }
  ];
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
    setAuthorityApprovalDraft(createAuthorityApprovalDraft(mission.geofenceConfig, authorityAnalysis));
    setAuthoritySaveMessage("");
  }, [mission.geofenceConfig, authorityAnalysis]);

  useEffect(() => {
    if (workflowStatus === "AWAITING_AUTHORITY_APPROVAL") {
      setActiveProfileTab("permissions");
    }
  }, [workflowStatus]);

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
              synctegralMissionId={mission.synctegralMissionId}
              externalDeviceId={getMissionExternalDeviceId(mission)}
              isFullscreen
              isHistorical={workflowStatus === "COMPLETED"}
              onToggleFullscreen={() => setShowLiveFullscreen((current) => !current)}
              onLogIncident={() => setShowFlightIncidentForm(true)}
            />
          )}

          <ProfileTabs tabs={profileTabs} activeTabId={activeProfileTab} onChange={setActiveProfileTab} />

          {activeProfileTab === "overview" && (
            <div className="mission-profile-tab-panel">
              <div className="profile-grid">
                <ProfileSection icon={Route} title="Mission Overview">
                  <ProfileRow label="Mission ID" value={mission.id} />
                  <ProfileRow label="Type" value={mission.type} />
                  <ProfileRow label="Status" value={getStatusLabel(workflowStatus)} />
                  <ProfileRow label="Risk" value={mission.risk} />
                </ProfileSection>

                <ProfileSection icon={UserRound} title="Assignments">
                  <ProfileRow label="Assigned Pilot" value={mission.pilot} />
                  <ProfileRow
                    label="Assigned Drone"
                    value={getMissionDroneRouteId(mission) ? (
                      <button
                        className="link-button strong-link inline-profile-link"
                        type="button"
                        onClick={() => navigate(`/fleet/${encodeURIComponent(getMissionDroneRouteId(mission))}`)}
                      >
                        {mission.drone}
                      </button>
                    ) : mission.drone}
                  />
                  <ProfileRow label="Vendor Device ID" value={getMissionExternalDeviceId(mission)} />
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
                    <h3>Mission Route</h3>
                    <p>{routeSummary}</p>
                  </div>
                  <strong>{Number(mission.progress ?? 0)}%</strong>
                </div>
                <div className="mission-progress-panel">
                  <ProgressBar value={Number(mission.progress ?? 0)} />
                </div>
                <MissionRouteMap context={{ mission: mission.serialNumber ?? mission.id, name: mission.name, status: workflowStatus }} waypoints={waypoints} launchSite={launchLocation} operatingArea={operatingLocation} authorityAnalysis={authorityAnalysis} />
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
            </div>
          )}

          {activeProfileTab === "permissions" && (
            <section className="profile-section mission-readiness-section mission-permissions-section">
              <div className="profile-section-title">
                <CheckCircle2 size={18} />
                <h3>Council Permissions Required Before Flight</h3>
              </div>
              <AuthorityApprovalReadout
                operatingLocation={operatingLocation}
                geofenceConfig={mission.geofenceConfig}
                authorityAnalysis={authorityAnalysis}
                approvalState={councilApprovalState}
                approvals={authorityApprovalDraft}
                editable={canEditAuthorityApprovals}
                isSaving={isAuthoritySaving}
                saveMessage={authoritySaveMessage}
                onApprovalChange={updateAuthorityApprovalDraft}
                onSave={handleAuthorityApprovalsSave}
              />
            </section>
          )}

          {activeProfileTab === "integration" && (
            <section className="profile-section mission-sync-section">
              <div className="profile-section-title">
                <RadioTower size={18} />
                <h3>Synctegral Integration</h3>
                <MissionSyncBadge mission={mission} />
                {canManage && (
                  <ActionButton
                    icon={RefreshCw}
                    variant={mission.synctegralSyncStatus === "FAILED" || !mission.synctegralMissionId ? "primary" : "secondary"}
                    type="button"
                    onClick={handleSynctegralSync}
                    disabled={isSyncingSynctegral}
                    isLoading={isSyncingSynctegral}
                  >
                    {mission.synctegralSyncStatus === "FAILED" || !mission.synctegralMissionId ? "Reconnect Synctegral" : "Resync Synctegral"}
                  </ActionButton>
                )}
              </div>
              <dl>
                <div>
                  <dt>Mission API reference</dt>
                  <dd>{mission.synctegralMissionId || "Waiting for Synctegral mission_id"}</dd>
                </div>
                <div>
                  <dt>Drone mapping</dt>
                  <dd>{getMissionExternalDeviceId(mission) || "Set the drone Vendor Device ID, for example SIM-001."}</dd>
                </div>
                <div>
                  <dt>Telemetry matching rule</dt>
                  <dd>{getTelemetryMatchText(mission)}</dd>
                </div>
                {mission.synctegralSyncError && (
                  <div>
                    <dt>Last sync error</dt>
                    <dd>{mission.synctegralSyncError}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {activeProfileTab === "preflight" && (
            <div className="mission-profile-tab-panel">
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
                  <div>
                    <dt>Approval evidence</dt>
                    <dd>{mission.synctegralMissionId ? `Synctegral reference ${mission.synctegralMissionId}` : "DroneOps approval and risk assessment records are stored locally."}</dd>
                  </div>
                </dl>
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
            </div>
          )}
        </div>

        <div className="modal-footer profile-footer">
          {canManage && (
            <ActionButton
              icon={Trash2}
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting || !canDeleteMission}
              title={canDeleteMission ? "Delete this mission" : "Complete or abort the active mission before deleting it."}
            >
              Delete Mission
            </ActionButton>
          )}
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
                  disabled={isActionLoading || !councilApprovalState.ready}
                >
                  {isActionLoading ? "Starting" : councilApprovalState.ready ? "Start Mission" : "Confirm Council Permissions First"}
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
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isDeleting && setShowDeleteConfirm(false)}>
            <div className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-mission-title" aria-describedby="delete-mission-description">
              <div className="delete-confirm-icon">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 id="delete-mission-title">Delete {mission.serialNumber ?? mission.id}?</h3>
                <p id="delete-mission-description">
                  This removes the mission from Mission Control. Existing telemetry, incidents, and flight logs are kept for history, but they will no longer be attached to this mission.
                </p>
              </div>
              <div className="delete-confirm-actions">
                <ActionButton type="button" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                  Cancel
                </ActionButton>
                <ActionButton icon={Trash2} variant="danger" type="button" onClick={handleDeleteMission} disabled={isDeleting} isLoading={isDeleting}>
                  {isDeleting ? "Deleting" : "Delete Mission"}
                </ActionButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);

  async function handleMissionAction(action) {
    if (action === "start" && !councilApprovalState.ready) {
      setError("Confirm permission for every council/authority before starting this mission.");
      return;
    }

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

  async function handleAuthorityApprovalsSave() {
    setIsAuthoritySaving(true);
    setError("");

    try {
      const missionId = mission.uuid ?? mission.id;
      const updatedMission = await droneOpsApi.missions.updateAuthorityApprovals(missionId, { approvals: authorityApprovalDraft });
      setAuthoritySaveMessage("Council permission updates saved.");
      onUpdated?.(updatedMission, "authorityApprovals");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsAuthoritySaving(false);
    }
  }

  async function handleSynctegralSync() {
    setIsSyncingSynctegral(true);
    setError("");

    try {
      const missionId = mission.uuid ?? mission.systemId ?? mission.id;
      const updatedMission = await droneOpsApi.missions.syncSynctegral(missionId);
      onUpdated?.(updatedMission, "synctegralSync");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSyncingSynctegral(false);
    }
  }

  async function handleDeleteMission() {
    setIsDeleting(true);
    setError("");

    try {
      const missionId = mission.uuid ?? mission.systemId ?? mission.id;
      await droneOpsApi.missions.remove(missionId);
      setShowDeleteConfirm(false);
      onUpdated?.(mission, "delete");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsDeleting(false);
    }
  }

  function updateRiskField(field, value) {
    setRiskForm((current) => ({ ...current, [field]: value }));
  }

  function updateAuthorityApprovalDraft(authorityKey, approved) {
    setAuthoritySaveMessage("");
    setAuthorityApprovalDraft((current) => ({ ...current, [authorityKey]: approved }));
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

const ProfileTabs = ({ tabs, activeTabId, onChange }) => (
  <HeaderDockedTabs>
  <div className="mission-profile-tabs" role="tablist" aria-label="Mission profile sections">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={activeTabId === tab.id}
        className={activeTabId === tab.id ? "active" : ""}
        onClick={() => onChange?.(tab.id)}
      >
        <strong>{tab.label}</strong>
        <span>{tab.detail}</span>
      </button>
    ))}
  </div>
  </HeaderDockedTabs>
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
  synctegralMissionId,
  externalDeviceId,
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
  const hasTelemetry = Boolean(telemetry);
  const integrationMessage = getLiveTelemetryIntegrationMessage({
    hasTelemetry,
    isCompleted,
    synctegralMissionId,
    externalDeviceId
  });
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
            context={{ mission: mission.serialNumber ?? mission.id, status: mission.status }}
            waypoints={waypoints}
            launchSite={launchLocation}
            operatingArea={operatingLocation}
            authorityAnalysis={authorityAnalysis}
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
          {integrationMessage && (
            <div className="mission-live-integration-note">
              <RadioTower size={16} />
              <span>{integrationMessage}</span>
            </div>
          )}
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

const MissionSyncBadge = ({ mission }) => {
  const status = normalizeSyncStatus(mission.synctegralSyncStatus);
  const label = status === "SYNCED"
    ? "Synced"
    : status === "FAILED"
      ? "Failed"
      : status === "SKIPPED"
        ? "Disabled"
        : mission.synctegralMissionId
          ? "Linked"
          : "Pending";

  return <span className={`mission-sync-chip ${status.toLowerCase()}`}>{label}</span>;
};

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
  if (status === "AWAITING_AUTHORITY_APPROVAL") return "Awaiting Authority Approval";
  if (status === "PLANNED") return "Awaiting Approval";
  if (status === "RISK_ASSESSMENT_COMPLETED") return "Risk Assessment Completed";
  return status;
};

const getMissionDroneIds = (mission) => {
  const canonicalIds = mission.drones?.map((drone) => drone.id).filter(Boolean) ?? [];
  const assignmentIds = mission.droneAssignments?.map((assignment) => assignment.drone?.id ?? assignment.droneId).filter(Boolean) ?? [];
  return [...new Set([...canonicalIds, mission.droneRecord?.id, mission.drone?.id, mission.droneId, ...assignmentIds].filter(Boolean))];
};

const getMissionExternalDeviceId = (mission) => {
  const canonicalDeviceIds = mission.drones
    ?.map((drone) => drone.externalDeviceId)
    .filter(Boolean) ?? [];
  const assignmentDeviceIds = mission.droneAssignments
    ?.map((assignment) => assignment.drone?.externalDeviceId ?? assignment.externalDeviceId)
    .filter(Boolean) ?? [];
  const assignedDroneDeviceIds = mission.assignedDroneRecords
    ?.map((drone) => drone.externalDeviceId)
    .filter(Boolean) ?? [];
  return canonicalDeviceIds[0]
    ?? mission.droneRecord?.externalDeviceId
    ?? mission.drone?.externalDeviceId
    ?? mission.externalDeviceId
    ?? assignmentDeviceIds[0]
    ?? assignedDroneDeviceIds[0]
    ?? "";
};

const getMissionDroneRouteId = (mission) => (
  mission.drones?.find((drone) => drone.id)?.id
  ?? mission.droneRecord?.id
  ?? mission.drone?.id
  ?? mission.droneId
  ?? mission.droneAssignments?.find((assignment) => assignment.drone?.id || assignment.droneId)?.drone?.id
  ?? mission.droneAssignments?.find((assignment) => assignment.drone?.id || assignment.droneId)?.droneId
  ?? ""
);

const getTelemetryMatchText = (mission) => {
  const deviceId = getMissionExternalDeviceId(mission);
  if (!mission.synctegralMissionId && !deviceId) {
    return "Telemetry will appear after this mission has a Synctegral mission_id and an assigned drone with a Vendor Device ID.";
  }
  if (!mission.synctegralMissionId) {
    return `Waiting for Synctegral mission_id. Telemetry from ${deviceId} will not be attached until the mission is linked.`;
  }
  if (!deviceId) {
    return `Mission ${mission.synctegralMissionId} is linked. Assign a drone Vendor Device ID so telemetry can be matched.`;
  }
  return `Accept telemetry only when Synctegral sends drone_id ${deviceId} and mission_id ${mission.synctegralMissionId}.`;
};

const getLiveTelemetryIntegrationMessage = ({ hasTelemetry, isCompleted, synctegralMissionId, externalDeviceId }) => {
  if (hasTelemetry) return "";
  if (isCompleted) return "No recorded telemetry was stored for this mission yet.";
  if (!synctegralMissionId && !externalDeviceId) {
    return "Waiting for Synctegral mission_id and a drone Vendor Device ID before live telemetry can be matched.";
  }
  if (!synctegralMissionId) {
    return `Waiting for Synctegral mission_id before live telemetry from ${externalDeviceId} can be attached.`;
  }
  if (!externalDeviceId) {
    return `Mission ${synctegralMissionId} is linked, but the assigned drone has no Vendor Device ID.`;
  }
  return `Waiting for Synctegral telemetry where drone_id is ${externalDeviceId} and mission_id is ${synctegralMissionId}.`;
};

const normalizeSyncStatus = (status) => {
  const normalized = String(status ?? "").toUpperCase();
  if (["SYNCED", "FAILED", "SKIPPED"].includes(normalized)) return normalized;
  return "PENDING";
};

const AuthorityApprovalReadout = ({ operatingLocation, geofenceConfig, authorityAnalysis, approvalState, approvals = {}, editable = false, isSaving = false, saveMessage = "", onApprovalChange, onSave }) => {
  if (approvalState.items.length) {
    const confirmedCount = approvalState.items.length - approvalState.pendingCount;
    return (
      <div className="mission-authority-readout">
        <div className={`mission-authority-summary-card ${approvalState.ready ? "ready" : "pending"}`}>
          <div>
            <span>{approvalState.ready ? "Ready for flight approval" : "Permission required before flight"}</span>
            <strong>{approvalState.ready ? "All council permissions confirmed" : `${approvalState.pendingCount} pending`}</strong>
            <small>{confirmedCount}/{approvalState.items.length} councils confirmed for this mission route.</small>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className={editable ? "mission-authority-checklist" : ""}>
          {approvalState.items.map((authority) => (
            editable ? (
              <label className="mission-authority-checkbox" key={authority.key}>
                <input
                  type="checkbox"
                  checked={approvals[authority.key] === true}
                  onChange={(event) => onApprovalChange?.(authority.key, event.target.checked)}
                />
                <span>
                  <strong>{authority.name}</strong>
                  <small>{approvals[authority.key] ? "Permission received" : "Permission pending"}</small>
                </span>
              </label>
            ) : (
              <small className={authority.approved ? "approved" : "pending"} key={authority.key}>
                {authority.name}: {authority.approved ? "confirmed" : "pending"}
              </small>
            )
          ))}
        </div>
        {editable && (
          <button className="mission-authority-save" type="button" onClick={onSave} disabled={isSaving}>
            <ShieldCheck size={15} />
            <span>{isSaving ? "Saving Permissions" : "Save Permission Updates"}</span>
          </button>
        )}
        {saveMessage && <p className="mission-authority-save-message">{saveMessage}</p>}
      </div>
    );
  }

  return formatAuthorityReadout(operatingLocation, geofenceConfig, authorityAnalysis);
};

const getCouncilApprovalState = (geofenceConfig, authorityAnalysis, approvalDraft = null) => {
  const authorities = [
    ...(Array.isArray(geofenceConfig?.approvalRequirements) ? geofenceConfig.approvalRequirements : []),
    ...(Array.isArray(authorityAnalysis?.authorities) ? authorityAnalysis.authorities : [])
  ];
  const authoritiesByKey = new Map();

  authorities.forEach((authority) => {
    const key = getAuthorityKey(authority);
    if (!key || authoritiesByKey.has(key)) return;
    const approvalStatus = String(authority.approvalStatus ?? "").toUpperCase();
    authoritiesByKey.set(key, {
      key,
      name: authority.authorityName ?? authority.lgaName ?? "Council authority",
      approved: approvalDraft?.[key] ?? ["APPROVED", "GRANTED", "CONFIRMED"].includes(approvalStatus)
    });
  });

  const items = [...authoritiesByKey.values()];
  const pendingCount = items.filter((item) => !item.approved).length;
  return {
    items,
    pendingCount,
    ready: items.length === 0 || pendingCount === 0
  };
};

const getAuthorityKey = (authority) => String(authority?.reference ?? authority?.absCode ?? authority?.authorityName ?? authority?.lgaName ?? "");

const createAuthorityApprovalDraft = (geofenceConfig, authorityAnalysis) => {
  const approvalState = getCouncilApprovalState(geofenceConfig, authorityAnalysis);
  return approvalState.items.reduce((draft, authority) => ({
    ...draft,
    [authority.key]: authority.approved
  }), {});
};

const formatAuthorityReadout = (operatingLocation, geofenceConfig, authorityAnalysis) => {
  const authorities = Array.isArray(authorityAnalysis?.authorities) ? authorityAnalysis.authorities : [];
  if (authorities.length) {
    return authorities.map((authority) => authority.authorityName ?? authority.lgaName).filter(Boolean).join(", ");
  }
  if (authorityAnalysis?.message) return authorityAnalysis.message;
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
  if (status === "AWAITING_AUTHORITY_APPROVAL") {
    return "This mission is saved, but required council/authority permissions must be confirmed before approval and pre-flight checks.";
  }

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
