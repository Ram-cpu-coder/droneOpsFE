import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  CalendarClock,
  Eye,
  MapPin,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X
} from "lucide-react";
import { useApiResource } from "../../hooks/useApiResource";
import { droneOpsApi } from "../../services/droneOpsApi";
import { hasClientPermission } from "../../features/auth/accessControl";
import DataTable from "../../components/common/DataTable";
import SectionHeader from "../../components/common/SectionHeader";
import ActionButton from "../../components/common/ActionButton";
import StatusBadge from "../../components/common/StatusBadge";

const dateValue = (value) => (value ? value.slice(0, 10) : "");
const iso = (value) => (value ? new Date(`${value}T00:00:00Z`).toISOString() : null);
const blankLicence = () => ({ type: "RePL", number: "", expiresAt: "" });

const isExpiredDate = (value) => {
  if (!value) return false;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return true;
  expiry.setHours(23, 59, 59, 999);
  return expiry < new Date();
};

const validity = (value) => (!value ? "Not recorded" : isExpiredDate(value) ? "Expired" : "Current");
const statusTone = (value) => {
  const state = validity(value);
  if (state === "Expired") return "danger";
  if (state === "Current") return "success";
  return "neutral";
};

const missionStatus = (mission) => String(mission.status ?? "").toUpperCase();

const missionBelongsToPilot = (mission, pilotId) => {
  if (!pilotId) return false;
  if (mission.pilotId === pilotId || mission.pilot?.id === pilotId) return true;
  return [
    ...(mission.pilots ?? []),
    ...(mission.pilotAssignments ?? [])
  ].some((assignment) => (
    assignment?.id === pilotId
    || assignment?.pilotId === pilotId
    || assignment?.pilot?.id === pilotId
  ));
};

const formatMissionLabel = (mission) => (
  [mission.missionCode, mission.name].filter(Boolean).join(" - ") || mission.id || "Mission"
);

const coordinateFrom = (value) => {
  if (!value || typeof value !== "object") return null;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};

const findLastKnownLocation = (missions) => {
  const ordered = [...missions].sort((left, right) => (
    new Date(right.updatedAt ?? right.plannedEndAt ?? right.plannedStartAt ?? 0)
    - new Date(left.updatedAt ?? left.plannedEndAt ?? left.plannedStartAt ?? 0)
  ));

  for (const mission of ordered) {
    const route = mission.plannedRoute ?? {};
    const candidates = [
      mission.lastTelemetry,
      mission.telemetry,
      mission.progress?.lastTelemetry,
      route.lastTelemetry,
      route.lastKnownLocation,
      route.progress?.lastTelemetry,
      route.progress?.lastKnownLocation,
      Array.isArray(route.telemetry) ? route.telemetry.at(-1) : null,
      Array.isArray(route.waypoints) ? route.waypoints.at(-1) : null,
      Array.isArray(route.points) ? route.points.at(-1) : null
    ];
    const found = candidates.map(coordinateFrom).find(Boolean);
    if (found) return found;
  }

  return "No location recorded";
};

