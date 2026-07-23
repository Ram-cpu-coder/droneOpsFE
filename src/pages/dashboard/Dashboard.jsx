import { useMemo } from "react";
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
import { activity, drones, incidents, missions } from "../../data/droneOpsData";

const metricIcons = [Plane, Activity, AlertTriangle, MapPin];

const Dashboard = ({ searchValue, user, onNavigate }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const canRead = (permission) => hasClientPermission(user, permission);
  const activeMissions = missions.filter((mission) => ["In Progress", "ACTIVE"].includes(mission.status));
  const maintenanceDrones = drones.filter((drone) => drone.status === "MAINTENANCE");

  const dashboardMetrics = useMemo(() => {
    return [
      { label: "Total Drones", value: String(drones.length), delta: "Dummy fleet records", tone: "blue" },
      { label: "Active Missions", value: String(activeMissions.length), delta: `${missions.length} missions in dummy data`, tone: "green" },
      { label: "Open Alerts", value: String(incidents.length), delta: "Dummy incident records", tone: "red" },
      { label: "Maintenance", value: String(maintenanceDrones.length), delta: "Pending maintenance items", tone: "purple" }
    ];
  }, [activeMissions.length, maintenanceDrones.length]);

  const normalizedDrones = useMemo(() => drones.map(normalizeDrone), []);
  const filteredDrones = useFleetSearch(normalizedDrones, searchValue);
  const dashboardMissions = useMemo(
    () => missions.map(normalizeMissionCard).slice(0, 3),
    []
  );

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
          isLoading={false}
          onDroneSelect={(drone) => navigate(`/fleet/${encodeURIComponent(drone.uuid ?? drone.id)}`)}
        />
        <div className="panel map-panel map-loading map-deferred">
          <div>
            <span className="eyebrow">Telemetry Map</span>
            <h3>Dummy fleet map preview</h3>
            <p>Map data is currently shown from local dummy records. Backend telemetry is not connected for this page yet.</p>
          </div>
        </div>
        <MissionQueue
          missions={dashboardMissions}
          canCreate={canRead("missions:manage")}
          isLoading={false}
          onCreateMission={handleNewMission}
        />
        <ActivityFeed activity={activity} isLoading={false} />
        <IncidentWatch incidents={incidents.map(normalizeIncidentCard).slice(0, 2)} />
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
    location: drone.location ?? "No dummy position"
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
