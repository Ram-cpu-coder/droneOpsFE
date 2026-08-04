import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, MapPinned, Route, Save, Search, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import { useApiResource } from "../../../hooks/useApiResource";
import { droneOpsApi } from "../../../services/droneOpsApi";
import RoutePointMapPicker from "./RoutePointMapPicker";

const missionTypes = ["Mapping", "Inspection", "Security", "Delivery", "Training", "Emergency Response"];
const missionStatuses = ["PLANNED", "APPROVED", "ACTIVE", "COMPLETED", "ABORTED", "CANCELLED"];

const initialForm = {
  missionCode: "",
  name: "",
  type: "",
  droneId: "",
  pilotId: "",
  launchSite: "",
  operatingArea: "",
  locationPlan: {
    launchSite: null,
    operatingArea: null
  },
  plannedDate: "",
  startTime: "",
  endTime: "",
  status: "PLANNED",
  waypointNotes: "",
  routeTrackingEnabled: true,
  waypoints: [
    { label: "Start point", latitude: "", longitude: "", altitude: "" },
    { label: "End point", latitude: "", longitude: "", altitude: "" }
  ]
};

const MissionForm = ({ mission = null, mode = "create", canEditStatus = false, onCreated, onUpdated, onCancel }) => {
  const [form, setForm] = useState(() => toFormState(mission));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const errorRef = useRef(null);
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const loadUsers = useCallback(() => droneOpsApi.users.list(), []);
  const { data: drones } = useApiResource(loadDrones, []);
  const { data: users } = useApiResource(loadUsers, []);

  useEffect(() => {
    setForm(toFormState(mission));
  }, [mission]);

  useEffect(() => {
    if (!error) return;

    window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [error]);

  const droneOptions = useMemo(
    () => drones
      .filter((drone) => drone.status === "AVAILABLE" || drone.id === form.droneId)
      .map((drone) => ({
        value: drone.id,
        label: drone.droneCode ?? drone.id,
        title: [drone.manufacturer, drone.model].filter(Boolean).join(" ") || "Drone",
        meta: [formatReadableValue(drone.status), drone.batteryType].filter(Boolean).join(" | "),
        searchText: `${drone.droneCode ?? drone.id} ${drone.model ?? ""} ${drone.manufacturer ?? ""} ${drone.serialNumber ?? ""}`.toLowerCase()
      })),
    [drones, form.droneId]
  );

  const pilotOptions = useMemo(
    () => users
      .filter((user) => ["REMOTE_PILOT", "OPERATIONS_MANAGER", "SYSTEM_ADMINISTRATOR"].includes(user.role))
      .map((user) => ({
        value: user.id,
        label: user.name,
        title: user.name,
        meta: user.email ?? "Available for assignment",
        searchText: `${user.name} ${user.email ?? ""} ${user.role ?? ""}`.toLowerCase()
      })),
    [users]
  );

  const selectedDrone = useMemo(
    () => drones.find((drone) => drone.id === form.droneId) ?? null,
    [drones, form.droneId]
  );

  const selectedPilot = useMemo(
    () => users.find((user) => user.id === form.pilotId) ?? null,
    [users, form.pilotId]
  );

  const scheduleError = getScheduleError(form);
  const hasLaunchSite = hasCoordinates(form.locationPlan.launchSite);
  const hasOperatingArea = hasCoordinates(form.locationPlan.operatingArea);
  const routeStart = form.waypoints[0];
  const routeEnd = form.waypoints[form.waypoints.length - 1];
  const hasRouteStart = hasCoordinates(routeStart);
  const hasRouteEnd = hasCoordinates(routeEnd);
  const operatingAreaError = getOperatingAreaCoverageError(form.locationPlan.operatingArea, routeStart, routeEnd);
  const readinessItems = [
    { label: "Mission name", complete: Boolean(form.name.trim()), detail: form.name.trim() || "Required" },
    { label: "Mission type", complete: Boolean(form.type), detail: form.type || "Required" },
    { label: "Schedule", complete: Boolean(form.plannedDate && form.startTime && form.endTime && !scheduleError), detail: scheduleError || "Date and time ready" },
    { label: "Drone", complete: Boolean(form.droneId), detail: selectedDrone ? `${selectedDrone.droneCode ?? selectedDrone.id} - ${selectedDrone.model ?? "Selected"}` : "Required" },
    { label: "Remote pilot", complete: Boolean(form.pilotId), detail: selectedPilot?.name ?? "Required" },
    { label: "Launch site", complete: hasLaunchSite, detail: hasLaunchSite ? "Selected on map" : "Required" },
    { label: "Operating area", complete: hasOperatingArea && !operatingAreaError, detail: operatingAreaError || (hasOperatingArea ? "Covers route start and end" : "Required") },
    { label: "Route path", complete: hasRouteStart && hasRouteEnd, detail: hasRouteStart && hasRouteEnd ? `${form.waypoints.filter(hasCoordinates).length} point(s) selected` : "Start and end required" }
  ];
  const isMissionReady = readinessItems.every((item) => item.complete);

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
      ...(form.locationPlan.launchSite ? { launchSite: form.locationPlan.launchSite } : {}),
      ...(form.locationPlan.operatingArea ? { operatingArea: form.locationPlan.operatingArea } : {}),
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
      const firstIncompleteItem = readinessItems.find((item) => !item.complete);

      if (firstIncompleteItem) {
        setError(`${firstIncompleteItem.label} is required before creating the mission.`);
        return;
      }

      if (scheduleError) {
        setError(scheduleError);
        return;
      }

      if ((plannedRoute?.waypoints?.length ?? 0) < 2) {
        setError("Add at least a start point and an end point on the mission planning map.");
        return;
      }

      if (operatingAreaError) {
        setError(operatingAreaError);
        return;
      }

      const payload = {
        ...(mode === "edit" && form.missionCode ? { missionCode: form.missionCode } : {}),
        name: form.name,
        type: form.type,
        droneId: form.droneId || undefined,
        pilotId: form.pilotId || undefined,
        launchSite: formatLocationLabel(form.locationPlan.launchSite),
        operatingArea: formatLocationLabel(form.locationPlan.operatingArea),
        plannedStartAt: buildDateTime(form.plannedDate, form.startTime),
        plannedEndAt: buildDateTime(form.plannedDate, form.endTime),
        plannedRoute,
        ...(canEditStatus && mode === "edit" ? { status: form.status } : {})
      };

      const savedMission = mode === "edit" && mission?.uuid
        ? await droneOpsApi.missions.update(mission.uuid, payload)
        : await droneOpsApi.missions.create(payload);

      setForm(initialForm);
      if (mode === "edit") {
        onUpdated?.({
          ...savedMission,
          missionCode: savedMission.missionCode ?? form.missionCode
        });
      } else {
        onCreated?.({
          ...savedMission,
          missionCode: savedMission.missionCode ?? form.missionCode
        });
      }
    } catch (requestError) {
      setError(getMissionSubmitErrorMessage(requestError.message));
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
          {error && <div className="auth-alert" ref={errorRef}>{error}</div>}

          <div className="form-layout modal-form-layout">
            <FormSection icon={Route} title="Mission Details">
              <Field label="Mission Name" value={form.name} onChange={(value) => updateField("name", value)} placeholder="North Ridge Inspection" required />
              <SelectField label="Mission Type" value={form.type} onChange={(value) => updateField("type", value)} options={missionTypes} required />
            </FormSection>

            <FormSection icon={UserRound} title="Assignment">
              <SearchableSelectField
                label={`Assigned Drone (${droneOptions.length})`}
                value={form.droneId}
                onChange={(value) => updateField("droneId", value)}
                options={droneOptions}
                placeholder="Search drone ID, model, manufacturer"
              />
              <AssignmentSummaryCard type="drone" item={selectedDrone} />
              <SearchableSelectField
                label={`Remote Pilot (${pilotOptions.length})`}
                value={form.pilotId}
                onChange={(value) => updateField("pilotId", value)}
                options={pilotOptions}
                placeholder="Search pilot name, email, role"
              />
              <AssignmentSummaryCard type="pilot" item={selectedPilot} />
            </FormSection>

            <FormSection icon={CalendarClock} title="Schedule">
              <Field label="Planned Date" type="date" value={form.plannedDate} onChange={(value) => updateField("plannedDate", value)} />
              <Field label="Start Time" type="time" value={form.startTime} onChange={(value) => updateField("startTime", value)} />
              <Field label="End Time" type="time" value={form.endTime} onChange={(value) => updateField("endTime", value)} />
              {scheduleError && <InlineFormAlert message={scheduleError} />}
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

            <FormSection icon={MapPinned} title="Mission Planning Map" className="wide-form-section">
              <div className="route-tracking-panel">
                <RoutePointMapPicker
                  value={form.waypoints}
                  onChange={(waypoints) => updateField("waypoints", waypoints)}
                  locationPlan={form.locationPlan}
                  onLocationPlanChange={(locationPlan) => updateField("locationPlan", locationPlan)}
                />
                <ReadinessChecklist items={readinessItems} />
              </div>
            </FormSection>
          </div>
        </div>

        <div className="modal-footer">
          <div className={`mission-readiness-footer ${isMissionReady ? "ready" : ""}`}>
            {isMissionReady ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{isMissionReady ? "Mission plan is ready to create." : "Complete the readiness checklist before creating this mission."}</span>
          </div>
          <div className="form-actions">
            <ActionButton onClick={onCancel}>Cancel</ActionButton>
            <ActionButton icon={Save} variant="primary" type="submit" disabled={isSaving || !isMissionReady}>
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

  const inputValue = isOpen ? query : (selectedOption ? (typeof selectedOption === "string" ? selectedOption : `${selectedOption.label}${selectedOption.title ? ` - ${selectedOption.title}` : ""}`) : "");

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
              const optionTitle = typeof option === "string" ? option : option.title;
              const optionMeta = typeof option === "string" ? "" : option.meta;
              const optionBadge = typeof option === "string" ? "" : option.badge;
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
                  <span className="combo-option-main">
                    <span className="combo-option-copy">
                      <strong>{optionTitle || optionLabel}</strong>
                      <small>{optionMeta || optionLabel}</small>
                    </span>
                    {optionBadge && <span className="combo-option-badge">{optionBadge}</span>}
                  </span>
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

const InlineFormAlert = ({ message }) => (
  <div className="inline-form-alert">
    <AlertTriangle size={15} />
    <span>{message}</span>
  </div>
);

const AssignmentSummaryCard = ({ type, item }) => {
  if (!item) {
    return (
      <div className="assignment-summary-card empty">
        <span>{type === "drone" ? "No drone selected" : "No pilot selected"}</span>
        <strong>{type === "drone" ? "Select an available drone" : "Select a remote pilot"}</strong>
      </div>
    );
  }

  if (type === "drone") {
    return (
      <div className="assignment-summary-card">
        <span>{item.droneCode ?? item.id}</span>
        <strong>{[item.manufacturer, item.model].filter(Boolean).join(" ") || "Drone selected"}</strong>
        <small>Status: {formatReadableValue(item.status)}{item.batteryType ? ` | Battery: ${item.batteryType}` : ""}</small>
      </div>
    );
  }

  return (
    <div className="assignment-summary-card">
      <span>{formatReadableValue(item.role)}</span>
      <strong>{item.name}</strong>
      <small>{item.email ?? "Pilot selected"}</small>
    </div>
  );
};

const ReadinessChecklist = ({ items }) => (
  <div className="mission-readiness-checklist">
    <div className="mission-readiness-heading">
      <CheckCircle2 size={17} />
      <strong>Mission readiness</strong>
    </div>
    <div className="mission-readiness-grid">
      {items.map((item) => (
        <div className={`mission-readiness-item ${item.complete ? "complete" : ""}`} key={item.label}>
          {item.complete ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <div>
            <span>{item.label}</span>
            <small>{item.detail}</small>
          </div>
        </div>
      ))}
    </div>
  </div>
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
    locationPlan: {
      launchSite: mission.plannedRoute?.launchSite ?? toSavedLocation(mission.launchSite),
      operatingArea: mission.plannedRoute?.operatingArea ?? toSavedLocation(mission.operatingArea)
    },
    plannedDate: plannedStart ? plannedStart.toISOString().slice(0, 10) : "",
    startTime: plannedStart ? plannedStart.toTimeString().slice(0, 5) : "",
    endTime: plannedEnd ? plannedEnd.toTimeString().slice(0, 5) : "",
    status: mission.rawStatus ?? mission.status ?? "PLANNED",
    waypointNotes: mission.plannedRoute?.notes ?? mission.routeNotes ?? "",
    routeTrackingEnabled: toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates ?? mission.routeWaypoints).length >= 2,
    waypoints: toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates ?? mission.routeWaypoints)
  };
};

const formatLocationLabel = (location) => {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return undefined;
  const label = location.label || "Selected on map";
  return `${label} (${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)})`;
};

const getScheduleError = (form) => {
  if (!form.plannedDate && !form.startTime && !form.endTime) return "";
  if (!form.plannedDate || !form.startTime || !form.endTime) return "Planned date, start time, and end time are required.";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const plannedDate = new Date(`${form.plannedDate}T00:00`);
  if (plannedDate < today) return "Planned date cannot be in the past.";

  const plannedStart = new Date(`${form.plannedDate}T${form.startTime}`);
  const plannedEnd = new Date(`${form.plannedDate}T${form.endTime}`);
  if (plannedEnd <= plannedStart) return "End time must be after start time.";

  return "";
};

const getMissionSubmitErrorMessage = (message = "") => {
  const normalizedMessage = message.toLowerCase().trim();

  if (normalizedMessage.includes("body: required") || normalizedMessage === "required") {
    return "Mission could not be submitted because the backend received an empty request body. Refresh the page and try again. If it still happens, restart the backend server because it is still running the old validator.";
  }

  if (normalizedMessage.includes("jwt expired") || normalizedMessage.includes("invalid token")) {
    return "Your login session expired. Please log in again, then create the mission.";
  }

  return message || "Mission could not be created. Please review the required fields and try again.";
};

const hasCoordinates = (point) => {
  if (!point) return false;
  if (point.latitude === "" || point.longitude === "" || point.latitude == null || point.longitude == null) return false;
  return Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
};

const getOperatingAreaCoverageError = (operatingArea, routeStart, routeEnd) => {
  if (!hasCoordinates(operatingArea) || !hasCoordinates(routeStart) || !hasCoordinates(routeEnd)) return "";

  const radiusMeters = Number(operatingArea.radiusMeters) || 500;
  const uncoveredPoints = [
    { label: "start point", point: routeStart },
    { label: "end point", point: routeEnd }
  ].filter(({ point }) => getDistanceMeters(operatingArea, point) > radiusMeters);

  if (!uncoveredPoints.length) return "";

  return `Operating area must cover the route ${uncoveredPoints.map(({ label }) => label).join(" and ")}. Increase the operating radius or move the operating area.`;
};

const getDistanceMeters = (from, to) => {
  const earthRadiusMeters = 6371000;
  const fromLat = toRadians(Number(from.latitude));
  const toLat = toRadians(Number(to.latitude));
  const deltaLat = toRadians(Number(to.latitude) - Number(from.latitude));
  const deltaLng = toRadians(Number(to.longitude) - Number(from.longitude));
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const toRadians = (degrees) => degrees * (Math.PI / 180);

const formatReadableValue = (value = "") => (
  value.toString().toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
);

const toSavedLocation = (value) => {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
  if (!match) return null;

  return {
    label: value.replace(/\s*\(.+\)\s*$/, ""),
    latitude: Number(match[1]),
    longitude: Number(match[2])
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
