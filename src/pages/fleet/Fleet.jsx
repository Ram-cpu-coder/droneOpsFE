import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plane, Plus, Wrench, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/ActionButton";
import BatteryMeter from "../../components/common/BatteryMeter";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import ProgressBar from "../../components/common/ProgressBar";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { drones } from "../../data/droneOpsData";
import { hasClientPermission } from "../../features/auth/accessControl";
import { useApiResource } from "../../hooks/useApiResource";
import { useFleetSearch } from "../../hooks/useFleetSearch";
import { droneOpsApi } from "../../services/droneOpsApi";
import DroneProfileDialog from "./components/DroneProfileDialog";
import RegisterDroneForm from "./components/RegisterDroneForm";

const Fleet = ({ searchValue, user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showRegisterDrone, setShowRegisterDrone] = useState(false);
  const [selectedDrone, setSelectedDrone] = useState(null);
  const [toast, setToast] = useState(null);
  const canManageDrones = hasClientPermission(user, "drones:manage");
  const canReadTelemetry = hasClientPermission(user, "telemetry:read");
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const loadTelemetry = useCallback(() => {
    if (!canReadTelemetry) return Promise.resolve([]);
    return droneOpsApi.telemetry.live();
  }, [canReadTelemetry]);
  const { data: apiDrones, error, isLoading, isFallback, refresh } = useApiResource(loadDrones, drones);
  const { data: telemetryRows } = useApiResource(loadTelemetry, []);
  const normalizedDrones = useMemo(() => apiDrones.map((drone) => normalizeDrone(drone, telemetryRows)), [apiDrones, telemetryRows]);
  const filteredDrones = useFleetSearch(normalizedDrones, searchValue);
  const metricDrones = isFallback ? [] : normalizedDrones;
  const activeCount = metricDrones.filter((drone) => drone.status === "AVAILABLE").length;
  const maintenanceCount = metricDrones.filter((drone) => drone.status === "MAINTENANCE").length;
  const routeDroneId = useMemo(() => getDetailId(location.pathname, "/fleet"), [location.pathname]);

  useEffect(() => {
    if (!routeDroneId) {
      setSelectedDrone(null);
      return;
    }

    const matchedDrone = normalizedDrones.find((drone) => String(drone.uuid ?? drone.id) === routeDroneId);
    setSelectedDrone(matchedDrone ?? null);
  }, [normalizedDrones, routeDroneId]);

  const columns = [
    {
      key: "id",
      label: "Drone",
      render: (drone) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/fleet/${encodeURIComponent(drone.uuid ?? drone.id)}`)}>
          <span>{drone.id}</span>
        </button>
      )
    },
    { key: "serialNumber", label: "Serial Number" },
    { key: "model", label: "Model" },
    { key: "manufacturer", label: "Manufacturer" },
    { key: "status", label: "Status", render: (drone) => <StatusBadge>{drone.status}</StatusBadge> },
    { key: "battery", label: "Battery", render: (drone) => <BatteryMeter value={drone.battery} /> },
    { key: "flightHours", label: "Flight Hours" },
    { key: "certificationStatus", label: "Certification", render: (drone) => <StatusBadge>{drone.certificationStatus}</StatusBadge> },
    { key: "nextMaintenance", label: "Next Service" }
  ];

  const handleRegisterDroneClick = () => {
    if (showRegisterDrone) {
      setShowRegisterDrone(false);
      return;
    }
    setShowRegisterDrone(true);
  };

  return (
    <section className="page-stack">
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
        <MetricCard label="Aircraft Registered" value={isLoading ? "..." : metricDrones.length} delta={isFallback ? "Backend unavailable" : "Live fleet records"} icon={Plane} tone="blue" />
        <MetricCard label="Available Drones" value={isLoading ? "..." : activeCount} delta="Eligible for mission assignment" icon={Plane} tone="green" />
        <MetricCard label="Maintenance" value={isLoading ? "..." : maintenanceCount} delta="Requires engineer review" icon={Wrench} tone="red" />
      </div>

      {error && <div className="auth-alert">Backend unavailable: showing fallback fleet data. {error}</div>}
      {canManageDrones && showRegisterDrone && (
        <RegisterDroneForm
          onRegistered={(registeredDrone) => {
            refresh();
            setShowRegisterDrone(false);
            setToast({
              title: "Drone registered",
              message: `${registeredDrone.droneCode} is now available in the fleet inventory.`
            });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onCancel={() => setShowRegisterDrone(false)}
        />
      )}
      {selectedDrone && (
        <DroneProfileDialog
          drone={selectedDrone}
          canManage={canManageDrones}
          onUpdated={(updatedDrone) => {
            refresh();
            navigate("/fleet");
            setToast({
              title: "Drone updated",
              message: `${updatedDrone.droneCode ?? updatedDrone.id} profile was saved.`
            });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onDeleted={(deletedDrone) => {
            refresh();
            navigate("/fleet");
            setToast({
              title: "Drone deleted",
              message: `${deletedDrone.id} was removed from the fleet.`
            });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onClose={() => navigate("/fleet")}
        />
      )}

      <div className="panel">
        <SectionHeader
          title="Fleet Inventory"
          description="Operational status, payload, maintenance window, and aircraft readiness."
          action={canManageDrones ? (
            <ActionButton
              icon={Plus}
              variant="primary"
              onClick={handleRegisterDroneClick}
            >
              {showRegisterDrone ? "Hide Form" : "Register Drone"}
            </ActionButton>
          ) : null}
        />
        <DataTable
          columns={columns}
          rows={filteredDrones}
          getRowKey={(drone) => drone.id}
          emptyMessage={isLoading ? "Loading fleet records..." : "No drones registered yet."}
        />
      </div>
    </section>
  );
};

const normalizeDrone = (drone, telemetryRows = []) => {
  const latestTelemetry = telemetryRows.find((row) => row.drone?.id === drone.id || row.drone?.droneCode === drone.droneCode)?.telemetry;

  return {
    ...drone,
    uuid: drone.id,
    id: drone.droneCode ?? drone.id,
    battery: latestTelemetry?.battery.level ?? drone.latestTelemetry?.batteryLevel ?? drone.battery ?? 0,
    signal: latestTelemetry?.signal.strength ?? drone.signal ?? 0,
    latestTelemetry,
    health: drone.health ?? 100,
    mission: drone.mission ?? "Standby",
    pilot: drone.pilot ?? "Unassigned",
    nextMaintenance: drone.nextMaintenanceDate ? new Date(drone.nextMaintenanceDate).toLocaleDateString() : (drone.nextMaintenance ?? "Not scheduled")
  };
};

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default Fleet;
