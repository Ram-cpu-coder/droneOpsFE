import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/ActionButton";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { incidents } from "../../data/droneOpsData";
import { hasClientPermission } from "../../features/auth/accessControl";
import { useFleetSearch } from "../../hooks/useFleetSearch";
import IncidentForm from "./components/IncidentForm";
import IncidentProfileDialog from "./components/IncidentProfileDialog";

const Incidents = ({ searchValue, user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentRecords, setIncidentRecords] = useState(incidents);
  const [toast, setToast] = useState(null);
  const canCreateIncident = hasClientPermission(user, "incidents:manage") || hasClientPermission(user, "incidents:create");
  const canManageIncident = hasClientPermission(user, "incidents:manage");
  const normalizedIncidents = useMemo(() => incidentRecords.map(normalizeIncident), [incidentRecords]);
  const filteredIncidents = useFleetSearch(normalizedIncidents, searchValue);
  const metricIncidents = normalizedIncidents;
  const routeIncidentId = useMemo(() => getDetailId(location.pathname, "/incidents"), [location.pathname]);
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
      key: "id",
      label: "Incident",
      render: (incident) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/incidents/${encodeURIComponent(incident.uuid ?? incident.idRaw ?? incident.id)}`)}>
          <span>{incident.id}</span>
        </button>
      )
    },
    { key: "title", label: "Issue" },
    { key: "severity", label: "Severity", render: (incident) => <StatusBadge type="risk">{incident.severity}</StatusBadge> },
    { key: "status", label: "Status", render: (incident) => <StatusBadge>{incident.status}</StatusBadge> },
    { key: "owner", label: "Owner" },
    { key: "source", label: "Source" },
    { key: "time", label: "Reported" }
  ];

  const handleLogIncidentClick = () => {
    if (showIncidentForm) {
      setShowIncidentForm(false);
      return;
    }
    setShowIncidentForm(true);
  };

  return (
    <section className="page-stack">
      {selectedIncident && (
        <IncidentProfileDialog
          incident={selectedIncident}
          canManage={canManageIncident}
          onUpdated={(updatedIncident) => {
            setIncidentRecords((current) => current.map((incident) => (
              incident.id === updatedIncident.id || incident.id === updatedIncident.incidentCode
                ? updatedIncident
                : incident
            )));
            navigate("/incidents");
            setToast({ title: "Incident updated", message: `${selectedIncident.id} was updated successfully.` });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onDeleted={() => {
            setIncidentRecords((current) => current.filter((incident) => (
              incident.id !== selectedIncident.id && incident.id !== selectedIncident.idRaw && incident.incidentCode !== selectedIncident.id
            )));
            navigate("/incidents");
            setToast({ title: "Incident deleted", message: `${selectedIncident.id} was removed from the register.` });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onClose={() => navigate("/incidents")}
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
        <MetricCard label="Open Incidents" value={openIncidentCount} delta="Dummy incident records" icon={AlertTriangle} tone="red" />
        <MetricCard label="High Severity" value={highCount} delta="High or critical records" icon={ShieldCheck} tone="red" />
        <MetricCard label="Assigned Owners" value={assignedOwnerCount} delta="Unique assigned owners" icon={UserRoundCheck} tone="green" />
      </div>
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
          getRowKey={(incident) => incident.id}
          emptyMessage="No incidents logged yet."
        />
      </div>
      {canCreateIncident && showIncidentForm && (
        <IncidentForm
          onCreated={(incident) => {
            setIncidentRecords((current) => [incident, ...current]);
            setShowIncidentForm(false);
            setToast({
              title: "Incident logged",
              message: `${incident.incidentCode} is now in the incident register.`
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
  idRaw: incident.id,
  id: incident.incidentCode ?? incident.id,
  owner: incident.assignedTo?.name ?? incident.reportedBy?.name ?? incident.owner ?? "Unassigned",
  place: incident.location ?? incident.place ?? "No location",
  time: incident.createdAt ? new Date(incident.createdAt).toLocaleString() : incident.time,
  details: incident.details ?? "No details captured yet.",
  droneLabel: incident.drone?.droneCode ?? incident.drone ?? "",
  missionLabel: incident.mission?.missionCode ?? incident.mission?.name ?? incident.mission ?? "",
  typeLabel: incident.type?.toString().toLowerCase().replaceAll("_", " ")
});

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default Incidents;