export default function Pilots({ user }) {
  const navigate = useNavigate();
  const loader = useCallback(() => droneOpsApi.pilots.list(), []);
  const canManage = hasClientPermission(user, "pilots:manage");
  const canReadMissions = hasClientPermission(user, "missions:read") || hasClientPermission(user, "missions:assigned");
  const loadMissions = useCallback(() => droneOpsApi.missions.list(), []);
  const { data: pilots, error, isLoading, refresh, setData } = useApiResource(loader);
  const { data: missions } = useApiResource(loadMissions, [], {
    cacheKey: "missions:list:pilot-profile",
    staleMs: 10000,
    enabled: canReadMissions
  });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ certificationExpiry: "", licences: [] });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const primeForm = (pilot) => {
    setForm({
      certificationExpiry: dateValue(pilot.pilotCredentials?.certificationExpiry),
      licences: (pilot.pilotCredentials?.licences ?? []).map((licence) => ({
        ...licence,
        expiresAt: dateValue(licence.expiresAt)
      }))
    });
  };

  const choose = (pilot) => {
    setSelected(pilot);
    setEditing(false);
    setFeedback("");
    primeForm(pilot);
  };

  const editPilot = (pilot) => {
    setSelected(pilot);
    setEditing(true);
    setFeedback("");
    primeForm(pilot);
  };

  const cancelEdit = () => selected && choose(selected);
  const updateLicence = (index, key, value) => setForm((current) => ({
    ...current,
    licences: current.licences.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    ))
  }));

  const selectedMissions = useMemo(
    () => (missions ?? []).filter((mission) => missionBelongsToPilot(mission, selected?.id)),
    [missions, selected?.id]
  );
  const completedMissions = selectedMissions.filter((mission) => missionStatus(mission) === "COMPLETED");
  const assignedMissions = selectedMissions.filter((mission) => missionStatus(mission) !== "COMPLETED");
  const lastKnownLocation = findLastKnownLocation(selectedMissions);
  const openMissionProfile = (mission) => {
    navigate(`/missions/${encodeURIComponent(mission.uuid ?? mission.id)}`);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback("");

    try {
      const pilot = await droneOpsApi.pilots.updateCredentials(selected.id, {
        certificationExpiry: iso(form.certificationExpiry),
        licences: form.licences.map((licence) => ({ ...licence, expiresAt: iso(licence.expiresAt) }))
      });
      setData((rows) => rows.map((row) => (row.id === pilot.id ? pilot : row)));
      choose(pilot);
      setFeedback("Pilot credentials saved.");
    } catch (requestError) {
      setFeedback(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = (pilots ?? []).map((pilot) => ({
    ...pilot,
    licencesText: (pilot.pilotCredentials?.licences ?? [])
      .map((licence) => `${licence.type} ${licence.number}`.trim())
      .join(", ") || "Not recorded",
    expiry: dateValue(pilot.pilotCredentials?.certificationExpiry) || "Not recorded"
  }));

  const columns = [
    {
      key: "name",
      label: "Pilot",
      render: (pilot) => (
        <button type="button" className="link-button strong-link" onClick={() => choose(pilot)}>
          {pilot.name}
        </button>
      )
    },
    { key: "email", label: "Email" },
    { key: "licencesText", label: "Licences" },
    { key: "expiry", label: "Certification Expiry" },
    {
      key: "credentialStatus",
      label: "Status",
      render: (pilot) => <StatusBadge>{validity(pilot.pilotCredentials?.certificationExpiry)}</StatusBadge>
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      searchable: false,
      render: (pilot) => (
        <div className="pilot-row-actions" aria-label={`Actions for ${pilot.name}`}>
          <button type="button" className="icon-button pilot-action-button primary" title="View pilot" aria-label="View pilot" onClick={() => choose(pilot)}>
            <Eye size={16} />
          </button>
          {canManage && (
            <button type="button" className="icon-button pilot-action-button warning" title="Edit credentials" aria-label="Edit credentials" onClick={() => editPilot(pilot)}>
              <Pencil size={16} />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="page-stack operations-module">
      {error && <div className="auth-alert" role="alert">{error}</div>}
      {feedback && <p role="status">{feedback}</p>}
      <div className="panel">
        <SectionHeader
          title="Pilot Directory"
          action={<ActionButton icon={RefreshCw} isLoading={isLoading} onClick={refresh}>Refresh</ActionButton>}
        />
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(pilot) => pilot.id}
          onRowClick={choose}
          searchPlaceholder="Search pilots or licences"
          emptyMessage={isLoading ? "Loading pilots..." : "No registered remote pilots found."}
        />
      </div>

      {selected && (
        <div className="modal-backdrop">
          <div className="modal-dialog profile-dialog registration-dialog pilot-profile-dialog" role="dialog" aria-modal="true" aria-label="Pilot profile">
            <div className="modal-header pilot-profile-header">
              <div>
                <p className="eyebrow">Pilot Profile</p>
                <h2>{selected.name}</h2>
                <p>{selected.email}</p>
              </div>
              <div className="pilot-profile-actions">
                {canManage && !editing && (
                  <button
                    type="button"
                    className="icon-button pilot-action-button primary"
                    title="Edit credentials"
                    aria-label="Edit credentials"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={18} />
                  </button>
                )}
                <button type="button" className="icon-button pilot-action-button danger" title="Close" aria-label="Close" onClick={() => setSelected(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div className="pilot-profile-grid">
                <section className="pilot-operational-grid" aria-label="Pilot operational details">
                  <article>
                    <Plane size={17} />
                    <span>Completed missions</span>
                    <strong>{completedMissions.length}</strong>
                  </article>
                  <article>
                    <BadgeCheck size={17} />
                    <span>Assigned missions</span>
                    <strong>{assignedMissions.length}</strong>
                  </article>
                  <article>
                    <CalendarClock size={17} />
                    <span>Certification expiry</span>
                    <strong>{dateValue(selected.pilotCredentials?.certificationExpiry) || "Not recorded"}</strong>
                  </article>
                  <article>
                    <MapPin size={17} />
                    <span>Last known location</span>
                    <strong>{lastKnownLocation}</strong>
                  </article>
                </section>

                {editing ? (
                  <form className="operations-form pilot-credentials-form" onSubmit={save}>
                    <div className="pilot-form-head">
                      <div>
                        <h3>Edit credentials</h3>
                        <p>Certification and licence records control whether this pilot can be assigned to missions.</p>
                      </div>
                      <span className={`pilot-status-pill ${statusTone(form.certificationExpiry)}`}>{validity(form.certificationExpiry)}</span>
                    </div>
                    <label className="field pilot-date-field">
                      <span><CalendarClock size={15} />Certification expiry</span>
                      <input type="date" value={form.certificationExpiry} onChange={(event) => setForm((current) => ({ ...current, certificationExpiry: event.target.value }))} />
                    </label>
                    <div className="pilot-licence-editor">
                      <div className="pilot-licence-editor-head">
                        <h4>Licences</h4>
                        <button className="secondary-button compact" type="button" onClick={() => setForm((current) => ({ ...current, licences: [...current.licences, blankLicence()] }))}>
                          <Plus size={16} />Add licence
                        </button>
                      </div>
                      {!form.licences.length && <p className="empty-state">No licences added yet.</p>}
                      {form.licences.map((licence, index) => (
                        <section className="pilot-licence-edit-card" key={index}>
                          <div className="pilot-licence-edit-title">
                            <strong>{licence.type || `Licence ${index + 1}`}</strong>
                            <button type="button" className="icon-button pilot-action-button danger" title="Remove licence" aria-label="Remove licence" onClick={() => setForm((current) => ({ ...current, licences: current.licences.filter((_, itemIndex) => itemIndex !== index) }))}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="pilot-licence-fields">
                            <label className="field">Type<input required type="text" value={licence.type} onChange={(event) => updateLicence(index, "type", event.target.value)} /></label>
                            <label className="field">Number<input required type="text" value={licence.number} onChange={(event) => updateLicence(index, "number", event.target.value)} /></label>
                            <label className="field">Expiry<input required type="date" value={licence.expiresAt} onChange={(event) => updateLicence(index, "expiresAt", event.target.value)} /></label>
                          </div>
                        </section>
                      ))}
                    </div>
                    <div className="pilot-form-footer">
                      <button className="secondary-button" type="button" disabled={busy} onClick={cancelEdit}>Cancel</button>
                      <button className="primary-button" disabled={busy} type="submit"><Save size={16} />{busy ? "Saving..." : "Save credentials"}</button>
                    </div>
                  </form>
                ) : (
                  <section className="pilot-credentials-readout">
                    <div className="pilot-form-head">
                      <div>
                        <h3>Credentials</h3>
                        <p>Licence number, expiry, and certification state used for mission assignment.</p>
                      </div>
                      <span className={`pilot-status-pill ${statusTone(selected.pilotCredentials?.certificationExpiry)}`}>{validity(selected.pilotCredentials?.certificationExpiry)}</span>
                    </div>
                    {(selected.pilotCredentials?.licences ?? []).map((licence, index) => (
                      <section className="pilot-licence" key={`${licence.number}-${index}`}>
                        <div><strong>{licence.type}</strong><span>{validity(licence.expiresAt)}</span></div>
                        <dl>
                          <div><dt>Licence number</dt><dd>{licence.number}</dd></div>
                          <div><dt>Expiry</dt><dd>{dateValue(licence.expiresAt) || "Not recorded"}</dd></div>
                        </dl>
                      </section>
                    ))}
                    {!selected.pilotCredentials?.licences?.length && (
                      <p className="empty-state"><ShieldAlert size={16} />No licences recorded. This pilot cannot be assigned to a mission.</p>
                    )}
                  </section>
                )}

                <section className="pilot-mission-list">
                  <div className="pilot-form-head">
                    <div>
                      <h3>Mission history</h3>
                      <p>Completed and currently assigned missions linked to this pilot.</p>
                    </div>
                  </div>
                  {!selectedMissions.length && <p className="empty-state">No mission assignments recorded.</p>}
                  {selectedMissions.slice(0, 6).map((mission) => (
                    <button
                      className="pilot-mission-card"
                      type="button"
                      key={mission.id}
                      onClick={() => openMissionProfile(mission)}
                      aria-label={`Open mission profile for ${formatMissionLabel(mission)}`}
                    >
                      <span>{missionStatus(mission) || "PLANNED"}</span>
                      <strong>{formatMissionLabel(mission)}</strong>
                      <small>{dateValue(mission.plannedStartAt ?? mission.createdAt) || "No date recorded"}</small>
                    </button>
                  ))}
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
