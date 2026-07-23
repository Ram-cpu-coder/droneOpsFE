import { CalendarClock, ChevronDown, MapPinned, Route, Save, Search, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import { drones, missions } from "../../../data/droneOpsData";
import RoutePointMapPicker from "./RoutePointMapPicker";

const missionTypes = ["Mapping", "Inspection", "Security", "Delivery", "Training", "Emergency Response"];
const missionStatuses = ["PLANNED", "APPROVED", "ACTIVE", "COMPLETED", "ABORTED", "CANCELLED"];
const pilotOptionsSource = Array.from(new Set(missions.map((mission) => mission.pilot).filter(Boolean))).map((pilot) => ({
  id: pilot,
  name: pilot,
  email: `${pilot.toLowerCase().replaceAll(" ", ".")}@droneops.local`,
  role: "REMOTE_PILOT"
}));

const initialForm = {
  missionCode: "",
  name: "",
  type: "",
  droneId: "",
  pilotId: "",
  launchSite: "",
  operatingArea: "",
  plannedDate: "",
  startTime: "",
  endTime: "",
  status: "PLANNED",
  waypointNotes: "",
  routeTrackingEnabled: false,
  waypoints: []
};

const MissionForm = ({ mission = null, mode = "create", canEditStatus = false, onCreated, onUpdated, onCancel }) => {
  const [form, setForm] = useState(() => toFormState(mission));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    setForm(toFormState(mission));
  }, [mission]);

  const droneOptions = useMemo(
    () => drones
      .filter((drone) => ["AVAILABLE", "IN_MISSION"].includes(drone.status) || drone.id === form.droneId)
      .map((drone) => ({
        value: drone.id,
        label: `${drone.droneCode ?? drone.id} - ${drone.model}`,
        searchText: `${drone.droneCode ?? drone.id} ${drone.model ?? ""} ${drone.manufacturer ?? ""} ${drone.serialNumber ?? ""}`.toLowerCase()
      })),
    [drones, form.droneId]
  );

  const pilotOptions = useMemo(
    () => pilotOptionsSource
      .filter((user) => ["REMOTE_PILOT", "OPERATIONS_MANAGER", "SYSTEM_ADMINISTRATOR"].includes(user.role))
      .map((user) => ({
        value: user.id,
        label: user.name,
        searchText: `${user.name} ${user.email ?? ""} ${user.role ?? ""}`.toLowerCase()
      })),
    []
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel?.();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleRouteTracking = (enabled) => {
    setForm((current) => ({
      ...current,
      routeTrackingEnabled: enabled,
      waypoints: enabled && current.waypoints.length === 0
        ? [
            { label: "Start point", latitude: "", longitude: "", altitude: "" },
            { label: "End point", latitude: "", longitude: "", altitude: "" }
          ]
        : current.waypoints
    }));
  };

  const buildDateTime = (date, time) => {
    if (!date || !time) return undefined;
    return new Date(`${date}T${time}`).toISOString();
  };

  const buildPlannedRoute = () => {
    const waypoints = form.routeTrackingEnabled ? form.waypoints
      .map((waypoint) => ({
        label: waypoint.label?.trim() || undefined,
        latitude: Number(waypoint.latitude),
        longitude: Number(waypoint.longitude),
        altitude: waypoint.altitude === "" ? undefined : Number(waypoint.altitude)
      }))
      .filter((waypoint) => Number.isFinite(waypoint.latitude) && Number.isFinite(waypoint.longitude)) : [];

    const route = {
      ...(form.waypointNotes ? { notes: form.waypointNotes } : {}),
      ...(waypoints.length ? { waypoints, arrivalRadiusMeters: 50 } : {})
    };

    return Object.keys(route).length ? route : undefined;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const plannedRoute = buildPlannedRoute();
      if (form.routeTrackingEnabled && (plannedRoute?.waypoints?.length ?? 0) < 2) {
        setError("Add at least a start point and an end point to calculate progress from GPS.");
        return;
      }

      const selectedDrone = drones.find((drone) => drone.id === form.droneId);
      const selectedPilot = pilotOptionsSource.find((pilot) => pilot.id === form.pilotId);
      const payload = {
        id: mission?.uuid ?? mission?.id ?? form.missionCode,
        missionCode: form.missionCode,
        name: form.name,
        type: form.type,
        droneId: form.droneId || undefined,
        pilotId: form.pilotId || undefined,
        drone: selectedDrone?.id ?? form.droneId ?? "Unassigned",
        pilot: selectedPilot?.name ?? form.pilotId ?? "Unassigned",
        launchSite: form.launchSite || undefined,
        operatingArea: form.operatingArea || undefined,
        area: form.operatingArea || undefined,
        plannedStartAt: buildDateTime(form.plannedDate, form.startTime),
        plannedEndAt: buildDateTime(form.plannedDate, form.endTime),
        start: form.startTime || mission?.start || "Not scheduled",
        eta: form.endTime ? `Ends ${form.endTime}` : mission?.eta ?? "Not scheduled",
        progress: mode === "edit" ? Number(mission?.progress ?? 0) : 0,
        risk: mission?.risk ?? "Pending",
        checkpoints: mission?.checkpoints ?? "0 / 0",
        createdAt: mission?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        plannedRoute,
        status: canEditStatus && mode === "edit" ? form.status : (mission?.rawStatus ?? mission?.status ?? form.status)
      };

      setForm(initialForm);
      setIsConfirmed(false);
      if (mode === "edit") {
        onUpdated?.({
          ...payload,
          missionCode: payload.missionCode ?? form.missionCode
        });
      } else {
        onCreated?.({
          ...payload,
          missionCode: payload.missionCode ?? form.missionCode
        });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel?.()}>
      <form className="modal-dialog registration-dialog" role="dialog" aria-modal="true" aria-labelledby="create-mission-title" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Mission Planning</p>
            <h2 id="create-mission-title">{mode === "edit" ? "Update Mission" : "Create Mission"}</h2>
            <p>{mode === "edit" ? "Adjust the mission plan, assignments, and schedule." : "Set the mission details, assign a drone and pilot, and schedule the operation."}</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close mission form">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-alert">{error}</div>}

          <div className="form-layout modal-form-layout">
            <FormSection icon={Route} title="Mission Details">
              <Field label="Mission ID" value={form.missionCode} onChange={(value) => updateField("missionCode", value)} placeholder="MIS-1046" required />
              <Field label="Mission Name" value={form.name} onChange={(value) => updateField("name", value)} placeholder="North Ridge Inspection" required />
              <SelectField label="Mission Type" value={form.type} onChange={(value) => updateField("type", value)} options={missionTypes} required />
              <Field label="Operating Area" value={form.operatingArea} onChange={(value) => updateField("operatingArea", value)} placeholder="Site A - Zone 1" />
            </FormSection>

            <FormSection icon={UserRound} title="Assignment">
              <SearchableSelectField
                label={`Assigned Drone (${droneOptions.length})`}
                value={form.droneId}
                onChange={(value) => updateField("droneId", value)}
                options={droneOptions}
                placeholder="Search drone ID, model, manufacturer"
              />
              <SearchableSelectField
                label={`Remote Pilot (${pilotOptions.length})`}
                value={form.pilotId}
                onChange={(value) => updateField("pilotId", value)}
                options={pilotOptions}
                placeholder="Search pilot name, email, role"
              />
              <Field label="Launch Site" value={form.launchSite} onChange={(value) => updateField("launchSite", value)} placeholder="Main dock / roof pad" />
            </FormSection>

            <FormSection icon={CalendarClock} title="Schedule">
              <Field label="Planned Date" type="date" value={form.plannedDate} onChange={(value) => updateField("plannedDate", value)} />
              <Field label="Start Time" type="time" value={form.startTime} onChange={(value) => updateField("startTime", value)} />
              <Field label="End Time" type="time" value={form.endTime} onChange={(value) => updateField("endTime", value)} />
              {canEditStatus && mode === "edit" && (
                <SelectField label="Mission Status" value={form.status} onChange={(value) => updateField("status", value)} options={missionStatuses} />
              )}
            </FormSection>

            <FormSection icon={MapPinned} title="Route Notes">
              <TextareaField
                label="Route / Waypoint Notes"
                value={form.waypointNotes}
                onChange={(value) => updateField("waypointNotes", value)}
                placeholder="Add route notes, key waypoints, or site instructions."
              />
            </FormSection>

            <FormSection icon={MapPinned} title="Drone Path" className="wide-form-section">
              <div className="route-tracking-panel">
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={form.routeTrackingEnabled}
                    onChange={(event) => toggleRouteTracking(event.target.checked)}
                  />
                  <span>
                    <strong>Track mission progress from the drone path</strong>
                    <small>Optional. Select the start, end, and any stops on the map. DroneOps stores the coordinates internally.</small>
                  </span>
                </label>

                {form.routeTrackingEnabled && (
                  <RoutePointMapPicker
                    value={form.waypoints}
                    onChange={(waypoints) => updateField("waypoints", waypoints)}
                  />
                )}
              </div>
            </FormSection>
          </div>
        </div>

        <div className="modal-footer">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={isConfirmed}
              onChange={(event) => setIsConfirmed(event.target.checked)}
              required
            />
            <span>I confirm the mission details, assigned drone, and pilot information are correct.</span>
          </label>
          <div className="form-actions">
            <ActionButton onClick={onCancel}>Cancel</ActionButton>
            <ActionButton icon={Save} variant="primary" type="submit" disabled={isSaving || !isConfirmed}>
              {isSaving ? (mode === "edit" ? "Saving" : "Creating") : (mode === "edit" ? "Save Mission" : "Create Mission")}
            </ActionButton>
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
};

