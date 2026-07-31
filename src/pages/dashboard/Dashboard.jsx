import { useCallback, useMemo } from "react";
import { Activity, AlertTriangle, MapPin, Plane } from "lucide-react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import MetricCard from "../../components/common/MetricCard";
import { hasClientPermission } from "../../features/auth/accessControl";
import { routeActionRequested } from "../../features/ui/uiSlice";
import ActivityFeed from "./components/ActivityFeed";
import FleetOverviewTable from "./components/FleetOverviewTable";
import IncidentWatch from "./components/IncidentWatch";
import MissionQueue from "./components/MissionQueue";
import { useFleetSearch } from "../../hooks/useFleetSearch";
import { useApiResource } from "../../hooks/useApiResource";
import { droneOpsApi } from "../../services/droneOpsApi";
import { buildRecentActivityFromAudit } from "../../utils/activityStream";

const metricIcons = [Plane, Activity, AlertTriangle, MapPin];

const Dashboard = ({ searchValue, user, onNavigate }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const canRead = (permission) => hasClientPermission(user, permission);
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const loadMissions = useCallback(() => droneOpsApi.missions.list(), []);
  const loadIncidents = useCallback(() => droneOpsApi.incidents.list(), []);
  const loadAudit = useCallback(() => droneOpsApi.audit.list({ limit: 8 }), []);
  const { data: apiDrones, isLoading: isDronesLoading, isFallback: isDronesFallback } = useApiResource(loadDrones, [], { enabled: canRead("drones:read") });
  const { data: apiMissions, isLoading: isMissionsLoading, isFallback: isMissionsFallback } = useApiResource(loadMissions, [], { enabled: canRead("missions:read") });
  const { data: apiIncidents, isLoading: isIncidentsLoading, isFallback: isIncidentsFallback } = useApiResource(loadIncidents, [], { enabled: canRead("incidents:read") });
  const { data: auditLogs, isLoading: isActivityLoading } = useApiResource(loadAudit, [], { enabled: canRead("audit:read") });
  const activeMissions = apiMissions.filter((mission) => ["In Progress", "ACTIVE"].includes(mission.status));
  const openIncidents = apiIncidents.filter((incident) => !["CLOSED", "Closed", "RESOLVED", "Resolved"].includes(incident.status));
  const maintenanceDrones = apiDrones.filter((drone) => drone.status === "MAINTENANCE");

  const dashboardMetrics = useMemo(() => {
    return [
      { label: "Total Drones", value: isDronesLoading ? "..." : String(apiDrones.length), delta: isDronesFallback ? "Backend unavailable" : "Live fleet records", tone: "blue" },
      { label: "Active Missions", value: isMissionsLoading ? "..." : String(activeMissions.length), delta: isMissionsFallback ? "Backend unavailable" : `${apiMissions.length} live mission records`, tone: "green" },
      { label: "Open Alerts", value: isIncidentsLoading ? "..." : String(openIncidents.length), delta: isIncidentsFallback ? "Backend unavailable" : "Live incident records", tone: "red" },
      { label: "Maintenance", value: isDronesLoading ? "..." : String(maintenanceDrones.length), delta: "Drones requiring review", tone: "purple" }
    ];
  }, [activeMissions.length, apiDrones.length, apiMissions.length, isDronesFallback, isDronesLoading, isIncidentsFallback, isIncidentsLoading, isMissionsFallback, isMissionsLoading, maintenanceDrones.length, openIncidents.length]);

  const normalizedDrones = useMemo(() => apiDrones.map(normalizeDrone), [apiDrones]);
  const filteredDrones = useFleetSearch(normalizedDrones, searchValue);
  const dashboardMissions = useMemo(
    () => apiMissions.map(normalizeMissionCard).slice(0, 3),
    [apiMissions]
  );
  const dashboardIncidents = useMemo(() => openIncidents.map(normalizeIncidentCard).slice(0, 2), [openIncidents]);
  const recentActivity = useMemo(() => buildRecentActivityFromAudit(auditLogs, 6), [auditLogs]);

  const handleNewMission = () => {
    dispatch(routeActionRequested({ routeId: "missions", action: "create" }));
    onNavigate?.("missions");
  };

  return (
    <>
      <section className="stats-grid" aria-label="Fleet summary">
        {dashboardMetrics.map((metric, index) => (
          <MetricCard key={metric.label} {...metric} icon={metricIcons[index]} />
        ))}
      </section>

      <section className="content-grid dashboard-grid">
        <FleetOverviewTable
          drones={filteredDrones.slice(0, 5)}
          isLoading={isDronesLoading}
          onDroneSelect={(drone) => navigate(`/fleet/${encodeURIComponent(drone.uuid ?? drone.id)}`)}
        />
        <div className="panel map-panel map-loading map-deferred">
          <div>
            <span className="eyebrow">Telemetry Map</span>
            <h3>Fleet map preview</h3>
            <p>Map preview is based on available fleet records. Live telemetry rendering is handled in mission and fleet views.</p>
          </div>
        </div>
        <MissionQueue
          missions={dashboardMissions}
          canCreate={canRead("missions:manage")}
          isLoading={isMissionsLoading}
          onCreateMission={handleNewMission}
        />
        <ActivityFeed activity={recentActivity} isLoading={isActivityLoading} />
        <IncidentWatch incidents={dashboardIncidents} />
      </section>
    </>
  );
};

const normalizeDrone = (drone) => {
  return {
    ...drone,
    uuid: drone.uuid ?? drone.id,
    id: drone.droneCode ?? drone.id,
    battery: drone.battery ?? 0,
    signal: drone.signal ?? 0,
    flightHours: drone.flightHours ?? 0,
    nextMaintenance: drone.nextMaintenance ?? "Not scheduled",
    location: drone.location ?? "No position recorded"
  };
};

const normalizeMissionCard = (mission) => ({
  id: mission.id,
  name: mission.name ?? mission.missionCode ?? "Untitled mission",
  drone: mission.drone?.droneCode ?? mission.drone ?? "Unassigned drone",
  eta: mission.eta ?? (mission.plannedStartAt ? new Date(mission.plannedStartAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not scheduled"),
  progress: Number(mission.progress ?? (mission.status === "COMPLETED" ? 100 : mission.status === "ACTIVE" ? 55 : 0)),
  risk: mission.riskAssessment?.level ?? mission.risk ?? "Pending"
});

const normalizeIncidentCard = (incident) => ({
  id: incident.id,
  title: incident.title ?? incident.incidentCode ?? "Untitled incident",
  place: incident.location ?? incident.drone?.droneCode ?? "Location not recorded",
  time: incident.time ?? "Recently updated",
  status: incident.status,
  severity: incident.severity
});

export default Dashboard;
