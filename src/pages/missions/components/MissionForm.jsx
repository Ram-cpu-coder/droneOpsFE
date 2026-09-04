import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, LoaderCircle, Lock, MapPinned, Route, Save, Search, ShieldCheck, Unlock, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import HeaderDockedTabs from "../../../components/common/HeaderDockedTabs";
import { useApiResource } from "../../../hooks/useApiResource";
import { droneOpsApi } from "../../../services/droneOpsApi";
import { showFeedback } from "../../../services/feedbackBus";
import RoutePointMapPicker from "./RoutePointMapPicker";

const missionTypes = ["Mapping", "Inspection", "Security", "Delivery", "Training", "Emergency Response"];
const missionStatuses = ["AWAITING_AUTHORITY_APPROVAL", "PLANNED", "APPROVED", "RISK_ASSESSMENT_COMPLETED", "ACTIVE", "COMPLETED", "ABORTED", "CANCELLED"];

const initialForm = {
  missionCode: "",
  name: "",
  type: "",
  droneIds: [],
  pilotIds: [],
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
  routeAccepted: false,
  routeAuthorityAnalysis: null,
  authorityApprovals: {},
  permissionsReviewed: false,
  routeTrackingEnabled: true,
  waypoints: [
    { label: "Start point", latitude: "", longitude: "", altitude: "" },
    { label: "End point", latitude: "", longitude: "", altitude: "" }
  ]
};

const routeAnalysisFeedbackId = "mission-route-analysis";
const missionSaveFeedbackId = "mission-save";