const FormSection = ({ icon: Icon, title, children, className = "" }) => (
  <section className={`form-section ${className}`}>
    <div className="form-section-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
    <div className="form-grid">{children}</div>
  </section>
);

const Field = ({ label, type = "text", placeholder = "", value, onChange, required = false }) => (
  <label className="field">
    <span>{label}</span>
    <input
      type={type}
      step={type === "number" ? "any" : undefined}
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </label>
);

const SelectField = ({ label, options, value, onChange, required = false }) => (
  <label className="field">
    <span>{label}</span>
    <select value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} required={required}>
      <option value="" disabled>Select {label.toLowerCase()}</option>
      {options.map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        return <option key={value} value={value}>{label}</option>;
      })}
    </select>
  </label>
);

const SearchableSelectField = ({
  label,
  options,
  value,
  onChange,
  placeholder = "Search"
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const selectedOption = useMemo(
    () => options.find((option) => (typeof option === "string" ? option : option.value) === value) ?? null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const searchText = typeof option === "string"
        ? option.toLowerCase()
        : (option.searchText ?? option.label ?? "").toLowerCase();
      return searchText.includes(normalizedQuery);
    });
  }, [options, query]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const inputValue = isOpen ? query : (selectedOption ? (typeof selectedOption === "string" ? selectedOption : selectedOption.label) : "");

  return (
    <div className="field searchable-select-field" ref={wrapperRef}>
      <span>{label}</span>
      <div className={`field-search-input combo-input ${isOpen ? "open" : ""}`}>
        <Search size={16} />
        <input
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder={selectedOption ? "" : placeholder}
        />
        <button type="button" className="combo-toggle" onClick={() => setIsOpen((current) => !current)} aria-label={`Toggle ${label.toLowerCase()} options`}>
          <ChevronDown size={16} />
        </button>
      </div>
      <input type="hidden" value={value ?? ""} readOnly />
      {isOpen && (
        <div className="combo-options" role="listbox" aria-label={label}>
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const optionLabel = typeof option === "string" ? option : option.label;
              const isSelected = optionValue === value;

              return (
                <button
                  key={optionValue}
                  type="button"
                  className={`combo-option ${isSelected ? "selected" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange?.(optionValue);
                    setQuery("");
                    setIsOpen(false);
                  }}
                >
                  <span>{optionLabel}</span>
                </button>
              );
            })
          ) : (
            <div className="combo-empty">No drones matched your search.</div>
          )}
        </div>
      )}
    </div>
  );
};

const TextareaField = ({ label, placeholder = "", value, onChange }) => (
  <label className="field wide-field">
    <span>{label}</span>
    <textarea value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} rows={4} />
  </label>
);

const toFormState = (mission) => {
  if (!mission) return initialForm;

  const plannedStart = mission.plannedStartAt ? new Date(mission.plannedStartAt) : null;
  const plannedEnd = mission.plannedEndAt ? new Date(mission.plannedEndAt) : null;

  return {
    missionCode: mission.missionCode ?? mission.id ?? "",
    name: mission.name ?? "",
    type: mission.type ?? "",
    droneId: mission.drone?.id ?? mission.droneId ?? "",
    pilotId: mission.pilot?.id ?? mission.pilotId ?? "",
    launchSite: mission.launchSite ?? "",
    operatingArea: mission.operatingArea ?? "",
    plannedDate: plannedStart ? plannedStart.toISOString().slice(0, 10) : "",
    startTime: plannedStart ? plannedStart.toTimeString().slice(0, 5) : "",
    endTime: plannedEnd ? plannedEnd.toTimeString().slice(0, 5) : "",
    status: mission.rawStatus ?? mission.status ?? "PLANNED",
    waypointNotes: mission.plannedRoute?.notes ?? mission.routeNotes ?? "",
    routeTrackingEnabled: toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates ?? mission.routeWaypoints).length >= 2,
    waypoints: toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates ?? mission.routeWaypoints)
  };
};

const toWaypointRows = (waypoints) => {
  if (!Array.isArray(waypoints)) return [];

  return waypoints.map((waypoint, index) => {
    if (Array.isArray(waypoint)) {
      return {
        label: `Waypoint ${index + 1}`,
        longitude: waypoint[0] ?? "",
        latitude: waypoint[1] ?? "",
        altitude: waypoint[2] ?? ""
      };
    }

    return {
      label: waypoint.label ?? waypoint.name ?? `Waypoint ${index + 1}`,
      latitude: waypoint.latitude ?? waypoint.lat ?? "",
      longitude: waypoint.longitude ?? waypoint.lng ?? waypoint.lon ?? "",
      altitude: waypoint.altitude ?? waypoint.alt ?? ""
    };
  });
};

export default MissionForm;
