import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, UserRoundCheck, X } from "lucide-react";
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
import IncidentForm from "./components/IncidentForm";
import IncidentProfileDialog from "./components/IncidentProfileDialog";

const Incidents = ({ searchValue, user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [toast, setToast] = useState(null);
  const canCreateIncident = hasClientPermission(user, "incidents:manage") || hasClientPermission(user, "incidents:create");
  const canManageIncident = hasClientPermission(user, "incidents:manage");
  const loadIncidents = useCallback(() => droneOpsApi.incidents.list(), []);
  const { data: apiIncidents, error, isLoading, isFallback, refresh, setData: setIncidentRows } = useApiResource(loadIncidents, [], { cacheKey: "incidents:list", staleMs: 10000 });
  const normalizedIncidents = useMemo(() => apiIncidents.map(normalizeIncident), [apiIncidents]);
  const filteredIncidents = useFleetSearch(normalizedIncidents, searchValue);
  const metricIncidents = isFallback ? [] : normalizedIncidents;
  const routeIncidentId = useMemo(() => getDetailId(location.pathname, "/incidents"), [location.pathname]);
  const profileReturnPath = location.state?.returnTo === "/dashboard" ? "/dashboard" : "/incidents";
  const openIncidentCount = metricIncidents.filter((incident) => !["CLOSED", "Closed", "RESOLVED", "Resolved"].includes(incident.status)).length;
  const highCount = metricIncidents.filter((incident) => ["HIGH", "CRITICAL", "High", "Critical"].includes(incident.severity)).length;
  const assignedOwnerCount = new Set(
    metricIncidents
      .map((incident) => incident.owner)
      .filter((owner) => owner && owner !== "Unassigned")
  ).size;

  useEffect(() => {
    if (!routeIncidentId) {
      setSelectedIncident(null);
      return;
    }

    const matchedIncident = normalizedIncidents.find((incident) => String(incident.uuid ?? incident.idRaw ?? incident.id) === routeIncidentId);
    setSelectedIncident(matchedIncident ?? null);
  }, [normalizedIncidents, routeIncidentId]);

  const columns = [
    {
      key: "systemId",
      label: "ID",
      render: (incident) => <CopyableId value={incident.systemId} />
    },
    {
      key: "serialNumber",
      label: "Serial Number",
      render: (incident) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/incidents/${encodeURIComponent(incident.uuid ?? incident.idRaw ?? incident.id)}`)}>
          <span>{incident.serialNumber}</span>
        </button>
      )
    },
    { key: "title", label: "Issue" },
    { key: "severity", label: "Severity", filterable: true, render: (incident) => <StatusBadge type="risk">{incident.severity}</StatusBadge> },
    { key: "status", label: "Status", filterable: true, render: (incident) => <StatusBadge>{incident.status}</StatusBadge> },
    { key: "owner", label: "Owner" },
    { key: "source", label: "Source", filterable: true },
    { key: "time", label: "Reported" }
  ];

  const handleLogIncidentClick = () => {
    if (showIncidentForm) {
      setShowIncidentForm(false);
      return;
    }
    setShowIncidentForm(true);
  };

  const reconcileIncidentRows = useCallback((incident, action) => {
    if (!incident) {
      refresh();
      return;
    }

    setIncidentRows((currentRows = []) => {
      if (action === "delete") {
        return currentRows.filter((row) => !isSameIncident(row, incident));
      }

      const existingIndex = currentRows.findIndex((row) => isSameIncident(row, incident));
      if (existingIndex === -1) return [incident, ...currentRows];
      return currentRows.map((row, index) => (index === existingIndex ? { ...row, ...incident } : row));
    });

    refresh();
  }, [refresh, setIncidentRows]);

  return (
    <section className="page-stack">
      {selectedIncident && (
        <IncidentProfileDialog
          incident={selectedIncident}
          canManage={canManageIncident}
          onUpdated={(updatedIncident) => {
            reconcileIncidentRows(updatedIncident, "update");
            navigate(profileReturnPath);
            setToast({ title: "Incident updated", message: `${updatedIncident?.incidentCode ?? selectedIncident.id} was updated successfully.` });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onDeleted={() => {
            reconcileIncidentRows(selectedIncident, "delete");
            navigate(profileReturnPath);
            setToast({ title: "Incident deleted", message: `${selectedIncident.id} was removed from the register.` });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onClose={() => navigate(profileReturnPath)}
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
        <MetricCard label="Open Incidents" value={isLoading ? "..." : openIncidentCount} delta={isFallback ? "Backend unavailable" : "Live incident records"} icon={AlertTriangle} tone="red" />
        <MetricCard label="High Severity" value={highCount} delta="High or critical records" icon={ShieldCheck} tone="red" />
        <MetricCard label="Assigned Owners" value={assignedOwnerCount} delta="Unique assigned owners" icon={UserRoundCheck} tone="green" />
      </div>
      {error && <div className="auth-alert">Incident records could not be loaded. {error}</div>}
      <div className="panel">
        <SectionHeader
          title="Incident Register"
          description="Actionable operational incidents with ownership, severity, source, and latest status."
          action={canCreateIncident ? (
            <ActionButton
              icon={AlertTriangle}
              variant="primary"
              onClick={handleLogIncidentClick}
            >
              {showIncidentForm ? "Hide Form" : "Log Incident"}
            </ActionButton>
          ) : null}
        />
        <DataTable
          columns={columns}
          rows={filteredIncidents}
          getRowKey={(incident) => incident.uuid ?? incident.idRaw ?? incident.id}
          onRowClick={(incident) => navigate(`/incidents/${encodeURIComponent(incident.uuid ?? incident.idRaw ?? incident.id)}`)}
          emptyMessage={isLoading ? "Loading incidents..." : "No incidents logged yet."}
        />
      </div>
      {canCreateIncident && showIncidentForm && (
        <IncidentForm
          onCreated={(incident) => {
            reconcileIncidentRows(incident, "create");
            setShowIncidentForm(false);
            const evidenceUploadFailures = incident.evidenceUploadFailures?.length ?? 0;
            setToast({
              title: evidenceUploadFailures ? "Incident logged with evidence warning" : "Incident logged",
              message: evidenceUploadFailures
                ? `${incident.incidentCode} was logged, but ${evidenceUploadFailures} evidence file${evidenceUploadFailures === 1 ? "" : "s"} could not be uploaded.`
                : `${incident.incidentCode} is now in the incident register with evidence capture ready.`
            });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onCancel={() => setShowIncidentForm(false)}
        />
      )}
    </section>
  );
};

const normalizeIncident = (incident) => ({
  ...incident,
  uuid: incident.id,
  systemId: incident.id,
  idRaw: incident.id,
  id: incident.incidentCode ?? incident.id,
  serialNumber: incident.incidentCode ?? incident.id,
  owner: incident.assignedTo?.name ?? incident.reportedBy?.name ?? incident.owner ?? "Unassigned",
  place: incident.location ?? incident.place ?? "No location",
  time: incident.createdAt ? new Date(incident.createdAt).toLocaleString() : incident.time,
  details: incident.details ?? "No details captured yet.",
  droneLabel: incident.drone?.droneCode ?? incident.drone ?? "",
  missionLabel: incident.mission?.missionCode ?? incident.mission?.name ?? incident.mission ?? "",
  typeLabel: incident.type?.toString().toLowerCase().replaceAll("_", " ")
});

const isSameIncident = (row, incident) => {
  const rowKeys = [row.id, row.uuid, row.idRaw, row.systemId, row.incidentCode, row.serialNumber].filter(Boolean).map(String);
  const incidentKeys = [incident.id, incident.uuid, incident.idRaw, incident.systemId, incident.incidentCode, incident.serialNumber].filter(Boolean).map(String);
  return incidentKeys.some((key) => rowKeys.includes(key));
};

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default Incidents;
