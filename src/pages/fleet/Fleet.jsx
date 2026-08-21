import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plane, Plus, Wrench, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/ActionButton";
import CopyableId from "../../components/common/CopyableId";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
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
  const { data: apiDrones, error, isLoading, isFallback, refresh } = useApiResource(loadDrones, []);
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
      key: "systemId",
      label: "ID",
      render: (drone) => <CopyableId value={drone.systemId} />
    },
    {
      key: "serialNumber",
      label: "Serial Number",
      render: (drone) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/fleet/${encodeURIComponent(drone.uuid ?? drone.id)}`)}>
          <span>{drone.serialNumber}</span>
        </button>
      )
    },
    { key: "manufacturerSerialNumber", label: "Manufacturer Serial" },
    { key: "model", label: "Model" },
    { key: "manufacturer", label: "Manufacturer", filterable: true },
    { key: "status", label: "Status", filterable: true, render: (drone) => <StatusBadge>{drone.status}</StatusBadge> },
    { key: "battery", label: "Battery", render: (drone) => <BatteryReading drone={drone} /> },
    { key: "flightHours", label: "Flight Hours" },
    { key: "certificationStatus", label: "Certification", filterable: true, render: (drone) => <StatusBadge>{drone.certificationStatus}</StatusBadge> },
    { key: "nextMaintenance", label: "Next Service" }
  ];

  const handleRegisterDroneClick = () => {
    if (showRegisterDrone) {
      setShowRegisterDrone(false);
      return;
    }
    setShowRegisterDrone(true);
  };

  const showToast = (nextToast) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 4500);
  };

  return (
    <section className="page-stack">
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className={`toast-card ${toast.type === "error" ? "error" : "success"}`}>
            {toast.type === "error" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
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

      {error && <div className="auth-alert">Fleet records could not be loaded. {error}</div>}
      {canManageDrones && showRegisterDrone && (
        <RegisterDroneForm
          onRegistered={(registeredDrone) => {
            refresh();
            setShowRegisterDrone(false);
            showToast({
              type: "success",
              title: "Drone registered",
              message: `${registeredDrone.droneCode} is now available in the fleet inventory.`
            });
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
            showToast({
              type: "success",
              title: "Drone updated",
              message: `${updatedDrone.droneCode ?? updatedDrone.id} profile was saved.`
            });
          }}
          onDeleted={(deletedDrone) => {
            refresh();
            navigate("/fleet");
            showToast({
              type: "success",
              title: "Drone deleted",
              message: `${deletedDrone.id} was removed from the fleet.`
            });
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
          getRowKey={(drone) => drone.uuid ?? drone.id}
          onRowClick={(drone) => navigate(`/fleet/${encodeURIComponent(drone.uuid ?? drone.id)}`)}
          emptyMessage={isLoading ? "Loading fleet records..." : "No drones registered yet."}
        />
      </div>
    </section>
  );
};

const BatteryReading = ({ drone }) => {
  const value = Number(drone.battery ?? 0);

  return (
    <span className="battery-reading">
      <strong>{value}%</strong>
    </span>
  );
};

const normalizeDrone = (drone, telemetryRows = []) => {
  const latestTelemetry = telemetryRows.find((row) => row.drone?.id === drone.id || row.drone?.droneCode === drone.droneCode)?.telemetry;
  const telemetryOffline = isTelemetryOffline(drone, latestTelemetry);

  return {
    ...drone,
    uuid: drone.id,
    systemId: drone.id,
    id: drone.droneCode ?? drone.id,
    serialNumber: drone.droneCode ?? drone.id,
    manufacturerSerialNumber: drone.serialNumber ?? "Not recorded",
    battery: latestTelemetry?.battery.level ?? drone.latestTelemetry?.batteryLevel ?? drone.battery ?? 0,
    signal: telemetryOffline ? 0 : latestTelemetry?.signal.strength ?? drone.signal ?? 0,
    telemetryOffline,
    latestTelemetry,
    health: drone.health ?? 100,
    mission: drone.mission ?? "Standby",
    pilot: drone.pilot ?? "Unassigned",
    nextMaintenance: drone.nextMaintenanceDate ? new Date(drone.nextMaintenanceDate).toLocaleDateString() : (drone.nextMaintenance ?? "Not scheduled")
  };
};

const isTelemetryOffline = (drone, telemetry) => {
  const timestamp = telemetry?.timestamp ?? drone.lastTelemetryAt;
  const isStale = timestamp ? Date.now() - new Date(timestamp).getTime() > 30000 : true;
  return isStale
    || telemetry?.status === "MISSION_COMPLETE"
    || ["LOST", "OFFLINE"].includes(telemetry?.signal?.linkQuality?.toUpperCase?.())
    || ["DISCONNECTED", "GROUNDED"].includes(drone.status)
    || drone.connectorStatus === "OFFLINE";
};

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default Fleet;
