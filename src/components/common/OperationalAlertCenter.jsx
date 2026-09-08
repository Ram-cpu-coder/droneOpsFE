import { AlertTriangle, CalendarClock, Eye, RefreshCw, Search, Trash2, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasClientPermission } from "../../features/auth/accessControl";
import { droneOpsApi } from "../../services/droneOpsApi";
import ActionButton from "./ActionButton";
import DataTable from "./DataTable";
import StatusBadge from "./StatusBadge";

const DISMISSED_ALERTS_KEY = "droneops-dismissed-operational-alerts";

const OperationalAlertCenter = ({ user }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [drones, setDrones] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => readDismissedAlertIds());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const canReadDrones = hasClientPermission(user, "drones:read") || hasClientPermission(user, "fleet:read");
  const canReadMaintenance = hasClientPermission(user, "maintenance:read") || hasClientPermission(user, "maintenance:manage");
  const canReadIncidents = hasClientPermission(user, "incidents:read") || hasClientPermission(user, "incidents:manage");

  const loadAlerts = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError("");

    try {
      const [droneRows, maintenanceRows, incidentRows] = await Promise.all([
        canReadDrones ? droneOpsApi.drones.list().catch(() => []) : [],
        canReadMaintenance ? droneOpsApi.maintenance.list().catch(() => []) : [],
        canReadIncidents ? droneOpsApi.incidents.list().catch(() => []) : []
      ]);

      setDrones(Array.isArray(droneRows) ? droneRows : []);
      setMaintenanceRecords(Array.isArray(maintenanceRows) ? maintenanceRows : []);
      setIncidents(Array.isArray(incidentRows) ? incidentRows : []);
    } catch (requestError) {
      setError(requestError.message ?? "Operational alerts could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [canReadDrones, canReadIncidents, canReadMaintenance, user]);

  useEffect(() => {
    loadAlerts();
    const intervalId = window.setInterval(loadAlerts, 120000);
    const handleChange = () => loadAlerts();
    window.addEventListener("droneops:activity-changed", handleChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("droneops:activity-changed", handleChange);
    };
  }, [loadAlerts]);

  const alerts = useMemo(() => (
    buildOperationalAlerts({ drones, maintenanceRecords, incidents })
      .filter((alert) => !dismissedIds.includes(alert.id))
  ), [dismissedIds, drones, incidents, maintenanceRecords]);

  const alertCount = alerts.length;

  const dismissAlert = (alert) => {
    setDismissedIds((current) => {
      if (current.includes(alert.id)) return current;
      const next = [...current, alert.id];
      window.localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(next));
      return next;
    });
    setSelectedAlert(null);
  };

  const handlePrimaryAction = (alert) => {
    if (alert.action?.type === "schedule-maintenance") {
      navigate("/maintenance", { state: { scheduleMaintenance: { droneId: alert.action.droneId } } });
      setIsOpen(false);
      return;
    }

    if (alert.action?.type === "open-maintenance") {
      navigate("/maintenance");
      setIsOpen(false);
      return;
    }

    if (alert.action?.type === "open-incident") {
      navigate(`/incidents/${encodeURIComponent(alert.action.incidentId)}`);
      setIsOpen(false);
      return;
    }

    if (alert.action?.type === "open-drone") {
      navigate(`/fleet/${encodeURIComponent(alert.action.droneId)}`);
      setIsOpen(false);
    }
  };

  const columns = [
    {
      key: "title",
      label: "Alert",
      render: (alert) => (
        <button className="link-button strong-link" type="button" onClick={() => setSelectedAlert(alert)}>
          {alert.title}
        </button>
      )
    },
    { key: "severity", label: "Severity", filterable: true, render: (alert) => <StatusBadge type="risk">{alert.severity}</StatusBadge> },
    { key: "category", label: "Category", filterable: true },
    { key: "asset", label: "Asset" },
    { key: "status", label: "Status", filterable: true, render: (alert) => <StatusBadge>{alert.status}</StatusBadge> },
    { key: "dueLabel", label: "Due" },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      searchable: false,
      render: (alert) => (
        <div className="row-actions">
          <button className="icon-button compact" type="button" onClick={() => setSelectedAlert(alert)} aria-label={`View ${alert.title}`} title="View profile">
            <Eye size={15} />
          </button>
          {alert.action && (
            <button className="secondary-button compact-action" type="button" onClick={() => handlePrimaryAction(alert)}>
              {alert.action.shortLabel ?? alert.action.label}
            </button>
          )}
          <button className="icon-button compact danger" type="button" onClick={() => dismissAlert(alert)} aria-label={`Dismiss ${alert.title}`} title="Dismiss">
            <Trash2 size={15} />
          </button>
        </div>
      )
    }
  ];

  return (
    <>
      <button
        className={`floating-alert-button ${alertCount ? "has-alerts" : ""}`}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Operational alerts ${alertCount}`}
      >
        <AlertTriangle size={23} />
        {alertCount > 0 && <span>{alertCount > 99 ? "99+" : alertCount}</span>}
      </button>

      {isOpen && (
        <div className="operational-alert-panel" role="dialog" aria-modal="true" aria-label="Operational alert center">
          <div className="operational-alert-header">
            <div>
              <p className="eyebrow">Operations Watch</p>
              <h2>Alert Center</h2>
              <p>Maintenance, inspection, overdue service, and open incident alerts.</p>
            </div>
            <div className="form-actions">
              <ActionButton icon={RefreshCw} isLoading={isLoading} onClick={loadAlerts}>Refresh</ActionButton>
              <button className="icon-button danger" type="button" onClick={() => setIsOpen(false)} aria-label="Close alert center">
                <X size={18} />
              </button>
            </div>
          </div>

          {error && <div className="auth-alert">{error}</div>}

          <div className="alert-center-summary">
            <SummaryTile label="Open alerts" value={alertCount} />
            <SummaryTile label="Critical" value={alerts.filter((alert) => alert.severity === "CRITICAL").length} />
            <SummaryTile label="Maintenance" value={alerts.filter((alert) => alert.category === "Maintenance").length} />
          </div>

          <DataTable
            columns={columns}
            rows={alerts}
            getRowKey={(alert) => alert.id}
            tableClassName="operational-alert-table"
            searchPlaceholder="Search alerts, drones, incidents"
            emptyMessage={isLoading ? "Loading alerts..." : "No operational alerts."}
            pageSize={6}
          />
        </div>
      )}

      {selectedAlert && (
        <div className="modal-backdrop">
          <div className="modal-dialog alert-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-profile-title">
            <div className="modal-header">
              <div>
                <p className="eyebrow">{selectedAlert.category}</p>
                <h2 id="alert-profile-title">{selectedAlert.title}</h2>
                <p>{selectedAlert.message}</p>
              </div>
              <button className="icon-button danger" type="button" onClick={() => setSelectedAlert(null)} aria-label="Close alert profile">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="profile-detail-grid">
                <ProfileField label="Severity" value={<StatusBadge type="risk">{selectedAlert.severity}</StatusBadge>} />
                <ProfileField label="Status" value={<StatusBadge>{selectedAlert.status}</StatusBadge>} />
                <ProfileField label="Asset" value={selectedAlert.asset} />
                <ProfileField label="Due" value={selectedAlert.dueLabel} />
                <ProfileField label="Evidence" value={selectedAlert.evidence} />
                <ProfileField label="Recommended action" value={selectedAlert.recommendation} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="danger-button" type="button" onClick={() => dismissAlert(selectedAlert)}>
                <Trash2 size={17} />
                Dismiss
              </button>
              {selectedAlert.action && (
                <ActionButton variant="primary" icon={selectedAlert.action.icon ?? Wrench} onClick={() => handlePrimaryAction(selectedAlert)}>
                  {selectedAlert.action.label}
                </ActionButton>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const SummaryTile = ({ label, value }) => (
  <div className="alert-summary-tile">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ProfileField = ({ label, value }) => (
  <div className="profile-field">
    <span>{label}</span>
    <strong>{value || "Not recorded"}</strong>
  </div>
);

const buildOperationalAlerts = ({ drones, maintenanceRecords, incidents }) => {
  const now = new Date();
  const alerts = [];

  drones.forEach((drone) => {
    const droneCode = drone.droneCode ?? drone.serialNumber ?? drone.id;
    const nextService = drone.nextMaintenanceDate ? new Date(drone.nextMaintenanceDate) : null;
    const threshold = Number(drone.inspectionThresholdHours);
    const flightHours = Number(drone.flightHours);
    const isOverdue = Boolean(drone.maintenanceOverdue || (nextService && nextService < now));
    const crossedThreshold = Number.isFinite(threshold) && threshold > 0 && Number.isFinite(flightHours) && flightHours >= threshold;

    if (isOverdue) {
      alerts.push({
        id: `drone-overdue-${drone.id}`,
        title: `${droneCode} maintenance overdue`,
        message: "This drone has passed its next service date and should not be treated as mission-ready.",
        category: "Maintenance",
        severity: "CRITICAL",
        status: "OVERDUE",
        asset: droneCode,
        dueLabel: formatDate(nextService) || "Past due",
        evidence: `Next service: ${formatDate(nextService) || "Not scheduled"}`,
        recommendation: "Schedule or complete maintenance before assigning this drone to another mission.",
        action: { type: "schedule-maintenance", label: "Schedule service", shortLabel: "Schedule", droneId: drone.id, icon: CalendarClock }
      });
    }

    if (crossedThreshold) {
      alerts.push({
        id: `drone-threshold-${drone.id}`,
        title: `${droneCode} crossed flight-hour threshold`,
        message: "The recorded flight hours have reached or exceeded the inspection threshold.",
        category: "Maintenance",
        severity: isOverdue ? "HIGH" : "MEDIUM",
        status: "INSPECTION_DUE",
        asset: droneCode,
        dueLabel: `${flightHours} / ${threshold} hours`,
        evidence: `Flight hours: ${flightHours}; threshold: ${threshold}`,
        recommendation: "Schedule an inspection and keep this drone out of normal mission eligibility if required by policy.",
        action: { type: "schedule-maintenance", label: "Schedule service", shortLabel: "Schedule", droneId: drone.id, icon: CalendarClock }
      });
    }

    if (String(drone.status ?? "").toUpperCase() === "MAINTENANCE") {
      alerts.push({
        id: `drone-maintenance-${drone.id}`,
        title: `${droneCode} is in maintenance`,
        message: "This drone is not available for mission assignment until it is returned to service.",
        category: "Maintenance",
        severity: "MEDIUM",
        status: "MAINTENANCE",
        asset: droneCode,
        dueLabel: formatDate(nextService) || "In progress",
        evidence: `Fleet status: ${drone.status}`,
        recommendation: "Review the maintenance record and release the drone only after service is completed.",
        action: { type: "open-maintenance", label: "Open maintenance", shortLabel: "Open", icon: Wrench }
      });
    }
  });

  maintenanceRecords.forEach((record) => {
    const dueAt = record.dueAt ? new Date(record.dueAt) : null;
    const status = String(record.status ?? "").toUpperCase();
    if (!dueAt || ["COMPLETED", "CANCELLED"].includes(status) || dueAt >= now) return;

    const droneCode = record.drone?.droneCode ?? record.droneCode ?? record.droneId ?? "Drone";
    alerts.push({
      id: `maintenance-record-${record.id}`,
      title: `${droneCode} scheduled maintenance is overdue`,
      message: record.type ?? "A scheduled maintenance record is past its due date.",
      category: "Maintenance",
      severity: "HIGH",
      status: "OVERDUE",
      asset: droneCode,
      dueLabel: formatDate(dueAt),
      evidence: `Maintenance status: ${record.status}`,
      recommendation: "Open the maintenance page, update the record, and complete or reschedule the work.",
      action: { type: "open-maintenance", label: "Open maintenance", shortLabel: "Open", icon: Wrench }
    });
  });

  incidents.forEach((incident) => {
    const status = String(incident.status ?? "").toUpperCase();
    if (["CLOSED", "RESOLVED", "CANCELLED"].includes(status)) return;
    const severity = String(incident.severity ?? "MEDIUM").toUpperCase();

    alerts.push({
      id: `incident-${incident.id}`,
      title: `${incident.incidentCode ?? "Incident"} needs attention`,
      message: incident.title ?? incident.details ?? "Open incident requires review.",
      category: "Incident",
      severity,
      status: incident.status ?? "OPEN",
      asset: incident.drone?.droneCode ?? incident.mission?.missionCode ?? "Operations",
      dueLabel: incident.createdAt ? new Date(incident.createdAt).toLocaleDateString() : "Open",
      evidence: incident.location ?? "Incident register",
      recommendation: "Open the incident profile and update owner, status, or corrective action.",
      action: { type: "open-incident", label: "Open incident", shortLabel: "Open", incidentId: incident.id, icon: Search }
    });
  });

  return alerts.sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
};

const severityRank = (severity) => ({
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
})[severity] ?? 0;

const formatDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
};

const readDismissedAlertIds = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_ALERTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default OperationalAlertCenter;
