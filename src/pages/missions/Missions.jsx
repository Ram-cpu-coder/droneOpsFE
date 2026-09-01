import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, Route, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/ActionButton";
import CopyableId from "../../components/common/CopyableId";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import ProgressBar from "../../components/common/ProgressBar";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { hasClientPermission } from "../../features/auth/accessControl";
import { useApiResource } from "../../hooks/useApiResource";
import { useFleetSearch } from "../../hooks/useFleetSearch";
import { droneOpsApi } from "../../services/droneOpsApi";
import MissionForm from "./components/MissionForm";
import MissionProfileDialog from "./components/MissionProfileDialog";

const Missions = ({ searchValue, user, pendingRouteAction, onRouteActionHandled }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [selectedMission, setSelectedMission] = useState(null);
  const [toast, setToast] = useState(null);
  const canManageMissions = hasClientPermission(user, "missions:manage");
  const loadMissions = useCallback(() => droneOpsApi.missions.list(), []);
  const { data: apiMissions, error, isLoading, isFallback, refresh } = useApiResource(loadMissions, [], { cacheKey: "missions:list", staleMs: 10000 });
  const normalizedMissions = useMemo(() => apiMissions.map(normalizeMission), [apiMissions]);
  const filteredMissions = useFleetSearch(normalizedMissions, searchValue);
  const metricMissions = isFallback ? [] : normalizedMissions;
  const routeMissionId = useMemo(() => getDetailId(location.pathname, "/missions"), [location.pathname]);
  const profileReturnPath = location.state?.returnTo === "/dashboard" ? "/dashboard" : "/missions";
  const activeMissions = metricMissions.filter((mission) => ["ACTIVE", "In Progress"].includes(mission.rawStatus ?? mission.status)).length;
  const scheduledMissions = metricMissions.filter((mission) => ["PLANNED", "APPROVED", "RISK_ASSESSMENT_COMPLETED", "Scheduled"].includes(mission.rawStatus ?? mission.status)).length;
  const averageProgress = metricMissions.length
    ? Math.round(metricMissions.reduce((total, mission) => total + Number(mission.progress ?? 0), 0) / metricMissions.length)
    : 0;

  useEffect(() => {
    if (pendingRouteAction?.routeId !== "missions" || pendingRouteAction.action !== "create") return;
    if (canManageMissions) setShowMissionForm(true);
    onRouteActionHandled?.();
  }, [canManageMissions, onRouteActionHandled, pendingRouteAction]);

  useEffect(() => {
    if (!routeMissionId) {
      setSelectedMission(null);
      return;
    }

    const matchedMission = normalizedMissions.find((mission) => String(mission.uuid ?? mission.id) === routeMissionId);
    setSelectedMission(matchedMission ?? null);
  }, [normalizedMissions, routeMissionId]);

  const columns = [
    {
      key: "systemId",
      label: "ID",
      render: (mission) => <CopyableId value={mission.systemId} />
    },
    {
      key: "serialNumber",
      label: "Serial Number",
      render: (mission) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/missions/${encodeURIComponent(mission.uuid ?? mission.id)}`)}>
          <span>{mission.serialNumber}</span>
        </button>
      )
    },
    { key: "name", label: "Mission" },
    { key: "type", label: "Type", filterable: true },
    { key: "drone", label: "Drone" },
    { key: "pilot", label: "Pilot" },
    { key: "status", label: "Status", filterable: true, render: (mission) => <StatusBadge>{mission.status}</StatusBadge> },
    { key: "risk", label: "Risk", filterable: true, render: (mission) => <StatusBadge type="risk">{mission.risk}</StatusBadge> },
    { key: "progress", label: "Progress", render: (mission) => <ProgressBar value={mission.progress} /> },
    { key: "eta", label: "Mission Planned On" }
  ];

  const handleCreateMissionClick = () => {
    if (showMissionForm) {
      setShowMissionForm(false);
      return;
    }
    setShowMissionForm(true);
  };

  return (
    <section className="page-stack">
      {selectedMission && (
        <MissionProfileDialog
          mission={selectedMission}
          canManage={canManageMissions}
          user={user}
          onUpdated={(updatedMission, action) => {
            refresh();
            if (action !== "riskAssessment") navigate(profileReturnPath);
            setToast({
              type: updatedMission?.synctegralSyncStatus === "FAILED" ? "warning" : "success",
              title: getMissionToastTitle(action),
              message: getMissionToastMessage(updatedMission ?? selectedMission, action)
            });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onClose={() => navigate(profileReturnPath)}
        />
      )}
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className={`toast-card ${toast.type ?? "success"}`}>
            {toast.type === "warning" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            <button className="toast-close" type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="stats-grid three">
        <MetricCard label="Active Missions" value={isLoading ? "..." : activeMissions} delta={isFallback ? "Backend unavailable" : "Live mission records"} icon={Route} tone="green" />
        <MetricCard label="Scheduled Missions" value={isLoading ? "..." : scheduledMissions} delta="Planned or approved" icon={CalendarClock} tone="purple" />
        <MetricCard label="Avg Completion" value={isLoading ? "..." : `${averageProgress}%`} delta="Calculated from mission records" icon={Route} tone="blue" />
      </div>
      {error && <div className="auth-alert">Mission records could not be loaded. {error}</div>}
      <div className="panel">
        <SectionHeader
          title="Mission Control"
          description="Plan, track, and audit drone missions from assignment through completion."
          action={canManageMissions ? (
            <ActionButton
              icon={Plus}
              variant="primary"
              onClick={handleCreateMissionClick}
            >
              {showMissionForm ? "Hide Form" : "Create Mission"}
            </ActionButton>
          ) : null}
        />
        <DataTable
          columns={columns}
          rows={filteredMissions}
          getRowKey={(mission) => mission.uuid ?? mission.id}
          onRowClick={(mission) => navigate(`/missions/${encodeURIComponent(mission.uuid ?? mission.id)}`)}
          emptyMessage={isLoading ? "Loading mission records..." : "No missions created yet."}
        />
      </div>
      {canManageMissions && showMissionForm && (
        <MissionForm
          onCreated={(mission) => {
            refresh();
            setShowMissionForm(false);
            setToast(getMissionCreatedToast(mission));
            window.setTimeout(() => setToast(null), 4500);
          }}
          onCancel={() => setShowMissionForm(false)}
        />
      )}
    </section>
  );
};

const normalizeMission = (mission) => ({
  ...mission,
  uuid: mission.id,
  systemId: mission.id,
  rawStatus: mission.status,
  id: mission.missionCode ?? mission.id,
  serialNumber: mission.missionCode ?? mission.id,
  drone: mission.drone?.droneCode ?? mission.drone ?? "Unassigned",
  pilot: mission.pilot?.name ?? mission.pilot ?? "Unassigned",
  status: getMissionStatusLabel(mission.status),
  risk: mission.riskAssessment?.level ?? mission.risk ?? "Pending",
  eta: mission.eta ?? formatMissionPlannedOn(mission.plannedStartAt),
  launchSite: mission.launchSite,
  operatingArea: mission.operatingArea,
  routeNotes: mission.plannedRoute?.notes
});

const getMissionToastTitle = (action) => {
  if (action === "approve") return "Mission approved";
  if (action === "riskAssessment") return "Risk assessment saved";
  if (action === "start") return "Mission started";
  if (action === "complete") return "Mission completed";
  return "Mission updated";
};

const getMissionToastMessage = (mission, action) => {
  const label = mission?.missionCode ?? mission?.id ?? "Mission";
  const syncMessage = getSynctegralSyncMessage(mission);
  if (action === "approve") return `${label} is approved and ready for risk assessment.`;
  if (action === "riskAssessment") return `${label} passed pre-flight risk assessment checks and is ready to start.`;
  if (action === "start") return `${label} is now active.${syncMessage}`;
  if (action === "complete") return `${label} is now completed.${syncMessage}`;
  return `${label} was updated successfully.${syncMessage}`;
};

const getSynctegralSyncMessage = (mission) => {
  if (!mission?.synctegralSyncStatus) return "";
  if (mission.synctegralSyncStatus === "SYNCED") {
    return mission.synctegralMissionId
      ? ` Synctegral reference: ${mission.synctegralMissionId}.`
      : " Synctegral sync completed.";
  }
  if (mission.synctegralSyncStatus === "FAILED") {
    return ` Synctegral sync failed: ${mission.synctegralSyncError ?? "check Mission API availability."}`;
  }
  if (mission.synctegralSyncStatus === "SKIPPED") {
    return " Synctegral sync is disabled in the backend.";
  }
  return "";
};

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

const getMissionCreatedToast = (mission) => {
  const label = mission.missionCode ?? mission.id ?? "Mission";
  const localMessage = mission.status === "PLANNED"
    ? `${label} is awaiting system administrator approval.`
    : `${label} is now approved and saved in Mission Control.`;

  if (mission.synctegralSyncStatus === "SYNCED") {
    return {
      type: "success",
      title: "Mission synced",
      message: `${localMessage} Synctegral mission reference saved${mission.synctegralMissionId ? `: ${mission.synctegralMissionId}` : "."}`
    };
  }

  if (mission.synctegralSyncStatus === "FAILED") {
    return {
      type: "warning",
      title: "Mission saved, Synctegral sync failed",
      message: `${localMessage} Backend could not sync it to Synctegral: ${mission.synctegralSyncError ?? "check BE environment and Mission API availability."}`
    };
  }

  if (mission.synctegralSyncStatus === "SKIPPED") {
    return {
      type: "warning",
      title: "Mission saved locally",
      message: `${localMessage} Synctegral Mission API sync is disabled in BE env.`
    };
  }

  return {
    type: "warning",
    title: "Mission saved, sync status unavailable",
    message: `${localMessage} Backend did not return Synctegral sync status. Restart BE and apply the Prisma migration/generate step.`
  };
};

const getMissionStatusLabel = (status) => {
  if (status === "PLANNED") return "Awaiting Approval";
  if (status === "RISK_ASSESSMENT_COMPLETED") return "Risk Assessment Completed";
  return status;
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

export default Missions;
