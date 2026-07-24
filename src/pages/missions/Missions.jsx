import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Plus, Route, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/ActionButton";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import ProgressBar from "../../components/common/ProgressBar";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { missions } from "../../data/droneOpsData";
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
  const { data: apiMissions, error, isLoading, isFallback, refresh } = useApiResource(loadMissions, missions);
  const normalizedMissions = useMemo(() => apiMissions.map(normalizeMission), [apiMissions]);
  const filteredMissions = useFleetSearch(normalizedMissions, searchValue);
  const metricMissions = isFallback ? [] : normalizedMissions;
  const routeMissionId = useMemo(() => getDetailId(location.pathname, "/missions"), [location.pathname]);
  const activeMissions = metricMissions.filter((mission) => ["ACTIVE", "In Progress"].includes(mission.rawStatus ?? mission.status)).length;
  const scheduledMissions = metricMissions.filter((mission) => ["PLANNED", "APPROVED", "Scheduled"].includes(mission.rawStatus ?? mission.status)).length;
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
      key: "id",
      label: "Mission ID",
      render: (mission) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/missions/${encodeURIComponent(mission.uuid ?? mission.id)}`)}>
          <span>{mission.id}</span>
        </button>
      )
    },
    { key: "name", label: "Mission" },
    { key: "type", label: "Type" },
    { key: "drone", label: "Drone" },
    { key: "pilot", label: "Pilot" },
    { key: "status", label: "Status", render: (mission) => <StatusBadge>{mission.status}</StatusBadge> },
    { key: "risk", label: "Risk", render: (mission) => <StatusBadge type="risk">{mission.risk}</StatusBadge> },
    { key: "progress", label: "Progress", render: (mission) => <ProgressBar value={mission.progress} /> },
    { key: "eta", label: "ETA" }
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
            navigate("/missions");
            setToast({
              title: getMissionToastTitle(action),
              message: getMissionToastMessage(updatedMission ?? selectedMission, action)
            });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onClose={() => navigate("/missions")}
        />
      )}
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className="toast-card success">
            <CheckCircle2 size={20} />
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
      {error && <div className="auth-alert">Backend unavailable: showing fallback missions. {error}</div>}
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
          getRowKey={(mission) => mission.id}
          emptyMessage={isLoading ? "Loading mission records..." : "No missions created yet."}
        />
      </div>
      {canManageMissions && showMissionForm && (
        <MissionForm
          onCreated={(mission) => {
            refresh();
            setShowMissionForm(false);
            setToast({
              title: mission.status === "PLANNED" ? "Mission submitted" : "Mission created",
              message: mission.status === "PLANNED"
                ? `${mission.missionCode} is awaiting system administrator approval.`
                : `${mission.missionCode} is now approved and saved in Mission Control.`
            });
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
  rawStatus: mission.status,
  id: mission.missionCode ?? mission.id,
  drone: mission.drone?.droneCode ?? mission.drone ?? "Unassigned",
  pilot: mission.pilot?.name ?? mission.pilot ?? "Unassigned",
  status: mission.status === "PLANNED" ? "Awaiting Approval" : mission.status,
  risk: mission.riskAssessment?.level ?? mission.risk ?? "Pending",
  eta: mission.eta ?? (mission.plannedStartAt ? new Date(mission.plannedStartAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not scheduled"),
  launchSite: mission.launchSite,
  operatingArea: mission.operatingArea,
  routeNotes: mission.plannedRoute?.notes
});

const getMissionToastTitle = (action) => {
  if (action === "approve") return "Mission approved";
  if (action === "start") return "Mission started";
  if (action === "complete") return "Mission completed";
  return "Mission updated";
};

const getMissionToastMessage = (mission, action) => {
  const label = mission?.missionCode ?? mission?.id ?? "Mission";
  if (action === "approve") return `${label} is approved and ready to be started.`;
  if (action === "start") return `${label} is now active.`;
  if (action === "complete") return `${label} is now completed.`;
  return `${label} was updated successfully.`;
};

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default Missions;
