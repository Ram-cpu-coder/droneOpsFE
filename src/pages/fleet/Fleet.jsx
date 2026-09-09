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
import { formatDateOnly } from "../../utils/formatters";
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
  const { data: apiDrones, error, isLoading, isFallback, refresh, setData: setDroneRows } = useApiResource(loadDrones, [], { cacheKey: "drones:list", staleMs: 10000 });
  const { data: telemetryRows } = useApiResource(loadTelemetry, [], { cacheKey: "telemetry-live:fleet", staleMs: 3000, enabled: canReadTelemetry });
  const normalizedDrones = useMemo(() => apiDrones.map((drone) => normalizeDrone(drone, telemetryRows)), [apiDrones, telemetryRows]);
  const filteredDrones = useFleetSearch(normalizedDrones, searchValue);
  const metricDrones = isFallback ? [] : normalizedDrones;
  const activeCount = metricDrones.filter((drone) => drone.status === "AVAILABLE" && !drone.telemetryOffline).length;
  const maintenanceCount = metricDrones.filter((drone) => drone.status === "MAINTENANCE").length;
  const routeDroneId = useMemo(() => getDetailId(location.pathname, "/fleet"), [location.pathname]);
  const profileReturnPath = location.state?.returnTo === "/dashboard" ? "/dashboard" : "/fleet";

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
      className: "fleet-key-column",
      render: (drone) => <CopyableId value={drone.systemId} />
    },
    {
      key: "serialNumber",
      label: "Serial Number",
      className: "fleet-key-column",
      render: (drone) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/fleet/${encodeURIComponent(drone.uuid ?? drone.id)}`)}>
          <span>{drone.serialNumber}</span>
        </button>
      )
    },
    { key: "manufacturerSerialNumber", label: "Manufacturer Serial", className: "fleet-secondary-column" },
    { key: "model", label: "Model", className: "fleet-secondary-column" },
    { key: "manufacturer", label: "Manufacturer", filterable: true, className: "fleet-secondary-column" },
    { key: "status", label: "Status", filterable: true, render: (drone) => <StatusBadge>{getOperationalStatusLabel(drone)}</StatusBadge> },
    { key: "battery", label: "Battery", render: (drone) => <BatteryReading drone={drone} /> },
    { key: "flightHours", label: "Flight Hours", className: "fleet-secondary-column" },
    { key: "certificationStatus", label: "Certification", filterable: true, className: "fleet-secondary-column", render: (drone) => <StatusBadge>{drone.certificationStatus}</StatusBadge> },
    { key: "nextMaintenance", label: "Next Service", className: "fleet-secondary-column" }
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

  const reconcileDroneRows = useCallback((drone, action) => {
    if (!drone) {
      refresh();
      return;
    }

    setDroneRows((currentRows = []) => {
      if (action === "delete") {
        return currentRows.filter((row) => !isSameDrone(row, drone));
      }

      const existingIndex = currentRows.findIndex((row) => isSameDrone(row, drone));
      if (existingIndex === -1) return [drone, ...currentRows];
      return currentRows.map((row, index) => (index === existingIndex ? { ...row, ...drone } : row));
    });

    refresh();
  }, [refresh, setDroneRows]);

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
            reconcileDroneRows(registeredDrone, "create");
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
            reconcileDroneRows(updatedDrone, "update");
            navigate(profileReturnPath);
            showToast({
              type: "success",
              title: "Drone updated",
              message: `${updatedDrone.droneCode ?? updatedDrone.id} profile was saved.`
            });
          }}
          onDeleted={(deletedDrone) => {
            reconcileDroneRows(deletedDrone, "delete");
            navigate(profileReturnPath);
            showToast({
              type: "success",
              title: "Drone deleted",
              message: `${deletedDrone.id} was removed from the fleet.`
            });
          }}
          onClose={() => navigate(profileReturnPath)}
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
          tableClassName="fleet-inventory-table"
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
  const value = Number(drone.battery);

  if (drone.battery === null || drone.battery === undefined || !Number.isFinite(value)) {
    return <span className="battery-reading is-unknown"><strong>Unknown</strong></span>;
  }

  return (
    <span className="battery-reading">
      <strong>{Math.min(100, Math.max(0, value))}%</strong>
    </span>
  );
};

const getOperationalStatusLabel = (drone) => {
  if (drone.status === "AVAILABLE" && drone.telemetryOffline) return "AVAILABLE_OFFLINE";
  return drone.status;
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
    battery: latestTelemetry?.battery?.level ?? drone.latestTelemetry?.batteryLevel ?? drone.battery ?? null,
    signal: telemetryOffline ? 0 : latestTelemetry?.signal?.strength ?? drone.signal ?? 0,
    telemetryOffline,
    latestTelemetry,
    health: drone.health ?? 100,
    mission: drone.mission ?? "Standby",
    pilot: drone.pilot ?? "Unassigned",
    nextMaintenance: formatDateOnly(drone.nextMaintenanceDate, drone.nextMaintenance ?? "Not scheduled")
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

const isSameDrone = (row, drone) => {
  const rowKeys = [row.id, row.uuid, row.systemId, row.droneCode, row.serialNumber].filter(Boolean).map(String);
  const droneKeys = [drone.id, drone.uuid, drone.systemId, drone.droneCode, drone.serialNumber].filter(Boolean).map(String);
  return droneKeys.some((key) => rowKeys.includes(key));
};

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default Fleet;