const MissionForm = ({ mission = null, mode = "create", canEditStatus = false, onCreated, onUpdated, onCancel }) => {
  const [form, setForm] = useState(() => toFormState(mission));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalysingRoute, setIsAnalysingRoute] = useState(false);
  const [activeStepId, setActiveStepId] = useState("details");
  const errorRef = useRef(null);
  const loadDrones = useCallback(() => droneOpsApi.drones.list(), []);
  const loadUsers = useCallback(() => droneOpsApi.users.list(), []);
  const loadMissions = useCallback(() => droneOpsApi.missions.list(), []);
  const { data: drones } = useApiResource(loadDrones, [], { cacheKey: "drones:list", staleMs: 10000 });
  const { data: users } = useApiResource(loadUsers, [], { cacheKey: "users:list", staleMs: 30000 });
  const { data: missions } = useApiResource(loadMissions, [], { cacheKey: "missions:list", staleMs: 10000 });
  const { plannedDate, startTime, endTime } = form;
  const bookingContext = useMemo(
    () => createResourceBookingContext({ missions, mission, plannedDate, startTime, endTime }),
    [missions, mission, plannedDate, startTime, endTime]
  );

  useEffect(() => {
    setForm(toFormState(mission));
    setActiveStepId("details");
  }, [mission]);

  useEffect(() => {
    if (!error) return;

    window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [error]);

  const droneOptions = useMemo(
    () => drones
      .filter((drone) => (
        form.droneIds.includes(drone.id) ||
        (drone.status === "AVAILABLE" && !isResourceBookedForMission(bookingContext, drone.id, "drone"))
      ))
      .map((drone) => ({
        value: drone.id,
        label: drone.droneCode ?? drone.id,
        title: [drone.manufacturer, drone.model].filter(Boolean).join(" ") || "Drone",
        meta: formatReadableValue(drone.status),
        searchText: `${drone.droneCode ?? drone.id} ${drone.model ?? ""} ${drone.manufacturer ?? ""} ${drone.serialNumber ?? ""}`.toLowerCase()
      })),
    [bookingContext, drones, form.droneIds]
  );

  const pilotOptions = useMemo(
    () => users
      .filter((user) => ["REMOTE_PILOT", "OPERATIONS_MANAGER", "SYSTEM_ADMINISTRATOR"].includes(user.role))
      .filter((user) => (
        form.pilotIds.includes(user.id) ||
        !isResourceBookedForMission(bookingContext, user.id, "pilot")
      ))
      .map((user) => ({
        value: user.id,
        label: user.name,
        title: user.name,
        meta: user.email ?? "Available for assignment",
        searchText: `${user.name} ${user.email ?? ""} ${user.role ?? ""}`.toLowerCase()
      })),
    [bookingContext, form.pilotIds, users]
  );

  const selectedDrones = useMemo(
    () => form.droneIds.map((droneId) => drones.find((drone) => drone.id === droneId)).filter(Boolean),
    [drones, form.droneIds]
  );

  const selectedPilots = useMemo(
    () => form.pilotIds.map((pilotId) => users.find((user) => user.id === pilotId)).filter(Boolean),
    [users, form.pilotIds]
  );

  const scheduleError = getScheduleError(form);
  const hasLaunchSite = hasCoordinates(form.locationPlan.launchSite);
  const derivedOperatingArea = form.routeAuthorityAnalysis?.operatingArea ?? null;
  const hasOperatingArea = hasCoordinates(form.locationPlan.operatingArea) || hasCoordinates(derivedOperatingArea);
  const routeStart = form.waypoints[0];
  const routeEnd = form.waypoints[form.waypoints.length - 1];
  const hasRouteStart = hasCoordinates(routeStart);
  const hasRouteEnd = hasCoordinates(routeEnd);
  const operatingAreaError = form.locationPlan.operatingArea ? getOperatingAreaCoverageError(form.locationPlan.operatingArea, routeStart, routeEnd) : "";
  const routeAuthorities = useMemo(() => getRouteAuthorities(form.routeAuthorityAnalysis), [form.routeAuthorityAnalysis]);
  const authorityPermissionsComplete = routeAuthorities.every((authority) => form.authorityApprovals[getAuthorityKey(authority)] === true);
  const authorityPermissionDetail = routeAuthorities.length
    ? authorityPermissionsComplete
      ? `${routeAuthorities.length} council permission${routeAuthorities.length === 1 ? "" : "s"} confirmed`
      : `${routeAuthorities.filter((authority) => form.authorityApprovals[getAuthorityKey(authority)] === true).length}/${routeAuthorities.length} council permissions confirmed`
    : "No council permissions required yet";
  const readinessItems = [
    { label: "Mission name", complete: Boolean(form.name.trim()), detail: form.name.trim() || "Required" },
    { label: "Mission type", complete: Boolean(form.type), detail: form.type || "Required" },
    { label: "Schedule", complete: Boolean(form.plannedDate && form.startTime && form.endTime && !scheduleError), detail: scheduleError || "Date and time ready" },
    { label: "Drone", complete: form.droneIds.length > 0, detail: selectedDrones.length ? `${selectedDrones.length} drone(s) selected` : "Required" },
    { label: "Remote pilot", complete: form.pilotIds.length > 0, detail: selectedPilots.length ? `${selectedPilots.length} pilot(s) selected` : "Required" },
    { label: "Launch site", complete: hasLaunchSite, detail: hasLaunchSite ? "Selected on map" : "Required" },
    { label: "Operating area", complete: hasOperatingArea && !operatingAreaError, detail: operatingAreaError || (hasOperatingArea ? "Derived from route envelope" : "Derived by backend after route analysis") },
    { label: "Route path", complete: hasRouteStart && hasRouteEnd, detail: hasRouteStart && hasRouteEnd ? `${form.waypoints.filter(hasCoordinates).length} point(s) selected` : "Start and end required" },
    { label: "Council permissions", complete: form.routeAccepted && form.permissionsReviewed, detail: form.routeAccepted ? authorityPermissionDetail : "Analyse route first" }
  ];
  const isMissionReady = readinessItems.every((item) => item.complete);
  const canAnalyseRoute = hasLaunchSite && hasRouteStart && hasRouteEnd && !operatingAreaError;
  const routeAnalysis = useMemo(() => createRouteAnalysis(form), [form]);
  const formSteps = useMemo(() => {
    const detailsComplete = Boolean(form.name.trim() && form.type);
    const assignmentComplete = form.droneIds.length > 0 && form.pilotIds.length > 0;
    const scheduleComplete = Boolean(form.plannedDate && form.startTime && form.endTime && !scheduleError);
    const routeComplete = canAnalyseRoute && form.routeAccepted;
    const permissionsComplete = routeComplete && form.permissionsReviewed;

    return [
      { id: "details", label: "Mission Details", helper: "Name and type", complete: detailsComplete, unlocked: true },
      { id: "assignment", label: "Assignment", helper: "Drone and pilot", complete: assignmentComplete, unlocked: detailsComplete },
      { id: "schedule", label: "Schedule & Notes", helper: "Time window and notes", complete: scheduleComplete, unlocked: detailsComplete && assignmentComplete },
      { id: "planning", label: "Mission Map", helper: "Launch, area, and route", complete: routeComplete, unlocked: detailsComplete && assignmentComplete && scheduleComplete },
      { id: "permissions", label: "Council Permissions", helper: "Required before flight", complete: permissionsComplete, unlocked: detailsComplete && assignmentComplete && scheduleComplete && routeComplete }
    ];
  }, [canAnalyseRoute, form.droneIds.length, form.endTime, form.name, form.permissionsReviewed, form.pilotIds.length, form.plannedDate, form.routeAccepted, form.startTime, form.type, scheduleError]);
  const activeStepIndex = Math.max(formSteps.findIndex((step) => step.id === activeStepId), 0);
  const activeStep = formSteps[activeStepIndex] ?? formSteps[0];
  const previousStep = formSteps[activeStepIndex - 1] ?? null;
  const nextStep = formSteps[activeStepIndex + 1] ?? null;
  const isCompactTabs = useMediaQuery("(max-width: 720px)");
  const visibleTabCount = isCompactTabs ? 2 : 4;

  useEffect(() => {
    const currentStep = formSteps.find((step) => step.id === activeStepId);
    if (currentStep?.unlocked) return;

    const lastUnlockedStep = [...formSteps].reverse().find((step) => step.unlocked);
    setActiveStepId(lastUnlockedStep?.id ?? "details");
  }, [activeStepId, formSteps]);

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

  const updateRouteField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value, routeAccepted: false, routeAuthorityAnalysis: null, authorityApprovals: {}, permissionsReviewed: false }));
  };

  const acceptRouteAnalysis = async () => {
    if (!canAnalyseRoute) {
      const message = operatingAreaError || "Select launch site, start point, and end point before analysing the route.";
      setError(message);
      showFeedback({ type: "error", title: "Route is not ready for analysis", message });
      return;
    }

    setIsAnalysingRoute(true);
    setError("");
    showFeedback({
      id: routeAnalysisFeedbackId,
      type: "loading",
      title: "Analysing mission route",
      message: "Checking the selected flight path against council boundary data and calculating the operating area.",
      blocking: true
    });

    try {
      const authorityPlan = await droneOpsApi.missions.analyseRoute({ plannedRoute: buildPlannedRoute({ includeRouteAnalysis: false }) });
      const authorityAnalysis = authorityPlan?.geofenceConfig?.authorityAnalysis ?? authorityPlan?.plannedRoute?.routeAnalysis?.authorityAnalysis ?? null;

      if (authorityAnalysis?.status !== "READY") {
        const message = authorityAnalysis?.message || "Council boundary analysis could not be completed from the official authority dataset.";
        setError(message);
        showFeedback({
          id: routeAnalysisFeedbackId,
          type: "error",
          title: "Route analysis failed",
          message
        });
        return;
      }

      const backendOperatingArea = authorityPlan?.plannedRoute?.operatingArea ?? authorityAnalysis?.operatingArea ?? null;
      setForm((current) => ({
        ...current,
        routeAccepted: true,
        routeAuthorityAnalysis: authorityAnalysis,
        authorityApprovals: buildInitialAuthorityApprovals(authorityAnalysis),
        permissionsReviewed: false,
        locationPlan: {
          ...current.locationPlan,
          ...(backendOperatingArea ? { operatingArea: backendOperatingArea } : {})
        }
      }));
      showFeedback({
        id: routeAnalysisFeedbackId,
        type: "success",
        title: "Route analysed and accepted",
        message: getRouteAnalysisSuccessMessage(authorityAnalysis),
        actionLabel: "Review permissions"
      });
    } catch (requestError) {
      const message = requestError.message;
      setError(message);
      showFeedback({
        id: routeAnalysisFeedbackId,
        type: "error",
        title: "Route analysis failed",
        message
      });
    } finally {
      setIsAnalysingRoute(false);
    }
  };

  const unlockAcceptedRoute = () => {
    setForm((current) => ({ ...current, routeAccepted: false, routeAuthorityAnalysis: null, authorityApprovals: {}, permissionsReviewed: false }));
  };

  const updateAuthorityApproval = (authority, isApproved) => {
    const authorityKey = getAuthorityKey(authority);
    setForm((current) => ({
      ...current,
      authorityApprovals: {
        ...current.authorityApprovals,
        [authorityKey]: isApproved
      },
      permissionsReviewed: false
    }));
  };

  const updatePermissionsReviewed = (isReviewed) => {
    setForm((current) => ({ ...current, permissionsReviewed: isReviewed }));
  };

  const goToNextStep = () => {
    if (!activeStep?.complete || !nextStep?.unlocked) return;
    setActiveStepId(nextStep.id);
  };

  const goToPreviousStep = () => {
    if (!previousStep) return;
    setActiveStepId(previousStep.id);
  };

  const buildDateTime = (date, time) => {
    if (!date || !time) return undefined;
    return new Date(`${date}T${time}`).toISOString();
  };

  const buildPlannedRoute = ({ includeRouteAnalysis = form.routeAccepted } = {}) => {
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
      ...(waypoints.length ? { waypoints, arrivalRadiusMeters: 50 } : {}),
      ...(includeRouteAnalysis ? {
        routeAnalysis: {
          accepted: true,
          acceptedAt: new Date().toISOString(),
          pointCount: routeAnalysis.pointCount,
          distanceMeters: routeAnalysis.distanceMeters,
          altitudeRange: routeAnalysis.altitudeRange,
          councilCount: routeAnalysis.councilCount,
          councilSummary: routeAnalysis.councilSummary,
          authorityAnalysis: sanitiseAuthorityAnalysis(form.routeAuthorityAnalysis, form.authorityApprovals),
          authorityApprovals: form.authorityApprovals,
          analysisModel: "DRONEOPS_ROUTE_ENVELOPE_V1"
        }
      } : {})
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
        const message = `${firstIncompleteItem.label} is required before creating the mission.`;
        setError(message);
        showFeedback({ type: "error", title: "Mission plan is incomplete", message });
        return;
      }

      if (scheduleError) {
        setError(scheduleError);
        showFeedback({ type: "error", title: "Fix the mission schedule", message: scheduleError });
        return;
      }

      if ((plannedRoute?.waypoints?.length ?? 0) < 2) {
        const message = "Add at least a start point and an end point on the mission planning map.";
        setError(message);
        showFeedback({ type: "error", title: "Route points missing", message });
        return;
      }

      if (operatingAreaError) {
        setError(operatingAreaError);
        showFeedback({ type: "error", title: "Operating area is not valid", message: operatingAreaError });
        return;
      }

      if (!form.routeAccepted) {
        const message = "Analyse and accept the flight path before creating this mission.";
        setError(message);
        showFeedback({ type: "error", title: "Route analysis required", message });
        return;
      }

      if (!form.permissionsReviewed) {
        const message = "Review the council permission requirements before saving this mission.";
        setError(message);
        showFeedback({ type: "error", title: "Council permission review required", message });
        setActiveStepId("permissions");
        return;
      }

      showFeedback({
        id: missionSaveFeedbackId,
        type: "loading",
        title: mode === "edit" ? "Updating mission" : "Creating mission",
        message: "Saving the mission plan, assignments, route analysis, and council permission state.",
        blocking: true
      });

      const payload = {
        ...(mode === "edit" && form.missionCode ? { missionCode: form.missionCode } : {}),
        name: form.name,
        type: form.type,
        droneIds: form.droneIds,
        pilotIds: form.pilotIds,
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
        showFeedback({
          id: missionSaveFeedbackId,
          type: "success",
          title: "Mission updated",
          message: `${savedMission.missionCode ?? form.missionCode ?? "Mission"} has been saved successfully.`
        });
        onUpdated?.({
          ...savedMission,
          missionCode: savedMission.missionCode ?? form.missionCode
        });
      } else {
        showFeedback({
          id: missionSaveFeedbackId,
          type: "success",
          title: "Mission created",
          message: `${savedMission.missionCode ?? "Mission"} has been saved successfully.`
        });
        onCreated?.({
          ...savedMission,
          missionCode: savedMission.missionCode ?? form.missionCode
        });
      }
    } catch (requestError) {
      const message = getMissionSubmitErrorMessage(requestError.message);
      setError(message);
      showFeedback({
        id: missionSaveFeedbackId,
        type: "error",
        title: mode === "edit" ? "Mission update failed" : "Mission creation failed",
        message
      });
    } finally {
      setIsSaving(false);
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-dialog registration-dialog mission-dialog" role="dialog" aria-modal="true" aria-labelledby="create-mission-title" onSubmit={handleSubmit}>
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

          <MissionFormTabs steps={formSteps} activeStepId={activeStepId} onChange={setActiveStepId} visibleCount={visibleTabCount} />

          <div className="form-layout modal-form-layout mission-form-step-layout">
            {activeStepId === "details" && (
            <FormSection icon={Route} title="Mission Details" className="mission-form-step-panel">
              <Field label="Mission Name" value={form.name} onChange={(value) => updateField("name", value)} placeholder="North Ridge Inspection" required />
              <SelectField label="Mission Type" value={form.type} onChange={(value) => updateField("type", value)} options={missionTypes} required />
            </FormSection>
            )}

            {activeStepId === "assignment" && (
            <FormSection icon={UserRound} title="Assignment" className="mission-assignment-section mission-form-step-panel">
              <div className="assignment-picker-row">
                <div className="assignment-picker-copy">
                  <span>Assigned Drones</span>
                  <strong>{selectedDrones.length ? `${selectedDrones.length} selected` : `${droneOptions.length} available`}</strong>
                </div>
                <MultiSearchableSelectField
                  label=""
                  dataCy="mission-drone-picker"
                  className="assignment-picker-search"
                  value={form.droneIds}
                  onChange={(value) => setForm((current) => ({ ...current, droneIds: value }))}
                  options={droneOptions}
                  placeholder="Search drones"
                />
              </div>
              <SelectedAssignmentList type="drone" items={selectedDrones} onRemove={(id) => setForm((current) => {
                const nextIds = current.droneIds.filter((droneId) => droneId !== id);
                return { ...current, droneIds: nextIds };
              })} />
              <div className="assignment-picker-row">
                <div className="assignment-picker-copy">
                  <span>Remote Pilots</span>
                  <strong>{selectedPilots.length ? `${selectedPilots.length} selected` : `${pilotOptions.length} available`}</strong>
                </div>
                <MultiSearchableSelectField
                  label=""
                  dataCy="mission-pilot-picker"
                  className="assignment-picker-search"
                  value={form.pilotIds}
                  onChange={(value) => setForm((current) => ({ ...current, pilotIds: value }))}
                  options={pilotOptions}
                  placeholder="Search pilots"
                />
              </div>
              <SelectedAssignmentList type="pilot" items={selectedPilots} onRemove={(id) => setForm((current) => {
                const nextIds = current.pilotIds.filter((pilotId) => pilotId !== id);
                return { ...current, pilotIds: nextIds };
              })} />
            </FormSection>
            )}

            {activeStepId === "schedule" && (
            <FormSection icon={CalendarClock} title="Schedule & Route Notes" className="mission-form-step-panel">
              <div className="mission-schedule-grid">
                <Field label="Planned Date" type="date" value={form.plannedDate} onChange={(value) => updateField("plannedDate", value)} />
                <Field label="Start Time" type="time" value={form.startTime} onChange={(value) => updateField("startTime", value)} />
                <Field label="End Time" type="time" value={form.endTime} onChange={(value) => updateField("endTime", value)} />
                {canEditStatus && mode === "edit" && (
                  <SelectField label="Mission Status" value={form.status} onChange={(value) => updateField("status", value)} options={missionStatuses} />
                )}
              </div>
              {scheduleError && <InlineFormAlert message={scheduleError} />}
              <TextareaField
                label="Route / Waypoint Notes"
                value={form.waypointNotes}
                onChange={(value) => updateField("waypointNotes", value)}
                placeholder="Add route notes, key waypoints, or site instructions."
              />
            </FormSection>
            )}

            {activeStepId === "planning" && (
            <FormSection icon={MapPinned} title="Mission Planning Map" className="wide-form-section mission-form-step-panel">
              <div className="route-tracking-panel">
                <RouteAnalysisPanel
                  analysis={routeAnalysis}
                  isAccepted={form.routeAccepted}
                  isAnalysing={isAnalysingRoute}
                  approvals={form.authorityApprovals}
                  onApprovalChange={updateAuthorityApproval}
                  showPermissions={false}
                />
                <RoutePointMapPicker
                  value={form.waypoints}
                  onChange={(waypoints) => updateRouteField("waypoints", waypoints)}
                  locationPlan={form.locationPlan}
                  onLocationPlanChange={(locationPlan) => updateRouteField("locationPlan", locationPlan)}
                  locked={form.routeAccepted}
                  analysis={routeAnalysis}
                />
                <RoutePlanningAction
                  canAnalyse={canAnalyseRoute}
                  isAccepted={form.routeAccepted}
                  isAnalysing={isAnalysingRoute}
                  onAnalyse={acceptRouteAnalysis}
                  onUnlock={unlockAcceptedRoute}
                  detail={canAnalyseRoute ? "Route is ready for the official council/LGA boundary check. The backend will derive the operating area from the accepted route." : operatingAreaError || "Finish the launch site, start point, and end point before analysis."}
                />
                <ReadinessChecklist items={readinessItems} />
              </div>
            </FormSection>
            )}

            {activeStepId === "permissions" && (
            <FormSection icon={ShieldCheck} title="Council Permissions Required Before Flight" className="wide-form-section mission-form-step-panel">
              <CouncilPermissionsStep
                analysis={routeAnalysis}
                isAccepted={form.routeAccepted}
                approvals={form.authorityApprovals}
                reviewed={form.permissionsReviewed}
                onApprovalChange={updateAuthorityApproval}
                onReviewedChange={updatePermissionsReviewed}
              />
              <ReadinessChecklist items={readinessItems} />
            </FormSection>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <div className={`mission-readiness-footer ${isMissionReady ? "ready" : ""}`}>
            {isMissionReady ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{getStepFooterMessage(activeStep, isMissionReady, form.routeAccepted)}</span>
          </div>
          <div className="form-actions">
            {previousStep && (
              <ActionButton icon={ArrowLeft} onClick={goToPreviousStep} type="button">Back</ActionButton>
            )}
            <ActionButton onClick={onCancel}>Cancel</ActionButton>
            {nextStep ? (
              <ActionButton icon={ArrowRight} variant="primary" type="button" onClick={goToNextStep} disabled={!activeStep?.complete || !nextStep.unlocked}>
                {nextStep.id === "permissions" ? "Review Council Permissions" : "Next"}
              </ActionButton>
            ) : (
              <ActionButton icon={Save} variant="primary" type="submit" disabled={isSaving || !isMissionReady || !form.routeAccepted}>
                {isSaving ? (mode === "edit" ? "Saving" : "Creating") : getSubmitLabel(mode, authorityPermissionsComplete, routeAuthorities.length)}
              </ActionButton>
            )}
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
};

const MissionFormTabs = ({ steps, activeStepId, onChange, visibleCount = 4 }) => {
  const activeIndex = steps.findIndex((step) => step.id === activeStepId);
  const visibleSteps = steps.slice(0, visibleCount);
  const hiddenSteps = steps.slice(visibleCount);
  const activeHiddenStep = activeIndex >= visibleCount ? steps[activeIndex] : null;
  const displayedSteps = activeHiddenStep
    ? [...visibleSteps.slice(0, Math.max(visibleCount - 1, 0)), activeHiddenStep]
    : visibleSteps;
  const hiddenCount = activeHiddenStep ? Math.max(hiddenSteps.length - 1, 0) : hiddenSteps.length;

  const columnCount = displayedSteps.length + (!activeHiddenStep && hiddenCount > 0 ? 1 : 0);

  return (
    <HeaderDockedTabs>
    <div className="mission-form-tabs" role="tablist" aria-label="Mission creation steps" style={{ "--mission-tab-count": columnCount }}>
      {displayedSteps.map((step) => (
        <MissionFormTabButton
          key={step.id}
          step={step}
          index={steps.findIndex((candidate) => candidate.id === step.id)}
          activeStepId={activeStepId}
          onChange={onChange}
        />
      ))}
      {!activeHiddenStep && hiddenCount > 0 && (
        <button className="mission-form-more-tab" type="button" disabled aria-label={`${hiddenCount} more mission step${hiddenCount === 1 ? "" : "s"}`}>
          <span>+{hiddenCount}</span>
          <strong>{hiddenCount} more</strong>
          <small>Unlock next</small>
        </button>
      )}
    </div>
    </HeaderDockedTabs>
  );
};

const MissionFormTabButton = ({ step, index, activeStepId, onChange }) => (
  <button
    type="button"
    role="tab"
    aria-selected={activeStepId === step.id}
    className={`${activeStepId === step.id ? "active" : ""} ${step.complete ? "complete" : ""} ${step.unlocked ? "" : "locked"}`}
    onClick={() => {
      if (step.unlocked) onChange(step.id);
    }}
    disabled={!step.unlocked}
  >
    <span>{step.complete ? <CheckCircle2 size={16} /> : step.unlocked ? index + 1 : <Lock size={15} />}</span>
    <strong>{step.label}</strong>
    <small>{step.helper}</small>
  </button>
);

const useMediaQuery = (query) => {
  const getMatches = useCallback(() => (
    typeof window !== "undefined" && window.matchMedia(query).matches
  ), [query]);
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
};

const RoutePlanningAction = ({ canAnalyse, isAccepted, isAnalysing, onAnalyse, onUnlock, detail }) => (
  <div className={`route-planning-action ${isAccepted ? "accepted" : ""}`}>
    <div>
      <strong>{isAccepted ? "Route accepted" : "Analyse and accept this route"}</strong>
      <span>{isAccepted ? "This route is locked for mission creation. Edit it if the path changes." : detail}</span>
    </div>
    {isAccepted ? (
      <button type="button" onClick={onUnlock}>
        <Unlock size={16} />
        Edit Accepted Route
      </button>
    ) : (
      <button type="button" onClick={onAnalyse} disabled={!canAnalyse || isAnalysing}>
        {isAnalysing ? <LoaderCircle size={16} /> : <ShieldCheck size={16} />}
        {isAnalysing ? "Analysing" : "Analyse & Accept Route"}
      </button>
    )}
  </div>
);

const FormSection = ({ icon: Icon, title, children, className = "" }) => (
  <section className={`form-section ${className}`}>
    <div className="form-section-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
    <div className="form-grid">{children}</div>
  </section>
);

const RouteAnalysisPanel = ({ analysis, isAccepted, isAnalysing, approvals = {}, onApprovalChange, showPermissions = true }) => {
  const authorities = getRouteAuthorities(analysis.authorityAnalysis);
  const approvedCount = authorities.filter((authority) => approvals[getAuthorityKey(authority)] === true).length;
  const statusLabel = isAnalysing
    ? "Analysing official council boundaries"
    : isAccepted
      ? "Council permissions required before flight"
      : "Route analysis required";
  const StatusIcon = isAnalysing ? LoaderCircle : isAccepted ? ShieldCheck : AlertTriangle;

  return (
    <div className={`route-analysis-panel ${isAccepted ? "accepted" : ""} ${isAnalysing ? "analysing" : ""}`}>
      <div className="route-analysis-status">
        <StatusIcon size={20} />
        <div>
          <span>{statusLabel}</span>
          <strong>{isAnalysing ? "Checking NSW council/LGA boundaries..." : analysis.summary}</strong>
          <small>{isAnalysing ? "Please wait while DroneOps asks the backend to check the official NSW boundary service." : isAccepted && authorities.length ? "Tick each council only after permission or approval has been received for this mission." : analysis.detail}</small>
        </div>
      </div>
      <div className="route-analysis-metrics">
        <span>{analysis.pointCount} points</span>
        <span>{analysis.altitudeRange}</span>
        <span>{isAccepted && authorities.length ? `${approvedCount}/${authorities.length} permissions` : analysis.councilSummary}</span>
      </div>
      {showPermissions && isAccepted && authorities.length > 0 && (
        <CouncilPermissionChecklist authorities={authorities} approvals={approvals} onApprovalChange={onApprovalChange} />
      )}
    </div>
  );
};

const CouncilPermissionsStep = ({ analysis, isAccepted, approvals = {}, reviewed = false, onApprovalChange, onReviewedChange }) => {
  const authorities = getRouteAuthorities(analysis.authorityAnalysis);
  const approvedCount = authorities.filter((authority) => approvals[getAuthorityKey(authority)] === true).length;

  if (!isAccepted) {
    return (
      <div className="route-permission-empty">
        <AlertTriangle size={20} />
        <div>
          <strong>Analyse and accept the route first</strong>
          <span>Council permissions are calculated from the accepted mission route.</span>
        </div>
      </div>
    );
  }

  if (!authorities.length) {
    return (
      <div className="route-permission-step">
        <div className="route-permission-empty ready">
          <ShieldCheck size={20} />
          <div>
            <strong>No council permission target returned</strong>
            <span>The boundary check did not return a council intersection for this route.</span>
          </div>
        </div>
        <PermissionReviewCheckbox reviewed={reviewed} onReviewedChange={onReviewedChange} />
      </div>
    );
  }

  return (
    <div className="route-permission-step">
      <div className="route-permission-step-summary">
        <div>
          <span>Permission checkpoint</span>
          <strong>{approvedCount}/{authorities.length} councils confirmed</strong>
          <small>Tick a council only after permission has been received. Pending items are saved with the mission and block flight start.</small>
        </div>
        <ShieldCheck size={24} />
      </div>
      <CouncilPermissionChecklist authorities={authorities} approvals={approvals} onApprovalChange={onApprovalChange} />
      <PermissionReviewCheckbox reviewed={reviewed} onReviewedChange={onReviewedChange} />
    </div>
  );
};

const PermissionReviewCheckbox = ({ reviewed, onReviewedChange }) => (
  <label className={`route-permission-review ${reviewed ? "checked" : ""}`}>
    <input
      type="checkbox"
      checked={reviewed}
      onChange={(event) => onReviewedChange?.(event.target.checked)}
    />
    <span>
      <strong>I have reviewed the council permission requirements for this mission.</strong>
      <small>Pending permissions will be saved with the mission and must be confirmed from the mission profile before flight can start.</small>
    </span>
  </label>
);

const CouncilPermissionChecklist = ({ authorities, approvals = {}, onApprovalChange }) => {
  const approvedCount = authorities.filter((authority) => approvals[getAuthorityKey(authority)] === true).length;

  return (
    <div className="route-permission-checklist">
      <div className="route-permission-heading">
        <span>Council permission checklist</span>
        <strong>{approvedCount === authorities.length ? "All confirmed" : `${authorities.length - approvedCount} pending`}</strong>
      </div>
      <div className="route-permission-items">
        {authorities.map((authority) => (
          <label className="route-permission-item" key={getAuthorityKey(authority)}>
            <input
              type="checkbox"
              checked={approvals[getAuthorityKey(authority)] === true}
              onChange={(event) => onApprovalChange?.(authority, event.target.checked)}
            />
            <span>
              <strong>{authority.authorityName ?? authority.lgaName}</strong>
              <small>{[authority.lgaName, authority.absCode ? `ABS ${authority.absCode}` : ""].filter(Boolean).join(" | ") || "Council authority"}</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

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

const MultiSearchableSelectField = ({
  label,
  options,
  value = [],
  onChange,
  placeholder = "Search",
  className = "",
  dataCy
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selectedValues = Array.isArray(value) ? value : [];

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

  const toggleValue = (optionValue) => {
    const nextValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
      : [...selectedValues, optionValue];
    onChange?.(nextValues);
  };

  return (
    <div className={`field searchable-select-field ${className}`} ref={wrapperRef} data-cy={dataCy}>
      {label && <span>{label}</span>}
      <div className={`field-search-input combo-input ${isOpen ? "open" : ""}`}>
        <Search size={16} />
        <input
          type="text"
          value={isOpen ? query : (selectedValues.length ? `${selectedValues.length} selected` : "")}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder={selectedValues.length ? "" : placeholder}
        />
        <button type="button" className="combo-toggle" onClick={() => setIsOpen((current) => !current)} aria-label={`Toggle ${label.toLowerCase()} options`}>
          <ChevronDown size={16} />
        </button>
      </div>
      {isOpen && (
        <div className="combo-options multi-combo-options" role="listbox" aria-label={label} aria-multiselectable="true">
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const optionLabel = typeof option === "string" ? option : option.label;
              const optionTitle = typeof option === "string" ? option : option.title;
              const optionMeta = typeof option === "string" ? "" : option.meta;
              const isSelected = selectedValues.includes(optionValue);

              return (
                <button
                  key={optionValue}
                  type="button"
                  className={`combo-option multi-combo-option ${isSelected ? "selected" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggleValue(optionValue)}
                >
                  <span className={`combo-checkbox ${isSelected ? "checked" : ""}`} aria-hidden="true">
                    {isSelected && <CheckCircle2 size={14} />}
                  </span>
                  <span className="combo-option-main">
                    <span className="combo-option-copy">
                      <strong>{optionTitle || optionLabel}</strong>
                      <small>{optionMeta || optionLabel}</small>
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="combo-empty">No records matched your search.</div>
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

const SelectedAssignmentList = ({ type, items = [], onRemove }) => {
  if (!items.length) {
    return (
      <div className="selected-assignment-list empty">
        <span>{type === "drone" ? "No drone selected" : "No pilot selected"}</span>
        <strong>{type === "drone" ? "Choose one or more drones from the picker." : "Choose one or more pilots from the picker."}</strong>
      </div>
    );
  }

  return (
    <div className="selected-assignment-list">
      <div className="selected-assignment-heading">
        <span>{type === "drone" ? "Selected drones" : "Selected pilots"}</span>
        <strong>{items.length}</strong>
      </div>
      <div className="selected-assignment-chips">
        {items.map((item) => (
          <div className="selected-assignment-chip" key={item.id}>
            <div>
              <strong>{type === "drone" ? (item.droneCode || [item.manufacturer, item.model].filter(Boolean).join(" ") || "Drone") : item.name}</strong>
              <small>
                {type === "drone"
                  ? [item.manufacturer, item.model].filter(Boolean).join(" ")
                  : [formatReadableValue(item.role), item.email].filter(Boolean).join(" | ")}
              </small>
            </div>
            <button type="button" onClick={() => onRemove?.(item.id)} aria-label={`Remove ${type === "drone" ? item.droneCode ?? "drone" : item.name}`}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
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

const getStepFooterMessage = (step, isMissionReady, routeAccepted) => {
  if (step?.id === "planning" && routeAccepted) return "Route accepted. Review council permissions before saving.";
  if (step?.id === "permissions" && !step.complete) return "Confirm that you reviewed the council permission requirements.";
  if (isMissionReady && routeAccepted) return "Mission plan is ready to create.";
  if (!step) return "Complete the mission form before creating this mission.";
  if (step.complete) return `${step.label} is complete. Continue to the next step.`;
  return `Complete ${step.label.toLowerCase()} to unlock the next step.`;
};

const getSubmitLabel = (mode, authorityPermissionsComplete, authorityCount) => {
  if (mode === "edit") return "Save Mission";
  if (authorityCount > 0 && !authorityPermissionsComplete) return "Save and Await Permissions";
  return "Create Mission";
};

const toFormState = (mission) => {
  if (!mission) return initialForm;

  const plannedStart = mission.plannedStartAt ? new Date(mission.plannedStartAt) : null;
  const plannedEnd = mission.plannedEndAt ? new Date(mission.plannedEndAt) : null;
  const droneIds = getMissionDroneIds(mission);
  const pilotIds = getMissionPilotIds(mission);
  const waypoints = toWaypointRows(mission.plannedRoute?.waypoints ?? mission.plannedRoute?.coordinates ?? mission.routeWaypoints);

  return {
    missionCode: mission.missionCode ?? mission.id ?? "",
    name: mission.name ?? "",
    type: mission.type ?? "",
    droneIds,
    pilotIds,
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
    routeAccepted: Boolean(mission.plannedRoute?.routeAnalysis?.accepted),
    routeAuthorityAnalysis: mission.plannedRoute?.routeAnalysis?.authorityAnalysis ?? mission.geofenceConfig?.authorityAnalysis ?? null,
    authorityApprovals: buildInitialAuthorityApprovals(mission.plannedRoute?.routeAnalysis?.authorityAnalysis ?? mission.geofenceConfig?.authorityAnalysis ?? null),
    permissionsReviewed: Boolean(mission.plannedRoute?.routeAnalysis?.accepted),
    routeTrackingEnabled: waypoints.length >= 2,
    waypoints
  };
};

const getMissionDroneIds = (mission) => {
  const canonicalIds = mission.drones?.map((drone) => drone.id).filter(Boolean) ?? [];
  const assignmentIds = mission.droneAssignments?.map((assignment) => assignment.drone?.id ?? assignment.droneId).filter(Boolean) ?? [];
  return [...new Set([...canonicalIds, mission.drone?.id ?? mission.droneId, ...assignmentIds].filter(Boolean))];
};

const getMissionPilotIds = (mission) => {
  const canonicalIds = mission.pilots?.map((pilot) => pilot.id).filter(Boolean) ?? [];
  const assignmentIds = mission.pilotAssignments?.map((assignment) => assignment.pilot?.id ?? assignment.pilotId).filter(Boolean) ?? [];
  return [...new Set([...canonicalIds, mission.pilot?.id ?? mission.pilotId, ...assignmentIds].filter(Boolean))];
};

const formatLocationLabel = (location) => {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return undefined;
  const label = location.label || "Selected on map";
  return `${label} (${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)})`;
};

const createRouteAnalysis = (form) => {
  const points = form.waypoints.filter(hasCoordinates);
  const altitudes = points.map((point) => Number(point.altitude || 0)).filter(Number.isFinite);
  const minAltitude = altitudes.length ? Math.min(...altitudes) : 0;
  const maxAltitude = altitudes.length ? Math.max(...altitudes) : 0;
  const distanceMeters = points.length >= 2 ? getRouteDistanceMeters(points) : 0;
  const authorityAnalysis = form.routeAuthorityAnalysis;
  const councils = Array.isArray(authorityAnalysis?.authorities) ? authorityAnalysis.authorities : [];
  const councilCount = authorityAnalysis?.status === "READY" ? councils.length : 0;

  return {
    pointCount: points.length,
    distanceMeters,
    altitudeRange: `${Math.round(minAltitude)}-${Math.round(maxAltitude)} m AGL`,
    councilCount,
    councilSummary: authorityAnalysis?.status === "READY"
      ? councilCount === 1 ? councils[0]?.authorityName ?? "1 council area" : `${councilCount} council areas`
      : "Official council lookup required",
    authorityAnalysis,
    summary: points.length >= 2 ? `${formatDistance(distanceMeters)} editable route` : "Route needs start and end points",
    detail: points.length >= 2
      ? authorityAnalysis?.status === "READY"
        ? authorityAnalysis.message
        : "Use Analyse & Accept Route to check official NSW council/LGA boundary intersections."
      : "Select launch site, start point, and end point before creating the accepted mission path."
  };
};

const sanitiseAuthorityAnalysis = (authorityAnalysis, approvals = {}) => {
  if (!authorityAnalysis || typeof authorityAnalysis !== "object") return null;

  return {
    status: authorityAnalysis.status,
    message: authorityAnalysis.message,
    source: authorityAnalysis.source,
    sourceUrl: authorityAnalysis.sourceUrl,
    sourceFeatureCount: authorityAnalysis.sourceFeatureCount,
    analysedAt: authorityAnalysis.analysedAt,
    authorities: Array.isArray(authorityAnalysis.authorities)
      ? authorityAnalysis.authorities.map((authority) => ({
          authorityType: authority.authorityType,
          authorityName: authority.authorityName,
          lgaName: authority.lgaName,
          absCode: authority.absCode,
          reference: authority.reference,
          approvalRequired: authority.approvalRequired ?? true,
          approvalStatus: approvals[getAuthorityKey(authority)] ? "APPROVED" : "PENDING",
          source: authority.source
        }))
      : []
  };
};

const getRouteAuthorities = (authorityAnalysis) => (
  Array.isArray(authorityAnalysis?.authorities) ? authorityAnalysis.authorities : []
);

const getRouteAnalysisSuccessMessage = (authorityAnalysis) => {
  const authorities = getRouteAuthorities(authorityAnalysis);
  if (!authorities.length) {
    return "The route has been accepted. No council permission areas were found for this flight path.";
  }

  return `${authorities.length} council permission ${authorities.length === 1 ? "area was" : "areas were"} found. Review and confirm permissions before the mission can be started.`;
};

const getAuthorityKey = (authority) => String(authority?.reference ?? authority?.absCode ?? authority?.authorityName ?? authority?.lgaName ?? "");

const buildInitialAuthorityApprovals = (authorityAnalysis) => (
  getRouteAuthorities(authorityAnalysis).reduce((approvals, authority) => ({
    ...approvals,
    [getAuthorityKey(authority)]: authority.approvalStatus === "APPROVED" || authority.approvalStatus === "GRANTED"
  }), {})
);

const formatDistance = (meters) => {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
};

const getRouteDistanceMeters = (points) => points.reduce((total, point, index) => {
  if (index === 0) return total;
  return total + getDistanceMeters(points[index - 1], point);
}, 0);

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

const blockingMissionStatuses = new Set(["APPROVED", "RISK_ASSESSMENT_COMPLETED", "ACTIVE"]);

const createResourceBookingContext = ({ missions = [], mission, plannedDate, startTime, endTime }) => ({
  missions,
  targetWindow: getMissionTimeWindowFromSchedule(plannedDate, startTime, endTime),
  currentMissionIds: new Set([mission?.uuid, mission?.systemId, mission?.id].filter(Boolean).map(String))
});

const isResourceBookedForMission = ({ missions = [], targetWindow, currentMissionIds }, resourceId, resourceType) => {
  if (!targetWindow || !resourceId) return false;

  return missions.some((candidate) => {
    if (currentMissionIds.has(String(candidate.id)) || currentMissionIds.has(String(candidate.missionCode))) return false;
    if (!blockingMissionStatuses.has(candidate.status)) return false;
    if (!timeWindowsOverlap(targetWindow, getMissionTimeWindow(candidate))) return false;

    const resourceIds = resourceType === "drone"
      ? getMissionDroneIds(candidate)
      : getMissionPilotIds(candidate);

    return resourceIds.includes(resourceId);
  });
};

const getMissionTimeWindowFromSchedule = (plannedDate, startTime, endTime) => {
  if (!plannedDate || !startTime || !endTime) return null;

  return {
    start: new Date(`${plannedDate}T${startTime}`),
    end: new Date(`${plannedDate}T${endTime}`)
  };
};

const getMissionTimeWindow = (mission) => {
  if (!mission?.plannedStartAt || !mission?.plannedEndAt) return null;
  return {
    start: new Date(mission.plannedStartAt),
    end: new Date(mission.plannedEndAt)
  };
};

const timeWindowsOverlap = (first, second) => {
  if (!first || !second) return false;
  if (Number.isNaN(first.start.getTime()) || Number.isNaN(first.end.getTime())) return false;
  if (Number.isNaN(second.start.getTime()) || Number.isNaN(second.end.getTime())) return false;
  return first.start < second.end && first.end > second.start;
};

const getMissionSubmitErrorMessage = (message = "") => {
  const normalizedMessage = message.toLowerCase().trim();

  if (normalizedMessage.includes("body: required") || normalizedMessage === "required") {
    return "Mission could not be submitted right now. Please refresh and try again.";
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
