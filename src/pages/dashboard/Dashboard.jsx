import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Activity, AlertTriangle, MapPin, Plane } from "lucide-react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import LoadingLogo from "../../components/common/LoadingLogo";
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
const GeospatialMap = lazy(() => import("../../components/maps/GeospatialMap"));
const DASHBOARD_SPLIT_STORAGE_KEY = "droneops-dashboard-drones-map-width";
const DEFAULT_DASHBOARD_SPLIT = 50;
const MIN_DASHBOARD_SPLIT = 32;
const MAX_DASHBOARD_SPLIT = 68;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getStoredDashboardSplit = () => {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_SPLIT;
  const storedValue = Number(window.localStorage.getItem(DASHBOARD_SPLIT_STORAGE_KEY));
  return Number.isFinite(storedValue)
    ? clamp(storedValue, MIN_DASHBOARD_SPLIT, MAX_DASHBOARD_SPLIT)
    : DEFAULT_DASHBOARD_SPLIT;
};

const Dashboard = ({ searchValue, user, onNavigate }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [dashboardSplit, setDashboardSplit] = useState(getStoredDashboardSplit);
  const canRead = useCallback((permission) => hasClientPermission(user, permission), [user]);
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const loadMissions = useCallback(() => droneOpsApi.missions.list(), []);
  const loadIncidents = useCallback(() => droneOpsApi.incidents.list(), []);
  const loadAudit = useCallback(() => droneOpsApi.audit.list({ limit: 8 }), []);
  const loadTelemetry = useCallback(() => {
    if (!canRead("telemetry:read")) return Promise.resolve([]);
    return droneOpsApi.telemetry.live();
  }, [canRead]);
  const { data: apiDrones, isLoading: isDronesLoading, isFallback: isDronesFallback } = useApiResource(loadDrones, [], { cacheKey: "drones:list", staleMs: 10000, enabled: canRead("drones:read") });
  const { data: apiMissions, isLoading: isMissionsLoading, isFallback: isMissionsFallback } = useApiResource(loadMissions, [], { cacheKey: "missions:list", staleMs: 10000, enabled: canRead("missions:read") });
  const { data: apiIncidents, isLoading: isIncidentsLoading, isFallback: isIncidentsFallback } = useApiResource(loadIncidents, [], { cacheKey: "incidents:list", staleMs: 10000, enabled: canRead("incidents:read") });
  const { data: auditLogs, isLoading: isActivityLoading } = useApiResource(loadAudit, [], { cacheKey: "audit:recent", staleMs: 10000, enabled: canRead("audit:read") });
  const { data: telemetryRows } = useApiResource(
    loadTelemetry,
    [],
    { cacheKey: `telemetry-live:${user?.organisationId ?? "unknown"}`, staleMs: 5000, enabled: canRead("telemetry:read") }
  );
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

  const normalizedDrones = useMemo(() => apiDrones.map((drone) => normalizeDrone(drone, telemetryRows)), [apiDrones, telemetryRows]);
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

  const navigateFromDashboard = (path) => {
    navigate(path, { state: { returnTo: "/dashboard" } });
  };

  const updateDashboardSplit = useCallback((value) => {
    const nextValue = clamp(value, MIN_DASHBOARD_SPLIT, MAX_DASHBOARD_SPLIT);
    setDashboardSplit(nextValue);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DASHBOARD_SPLIT_STORAGE_KEY, String(Math.round(nextValue)));
      window.dispatchEvent(new CustomEvent("droneops-map-layout-change"));
    }
  }, []);

  const handleDashboardSplitPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    const row = event.currentTarget.closest(".dashboard-resizable-row");
    if (!row) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const updateFromClientX = (clientX) => {
      const rect = row.getBoundingClientRect();
      if (!rect.width) return;
      updateDashboardSplit(((clientX - rect.left) / rect.width) * 100);
    };

    const handlePointerMove = (moveEvent) => updateFromClientX(moveEvent.clientX);
    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    updateFromClientX(event.clientX);
  }, [updateDashboardSplit]);

  const handleDashboardSplitKeyDown = useCallback((event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      updateDashboardSplit(MIN_DASHBOARD_SPLIT);
      return;
    }
    if (event.key === "End") {
      updateDashboardSplit(MAX_DASHBOARD_SPLIT);
      return;
    }
    updateDashboardSplit(dashboardSplit + (event.key === "ArrowRight" ? 4 : -4));
  }, [dashboardSplit, updateDashboardSplit]);

  return (
    <>
      <section className="stats-grid" aria-label="Fleet summary">
        {dashboardMetrics.map((metric, index) => (
          <MetricCard key={metric.label} {...metric} icon={metricIcons[index]} />
        ))}
      </section>

      <section className="content-grid dashboard-grid">
        <div className="dashboard-resizable-row" style={{ "--dashboard-drones-width": `${dashboardSplit}%` }}>
          <div className="dashboard-resizable-pane">
            <FleetOverviewTable
              drones={filteredDrones.slice(0, 5)}
              isLoading={isDronesLoading}
              onDroneSelect={(drone) => navigateFromDashboard(`/fleet/${encodeURIComponent(drone.uuid ?? drone.id)}`)}
            />
          </div>
          <button
            className="dashboard-resize-handle"
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize drones and telemetry map sections"
            aria-valuemin={MIN_DASHBOARD_SPLIT}
            aria-valuemax={MAX_DASHBOARD_SPLIT}
            aria-valuenow={Math.round(dashboardSplit)}
            onPointerDown={handleDashboardSplitPointerDown}
            onKeyDown={handleDashboardSplitKeyDown}
          >
            <span aria-hidden="true" />
          </button>
          <div className="dashboard-resizable-pane">
            {canRead("telemetry:read") ? (
              <Suspense fallback={<div className="panel map-panel map-loading"><LoadingLogo label="Loading telemetry map" /></div>}>
                <GeospatialMap />
              </Suspense>
            ) : (
              <div className="panel map-panel map-loading map-deferred">
                <div>
                  <span className="eyebrow">Telemetry Map</span>
                  <span>Telemetry access is not enabled for this role.</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <MissionQueue
          missions={dashboardMissions}
          canCreate={canRead("missions:manage")}
          isLoading={isMissionsLoading}
          onCreateMission={handleNewMission}
          onMissionSelect={(mission) => navigateFromDashboard(`/missions/${encodeURIComponent(mission.uuid ?? mission.id)}`)}
        />
        <IncidentWatch incidents={dashboardIncidents} onIncidentSelect={(incident) => navigateFromDashboard(`/incidents/${encodeURIComponent(incident.uuid ?? incident.idRaw ?? incident.id)}`)} />
        <ActivityFeed activity={recentActivity} isLoading={isActivityLoading} onActivitySelect={(item) => item.targetPath && navigateFromDashboard(item.targetPath)} />
      </section>
    </>
  );
};

const normalizeDrone = (drone, telemetryRows = []) => {
  const latestTelemetry = telemetryRows.find((row) => row.drone?.id === drone.id || row.drone?.droneCode === drone.droneCode)?.telemetry;

  return {
    ...drone,
    uuid: drone.uuid ?? drone.id,
    systemId: drone.id,
    id: drone.droneCode ?? drone.id,
    serialNumber: drone.droneCode ?? drone.id,
    battery: latestTelemetry?.battery.level ?? drone.latestTelemetry?.batteryLevel ?? drone.battery ?? 0,
    signal: latestTelemetry?.signal.strength ?? drone.signal ?? 0,
    latestTelemetry,
    flightHours: drone.flightHours ?? 0,
    nextMaintenance: drone.nextMaintenance ?? "Not scheduled",
    location: latestTelemetry
      ? `${Number(latestTelemetry.location.latitude).toFixed(4)}, ${Number(latestTelemetry.location.longitude).toFixed(4)}`
      : normalizeDashboardLocation(drone.location)
  };
};

const normalizeDashboardLocation = (location) => {
  const value = String(location ?? "").trim();
  if (!value || value.toLowerCase() === "no position recorded") return "Not recorded";
  return value;
};

const normalizeMissionCard = (mission) => ({
  id: mission.id,
  uuid: mission.uuid ?? mission.id,
  name: mission.name ?? mission.missionCode ?? "Untitled mission",
  drone: getMissionDroneLabel(mission) || "Unassigned drone",
  eta: mission.eta ?? (mission.plannedStartAt ? new Date(mission.plannedStartAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not scheduled"),
  progress: Number(mission.progress ?? (mission.status === "COMPLETED" ? 100 : mission.status === "ACTIVE" ? 55 : 0)),
  risk: mission.riskAssessment?.level ?? mission.risk ?? "Pending"
});

const getMissionDroneLabel = (mission) => (
  mission.drones?.map((drone) => drone.droneCode ?? drone.id).filter(Boolean).join(", ")
  || mission.drone?.droneCode
  || (typeof mission.drone === "string" ? mission.drone : "")
);

const normalizeIncidentCard = (incident) => ({
  id: incident.id,
  uuid: incident.uuid ?? incident.id,
  idRaw: incident.idRaw,
  title: incident.title ?? incident.incidentCode ?? "Untitled incident",
  place: incident.location ?? incident.drone?.droneCode ?? "Location not recorded",
  time: incident.time ?? "Recently updated",
  status: incident.status,
  severity: incident.severity
});

export default Dashboard;
