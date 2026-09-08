import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Save, X } from "lucide-react";
import { useApiResource } from "../../hooks/useApiResource";
import { droneOpsApi } from "../../services/droneOpsApi";
import { hasClientPermission } from "../../features/auth/accessControl";
import DataTable from "../../components/common/DataTable";
import SectionHeader from "../../components/common/SectionHeader";
import ActionButton from "../../components/common/ActionButton";
import StatusBadge from "../../components/common/StatusBadge";

const blank = (droneId = "") => ({
  droneId,
  type: "Scheduled inspection",
  triggerType: "CALENDAR",
  status: "SCHEDULED",
  dueAt: "",
  notes: "",
  correctiveAction: ""
});

export default function Maintenance({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const load = useCallback(() => droneOpsApi.maintenance.list(), []);
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const { data: records, error, isLoading, refresh, setData } = useApiResource(load);
  const { data: drones, error: droneError } = useApiResource(loadDrones);
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const canManage = hasClientPermission(user, "maintenance:manage");

  const openSchedule = useCallback((droneId = "") => {
    setId(null);
    setForm(blank(droneId));
    setEditing(true);
    setFeedback("");
  }, []);

  useEffect(() => {
    const scheduleRequest = location.state?.scheduleMaintenance;
    if (!scheduleRequest?.droneId) return;
    openSchedule(scheduleRequest.droneId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, openSchedule]);

  const release = async (recordId) => {
    setBusy(true);
    setFeedback("");
    try {
      await droneOpsApi.maintenance.release(recordId);
      await refresh();
      setFeedback("Drone returned to service.");
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (record) => {
    if (!canManage) return;
    setId(record.id);
    setForm({
      droneId: record.droneId,
      type: record.type,
      triggerType: record.triggerType,
      status: record.status,
      dueAt: record.dueAt?.slice(0, 10) ?? "",
      notes: record.notes ?? "",
      correctiveAction: record.correctiveAction ?? ""
    });
    setEditing(true);
    setFeedback("");
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFeedback("");
    try {
      const payload = {
        ...form,
        status: canManage ? form.status : "SCHEDULED",
        dueAt: form.dueAt ? new Date(`${form.dueAt}T00:00:00Z`).toISOString() : null
      };
      const record = id ? await droneOpsApi.maintenance.update(id, payload) : await droneOpsApi.maintenance.create(payload);
      setData((rows) => [record, ...rows.filter((row) => row.id !== record.id)]);
      setEditing(false);
      setFeedback("Maintenance record saved.");
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = records.map((record) => ({
    ...record,
    droneCode: record.drone?.droneCode,
    displayStatus: !["COMPLETED", "CANCELLED"].includes(record.status) && record.dueAt && new Date(record.dueAt) < new Date()
      ? "OVERDUE"
      : record.status,
    due: record.dueAt?.slice(0, 10) || "Not scheduled",
    completed: record.completedAt?.slice(0, 10) || "--"
  }));
  const columns = [
    { key: "droneCode", label: "Drone" },
    {
      key: "type",
      label: "Work",
      render: (record) => (
        <button className="link-button strong-link" type="button" onClick={() => edit(record)}>
          {record.type}
        </button>
      )
    },
    { key: "displayStatus", label: "Status", filterable: true, render: (record) => <StatusBadge>{record.displayStatus}</StatusBadge> },
    { key: "due", label: "Due" },
    { key: "completed", label: "Last serviced", render: (record) => record.completed }
  ];
  const closed = ["COMPLETED", "CANCELLED"].includes(form.status) && records.some((record) => record.id === id && ["COMPLETED", "CANCELLED"].includes(record.status));
  const canSaveCurrentRecord = !closed && (!id || canManage);

  return (
    <div className="page-stack operations-module">
      {canManage && records
        .filter((record) => record.status === "COMPLETED" && record.drone?.status === "MAINTENANCE")
        .filter((record, index, completedRows) => completedRows.findIndex((item) => item.droneId === record.droneId) === index)
        .map((record) => (
          <div className="operations-toolbar" key={record.id}>
            <span>{record.drone.droneCode}: service completed, awaiting release</span>
            <button type="button" className="primary-button" disabled={busy} onClick={() => release(record.id)}>Return to service</button>
          </div>
        ))}

      {(error || droneError) && <div className="auth-alert" role="alert">{error || droneError}</div>}
      {feedback && <p role="status">{feedback}</p>}

      <div className="panel">
        <SectionHeader
          title="Maintenance Records"
          action={(
            <div className="form-actions">
              <ActionButton icon={RefreshCw} isLoading={isLoading} onClick={refresh}>Refresh</ActionButton>
              <ActionButton variant="primary" icon={Plus} onClick={() => openSchedule()}>Schedule maintenance</ActionButton>
            </div>
          )}
        />
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(record) => record.id}
          onRowClick={canManage ? edit : undefined}
          searchPlaceholder="Search maintenance"
          emptyMessage={isLoading ? "Loading maintenance..." : "No maintenance records."}
        />
      </div>

      <div className="panel">
        <SectionHeader title="Service Schedule" />
        <DataTable
          rows={drones}
          getRowKey={(drone) => drone.id}
          columns={[
            { key: "droneCode", label: "Drone" },
            { key: "status", label: "Status", render: (drone) => <StatusBadge>{drone.maintenanceOverdue ? "OVERDUE" : drone.status}</StatusBadge> },
            { key: "flightHours", label: "Flight Hours" },
            { key: "lastServicedDate", label: "Last serviced", render: (drone) => drone.lastServicedDate?.slice(0, 10) || "Not recorded" },
            { key: "nextMaintenanceDate", label: "Next inspection", render: (drone) => drone.nextMaintenanceDate?.slice(0, 10) || "Not scheduled" },
            { key: "certificationStatus", label: "Certification", render: (drone) => <StatusBadge>{drone.certificationStatus}</StatusBadge> }
          ]}
        />
      </div>

      {editing && (
        <div className="modal-backdrop">
          <form className="modal-dialog registration-dialog maintenance-form-dialog" role="dialog" aria-modal="true" aria-label="Maintenance record" onSubmit={save}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Aircraft Maintenance</p>
                <h2>{id ? "Maintenance record" : "Schedule maintenance"}</h2>
              </div>
              <button className="icon-button danger" type="button" disabled={busy} onClick={() => setEditing(false)} aria-label="Close maintenance record" title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <fieldset className="operations-form form-grid" disabled={!canSaveCurrentRecord || busy}>
                <label className="field">Drone
                  <select required disabled={!!id} value={form.droneId} onChange={(e) => setForm((current) => ({ ...current, droneId: e.target.value }))}>
                    <option value="">Select drone</option>
                    {drones.map((drone) => <option key={drone.id} value={drone.id}>{drone.droneCode} · {drone.flightHours} hours</option>)}
                  </select>
                </label>
                <label className="field">Work type
                  <input required value={form.type} onChange={(e) => setForm((current) => ({ ...current, type: e.target.value }))} />
                </label>
                <label className="field">Trigger
                  <select value={form.triggerType} onChange={(e) => setForm((current) => ({ ...current, triggerType: e.target.value }))}>
                    {["CALENDAR", "HOURS", "EVENT"].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                {canManage && (
                  <label className="field">Status
                    <select value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}>
                      {["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"].map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                )}
                <label className="field">Due date
                  <input type="date" value={form.dueAt} onChange={(e) => setForm((current) => ({ ...current, dueAt: e.target.value }))} />
                </label>
                <label className="field">Notes
                  <textarea value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
                </label>
                {canManage && (
                  <label className="field">Work performed
                    <textarea required={form.status === "COMPLETED"} value={form.correctiveAction} onChange={(e) => setForm((current) => ({ ...current, correctiveAction: e.target.value }))} />
                  </label>
                )}
              </fieldset>
            </div>
            <div className="modal-footer">
              {canSaveCurrentRecord && (
                <ActionButton variant="primary" icon={Save} disabled={busy} isLoading={busy} type="submit">
                  Save maintenance
                </ActionButton>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
