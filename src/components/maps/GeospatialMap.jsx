/* oxlint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Home, RefreshCw } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import LoadingLogo from "../common/LoadingLogo";
import MapWorkspace from "./MapWorkspace";
import { mapCenter } from "../../data/geospatialData";
import { droneOpsApi } from "../../services/droneOpsApi";
import { getRealtimeSocket } from "../../services/realtimeClient";

const TELEMETRY_REFRESH_MS = 3000;
const DRONE_HISTORY_LIMIT = 30;
const OFFLINE_AFTER_MS = 30000;

const GeospatialMap = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const layersRef = useRef(null);
  const telemetryTimerRef = useRef(null);
  const telemetryErrorCountRef = useRef(0);
  const hasAutoFramedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [liveDrones, setLiveDrones] = useState([]);
  const [liveGeofences, setLiveGeofences] = useState([]);
  const [selectedDroneId, setSelectedDroneId] = useState("");
  const [selectedDroneTrack, setSelectedDroneTrack] = useState([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [mapError, setMapError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [geofenceMessage, setGeofenceMessage] = useState("");
  const [telemetrySyncMessage, setTelemetrySyncMessage] = useState("");

  const selectedDrone = useMemo(
    () => liveDrones.find((drone) => drone.id === selectedDroneId) ?? null,
    [liveDrones, selectedDroneId]
  );
  const telemetryStatus = useMemo(
    () => getTelemetryFeedStatus({ mapReady, mapError, liveDrones }),
    [liveDrones, mapError, mapReady]
  );

  useEffect(() => {
    let isMounted = true;

    const loadGeofences = async () => {
      try {
        const geofenceRows = await droneOpsApi.geofences.list();
        if (!isMounted) return;

        const normalizedGeofences = geofenceRows.filter((zone) => zone.isActive).map(normalizeGeofence).filter(Boolean);
        if (normalizedGeofences.length) {
          setLiveGeofences(normalizedGeofences);
          setGeofenceMessage("");
          return;
        }

        setLiveGeofences([]);
        setGeofenceMessage("No active operational geofences configured.");
      } catch (error) {
        if (isMounted) setGeofenceMessage(`Geofences unavailable. ${error.message}`);
      }
    };

    loadGeofences();
    const socket = getRealtimeSocket();
    socket.on("geofences:changed", loadGeofences);
    const timer = window.setInterval(loadGeofences, 15000);

    return () => {
      isMounted = false;
      socket.off("geofences:changed", loadGeofences);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const handleTelemetryUpdate = () => {
      window.dispatchEvent(new CustomEvent("droneops-map-refresh"));
    };

    socket.on("operations:telemetry", handleTelemetryUpdate);
    socket.on("telemetry:update", handleTelemetryUpdate);

    return () => {
      socket.off("operations:telemetry", handleTelemetryUpdate);
      socket.off("telemetry:update", handleTelemetryUpdate);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadTelemetry = async (manual = false, options = {}) => {
      if (document.visibilityState !== "visible" && !manual) {
        scheduleNextTelemetryLoad();
        return;
      }

      if (manual) setIsRefreshing(true);

      try {
        const telemetryRows = await droneOpsApi.telemetry.live();
        if (!isMounted) return;

        telemetryErrorCountRef.current = 0;
        if (!options.keepSyncError) setMapError("");
        if (!options.keepSyncMessage) setTelemetrySyncMessage("");

        const nextDrones = telemetryRows
          .map(normalizeTelemetryRow)
          .filter(Boolean)
          .sort((left, right) => {
            if (left.isOffline === right.isOffline) return left.id.localeCompare(right.id);
            return left.isOffline ? 1 : -1;
          });

        setLiveDrones(nextDrones);
        setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setSelectedDroneId((current) => current && nextDrones.some((drone) => drone.id === current) ? current : nextDrones[0]?.id ?? "");
        scheduleNextTelemetryLoad();
      } catch (error) {
        if (!isMounted) return;

        telemetryErrorCountRef.current += 1;
        setMapError(`Live telemetry paused: ${error.message}`);
        if (telemetryErrorCountRef.current < 3) {
          scheduleNextTelemetryLoad(TELEMETRY_REFRESH_MS * 2);
        }
      } finally {
        if (isMounted) setIsRefreshing(false);
      }
    };

    const scheduleNextTelemetryLoad = (delay = TELEMETRY_REFRESH_MS) => {
      window.clearTimeout(telemetryTimerRef.current);
      telemetryTimerRef.current = window.setTimeout(() => loadTelemetry(), delay);
    };

    const handleManualRefresh = async () => {
      setIsRefreshing(true);
      setMapError("");
      setTelemetrySyncMessage("");

      try {
        await droneOpsApi.telemetry.syncSynctegral();
        setTelemetrySyncMessage("Synctegral telemetry synced. Reloading latest positions.");
        await loadTelemetry(true, { keepSyncMessage: true });
      } catch (error) {
        setMapError(`Synctegral sync failed: ${error.message}`);
        await loadTelemetry(true, { keepSyncError: true });
      }
    };

    loadTelemetry();
    window.addEventListener("droneops-map-refresh", handleManualRefresh);

    return () => {
      isMounted = false;
      window.clearTimeout(telemetryTimerRef.current);
      window.removeEventListener("droneops-map-refresh", handleManualRefresh);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSelectedDroneTrack = async () => {
      if (!selectedDroneId) {
        setSelectedDroneTrack([]);
        return;
      }

      setIsHistoryLoading(true);

      try {
        const historyRows = await droneOpsApi.telemetry.byDrone(selectedDroneId);
        if (!isMounted) return;

        const coordinates = historyRows
          .map((row) => normalizeCoordinate([row.location?.longitude, row.location?.latitude]))
          .filter(Boolean)
          .slice(-DRONE_HISTORY_LIMIT);

        setSelectedDroneTrack(coordinates);
      } catch {
        if (isMounted) setSelectedDroneTrack([]);
      } finally {
        if (isMounted) setIsHistoryLoading(false);
      }
    };

    loadSelectedDroneTrack();

    return () => {
      isMounted = false;
    };
  }, [selectedDroneId]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [mapCenter.latitude, mapCenter.longitude],
        zoom: 12,
        zoomControl: false,
        attributionControl: true
      });

      L.control.zoom({ position: "topright" }).addTo(map);
      L.control.scale({ position: "bottomleft", imperial: true, metric: true }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      layersRef.current = {
        geofences: L.layerGroup().addTo(map),
        routes: L.layerGroup().addTo(map),
        tracks: L.layerGroup().addTo(map),
        drones: L.layerGroup().addTo(map)
      };

      resizeObserverRef.current = new ResizeObserver(() => map.invalidateSize());
      resizeObserverRef.current.observe(mapContainerRef.current);
      mapRef.current = map;
      setMapReady(true);
    } catch (error) {
      setMapError(`Map failed to load: ${error.message}`);
    }

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !layersRef.current) return;
    renderDashboardMapLayers({
      layers: layersRef.current,
      liveDrones,
      liveGeofences,
      selectedDrone,
      selectedDroneId,
      selectedDroneTrack,
      onSelectDrone: setSelectedDroneId
    });
  }, [liveDrones, liveGeofences, mapReady, selectedDrone, selectedDroneId, selectedDroneTrack]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !liveDrones.length || hasAutoFramedRef.current) return;
    fitMapToData(mapRef.current, liveDrones, liveGeofences, selectedDroneTrack);
    hasAutoFramedRef.current = true;
  }, [liveDrones, liveGeofences, mapReady, selectedDroneTrack]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedDrone) return;
    mapRef.current.flyTo(toLatLng(selectedDrone.coordinates), Math.max(mapRef.current.getZoom(), 14), { duration: 0.8 });
  }, [mapReady, selectedDrone]);

  return (
    <MapWorkspace title="Fleet telemetry" details={<FleetMapDetails drones={liveDrones} selectedDroneId={selectedDroneId} onSelectDrone={setSelectedDroneId} />}>
    {(fullscreenButton) => (
    <div className="panel map-panel geospatial-panel leaflet-geospatial-panel">
      <div className="panel-heading compact map-panel-heading">
        <div>
          <div className="map-title-row">
            <h3>Telemetry Map</h3>
            <span className={`map-status ${telemetryStatus.tone}`}>{telemetryStatus.label}</span>
          </div>
          <p>{mapError || telemetrySyncMessage || geofenceMessage || "Live fleet positions, selected-drone replay, and geofence overlays."}</p>
        </div>
        <div className="map-toolbar">
          <div className="map-view-controls" aria-label="Map view controls">
            <button className="icon-button" type="button" aria-label="Center map on active data" onClick={() => fitMapToData(mapRef.current, liveDrones, liveGeofences, selectedDroneTrack)}>
              <Crosshair size={17} />
            </button>
            <button className="icon-button" type="button" aria-label="Reset map to default view" onClick={() => resetMapView(mapRef.current)}>
              <Home size={17} />
            </button>
          </div>
        </div>
        <div className="fleet-map-actions">
        <button className="icon-button" type="button" aria-label="Refresh telemetry" onClick={() => refreshTelemetryNow(telemetryTimerRef, setIsRefreshing, setMapError)}>
          {isRefreshing ? <LoadingLogo label="Refreshing telemetry" size="xs" compact /> : <RefreshCw size={17} />}
        </button>
        {fullscreenButton}
        </div>
      </div>
      <div className="geospatial-map-canvas leaflet-dashboard-map" ref={mapContainerRef} />
      <MapOverlayCard selectedDrone={selectedDrone} selectedDroneTrackLength={selectedDroneTrack.length} />
      <LiveDroneList
        drones={liveDrones}
        lastUpdatedAt={lastUpdatedAt}
        selectedDroneId={selectedDroneId}
        onSelectDrone={setSelectedDroneId}
        replayStatus={getReplayStatus(selectedDrone, isHistoryLoading, selectedDroneTrack.length)}
      />
      <MapLegend />
    </div>
    )}
    </MapWorkspace>
  );
};

const FleetMapDetails = ({ drones, selectedDroneId, onSelectDrone }) => {
  const [openedId, setOpenedId] = useState(null);
  return <div className="fleet-map-details">
    {drones.length === 0 && <p>No drone positions available.</p>}
    {drones.map((drone) => <section className="fleet-drone-accordion" key={drone.id}>
      <button type="button" aria-expanded={openedId === drone.id} aria-controls={`fleet-details-${drone.id}`}
        className={selectedDroneId === drone.id ? "selected" : ""}
        onClick={() => { setOpenedId(openedId === drone.id ? null : drone.id); onSelectDrone(drone.id); }}>
        <strong>{drone.id}</strong><span aria-hidden="true">{openedId === drone.id ? "−" : "+"}</span>
      </button>
      {openedId === drone.id && <dl id={`fleet-details-${drone.id}`}>
        {Object.entries({ Status: drone.isOffline ? "Offline - last position" : formatStatus(drone.flightStatus ?? drone.status), Mission: drone.missionLabel ?? "No active mission", Battery: `${drone.battery ?? "--"}%`, Signal: `${drone.signal ?? "--"}%`, Speed: `${drone.speed ?? "--"} m/s`, Altitude: `${drone.altitude ?? "--"} m`, Heading: `${drone.heading ?? "--"} deg`, Position: formatCoordinate(drone.coordinates) }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>}
    </section>)}
  </div>;
};

const renderDashboardMapLayers = ({ layers, liveDrones, liveGeofences, selectedDrone, selectedDroneId, selectedDroneTrack, onSelectDrone }) => {
  Object.values(layers).forEach((layer) => layer.clearLayers());

  liveGeofences.forEach((zone) => {
    if (!Array.isArray(zone.polygon) || zone.polygon.length < 3) return;
    const restricted = zone.type === "RESTRICTED";
    const warning = zone.type === "WARNING";
    const color = restricted ? "#c61732" : warning ? "#f5b700" : "#1d6fea";
    L.polygon(zone.polygon.map(toLatLng), {
      color,
      weight: 2,
      opacity: 0.82,
      fillColor: color,
      fillOpacity: 0.14
    })
      .bindTooltip(`<strong>${escapeHtml(zone.name ?? "Geofence")}</strong><br/>Type: ${escapeHtml(formatStatus(zone.type))}`)
      .addTo(layers.geofences);
  });

  if (selectedDrone?.missionRoute?.length > 1) {
    L.polyline(selectedDrone.missionRoute.map(toLatLng), {
      color: "#f7c85f",
      weight: 5,
      opacity: 0.92
    }).addTo(layers.routes);
  }

  if (selectedDroneTrack.length > 1) {
    L.polyline(selectedDroneTrack.map(toLatLng), {
      color: selectedDrone?.isOffline ? "#94a3b8" : "#1d6fea",
      weight: 4,
      opacity: 0.92
    }).addTo(layers.tracks);

    selectedDroneTrack.forEach((coordinates, index) => {
      const isCurrent = index === selectedDroneTrack.length - 1;
      const isStart = index === 0;
      L.circleMarker(toLatLng(coordinates), {
        radius: isCurrent ? 7 : isStart ? 6 : 4,
        color: isCurrent ? "#1d6fea" : "#ffffff",
        weight: isCurrent ? 3 : 1,
        fillColor: isCurrent ? "#ffffff" : isStart ? "#52d3ac" : "#4d8dff",
        fillOpacity: 0.88
      }).addTo(layers.tracks);
    });
  }

  liveDrones.forEach((drone) => {
    L.marker(toLatLng(drone.coordinates), {
      icon: createDroneMarkerIcon(drone, drone.id === selectedDroneId)
    })
      .on("click", () => onSelectDrone(drone.id))
      .bindPopup(buildDronePopupHtml(drone), { closeButton: false, maxWidth: 260 })
      .addTo(layers.drones);
  });
};

const createDroneMarkerIcon = (drone, isSelected) => L.divIcon({
  className: "leaflet-route-marker-wrapper",
  html: `
    <button type="button" class="drone-map-marker ${drone.isOffline ? "offline" : drone.status === "IN_MISSION" ? "in-mission" : "standby"} ${isSelected ? "selected" : ""}" style="--drone-heading:${Number(drone.heading ?? 0)}deg" aria-label="${escapeAttribute(`${drone.id} ${drone.isOffline ? "offline" : formatStatus(drone.status)}`)}">
      <span class="drone-marker-pulse"></span>
      <span class="drone-marker-body">
        <span class="drone-marker-glyph" aria-hidden="true"></span>
      </span>
      <span class="drone-marker-label">${escapeHtml(drone.id)} | ${escapeHtml(drone.battery ?? "--")}%</span>
    </button>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

const MapOverlayCard = ({ selectedDrone, selectedDroneTrackLength }) => {
  if (!selectedDrone) return null;

  return (
    <div className="map-overlay-card">
      <div className="map-overlay-head">
        <strong>{selectedDrone.id}</strong>
        <span className={selectedDrone.isOffline ? "offline" : "live"}>
          {selectedDrone.isOffline ? "Offline" : "Tracking"}
        </span>
      </div>
      <div className="map-overlay-grid">
        <div><small>Battery</small><strong>{selectedDrone.battery ?? "--"}%</strong></div>
        <div><small>Signal</small><strong>{selectedDrone.signal ?? "--"}%</strong></div>
        <div><small>Speed</small><strong>{selectedDrone.speed ?? "--"} m/s</strong></div>
        <div><small>Altitude</small><strong>{selectedDrone.altitude ?? "--"} m</strong></div>
        <div><small>Heading</small><strong>{selectedDrone.heading ?? "--"} deg</strong></div>
        <div><small>Replay</small><strong>{selectedDroneTrackLength > 1 ? `${selectedDroneTrackLength} pts` : "Pending"}</strong></div>
        <div><small>Mission</small><strong>{selectedDrone.missionLabel ?? "No active mission"}</strong></div>
        <div><small>Flight Status</small><strong>{formatStatus(selectedDrone.flightStatus ?? selectedDrone.status)}</strong></div>
        <div><small>Source</small><strong>{selectedDrone.simulatorDroneId ?? selectedDrone.source ?? "DroneOps"}</strong></div>
        <div><small>Position</small><strong>{formatCoordinate(selectedDrone.coordinates)}</strong></div>
      </div>
    </div>
  );
};

const LiveDroneList = ({ drones, lastUpdatedAt, selectedDroneId, onSelectDrone, replayStatus }) => (
  <section className="live-drone-list" aria-label="Live drone locations">
    <div className="live-drone-list-header">
      <strong>Active Airspace</strong>
      <span>{lastUpdatedAt ? `Updated ${lastUpdatedAt}` : "Waiting for telemetry"}</span>
      {replayStatus && <span className="live-drone-replay-status">{replayStatus}</span>}
    </div>
    {drones.length === 0 && <p className="empty-state">No live drone coordinates are available yet.</p>}
    {drones.map((drone) => (
      <button
        className={`live-drone-card ${drone.id === selectedDroneId ? "selected" : ""}`}
        key={drone.id}
        type="button"
        onClick={() => onSelectDrone(drone.id)}
      >
        <div>
          <strong>{drone.id}</strong>
          <span>{drone.missionLabel ?? drone.model ?? formatStatus(drone.status)}</span>
        </div>
        <div>
          <span>{drone.isOffline ? "offline - last position" : formatStatus(drone.status)}</span>
          <span>{formatCoordinate(drone.coordinates)}</span>
        </div>
        <div>
          <span>Battery {drone.battery ?? "--"}%</span>
          <span>Signal {drone.signal ?? "--"}%</span>
        </div>
      </button>
    ))}
  </section>
);

const MapLegend = () => (
  <div className="map-legend-panel">
    <div className="map-legend-heading">
      <strong>Legend</strong>
    </div>
    <div className="map-legend">
      <span><i className="dot blue" /> Operational</span>
      <span><i className="dot green" /> In mission</span>
      <span><i className="dot gray" /> Offline</span>
      <span><i className="legend-line blue" /> Replay</span>
      <span><i className="legend-line amber" /> Mission route</span>
      <span><i className="dot white" /> Current point</span>
      <span><i className="dot red" /> Restricted</span>
      <span><i className="dot amber" /> Warning</span>
    </div>
  </div>
);

const getReplayStatus = (selectedDrone, isHistoryLoading, selectedDroneTrackLength) => {
  if (!selectedDrone) return "Select a drone to inspect replay";
  if (isHistoryLoading) return `Loading ${selectedDrone.id} history`;
  if (selectedDroneTrackLength > 1) return `${selectedDrone.id} replay loaded`;
  return `${selectedDrone.id} has no replay track yet`;
};

const getTelemetryFeedStatus = ({ mapReady, mapError, liveDrones }) => {
  if (mapError) return { label: "Feed Error", tone: "error" };
  if (!mapReady) return { label: "Map Loading", tone: "loading" };
  if (liveDrones.some((drone) => !drone.isOffline)) return { label: "Live Feed", tone: "online" };
  if (liveDrones.length > 0) return { label: "Last Positions", tone: "stale" };
  return { label: "No Live Feed", tone: "offline" };
};

const refreshTelemetryNow = async (telemetryTimerRef, setIsRefreshing, setMapError) => {
  window.clearTimeout(telemetryTimerRef.current);
  setIsRefreshing(true);
  setMapError("");
  window.dispatchEvent(new CustomEvent("droneops-map-refresh"));
};

const normalizeTelemetryRow = (row) => {
  const coordinates = normalizeCoordinate([row.telemetry?.location?.longitude, row.telemetry?.location?.latitude]);
  if (!coordinates) return null;

  const timestamp = row.telemetry?.timestamp;
  const isStale = timestamp ? Date.now() - new Date(timestamp).getTime() > OFFLINE_AFTER_MS : true;
  const telemetryStatus = row.telemetry?.status?.toUpperCase?.() ?? "";
  const linkQuality = row.telemetry?.signal?.linkQuality?.toUpperCase?.() ?? "";
  const isCompleted = ["MISSION_COMPLETE", "AIRCRAFT_COMPLETED", "COMPLETED"].includes(telemetryStatus);
  const isOffline = isStale
    || isCompleted
    || ["LOST", "OFFLINE"].includes(linkQuality)
    || ["DISCONNECTED", "GROUNDED"].includes(row.drone?.status);
  const simulator = row.telemetry?.simulator ?? {};
  const activeMission = row.drone?.activeMission ?? null;

  return {
    id: row.drone?.droneCode ?? row.drone?.id ?? "Unknown drone",
    model: row.drone?.model ?? "",
    missionLabel: formatMissionLabel(activeMission),
    missionRoute: normalizeMissionRoute(activeMission?.plannedRoute),
    missionProgress: activeMission?.progress,
    status: row.drone?.status ?? "UNKNOWN",
    telemetryStatus,
    flightStatus: simulator.flightStatus ?? telemetryStatus,
    flightMode: simulator.flightMode,
    simulatorDroneId: simulator.droneId,
    simulatorMissionId: simulator.missionId,
    source: row.telemetry?.source,
    coordinates,
    battery: row.telemetry?.battery?.level,
    signal: row.telemetry?.signal?.strength,
    altitude: row.telemetry?.location?.altitude,
    speed: row.telemetry?.velocity?.speed,
    heading: row.telemetry?.velocity?.heading,
    timestamp,
    isOffline
  };
};

const formatMissionLabel = (mission) => {
  if (!mission) return "";
  return [mission.missionCode, mission.name].filter(Boolean).join(" - ");
};

const normalizeMissionRoute = (plannedRoute) => {
  const routePoints = Array.isArray(plannedRoute?.waypoints)
    ? plannedRoute.waypoints
    : Array.isArray(plannedRoute?.coordinates)
      ? plannedRoute.coordinates
      : [];

  return routePoints
    .map((point) => {
      if (Array.isArray(point)) return normalizeCoordinate(point);
      return normalizeCoordinate([point?.longitude ?? point?.lng ?? point?.lon, point?.latitude ?? point?.lat]);
    })
    .filter(Boolean);
};

const normalizeGeofence = (zone) => {
  const polygon = Array.isArray(zone.polygon) ? zone.polygon : zone.polygon?.coordinates?.[0];
  if (!Array.isArray(polygon)) return null;

  const normalizedPolygon = polygon.map(normalizeCoordinate).filter(Boolean);
  if (!normalizedPolygon.length) return null;

  return { ...zone, polygon: normalizedPolygon };
};

const normalizeCoordinate = (coordinate) => {
  const [longitude, latitude] = coordinate ?? [];
  const parsedLongitude = Number(longitude);
  const parsedLatitude = Number(latitude);
  if (!Number.isFinite(parsedLongitude) || !Number.isFinite(parsedLatitude)) return null;
  return [parsedLongitude, parsedLatitude];
};

const fitMapToData = (map, drones = [], geofences = [], selectedTrack = []) => {
  if (!map) return;

  const latLngs = [
    ...drones.map((drone) => drone.coordinates).filter(Boolean),
    ...geofences.flatMap((zone) => zone.polygon ?? []),
    ...selectedTrack
  ].map(toLatLng);

  if (!latLngs.length) {
    resetMapView(map);
    return;
  }

  map.fitBounds(L.latLngBounds(latLngs), { padding: [60, 60], maxZoom: 14 });
};

const resetMapView = (map) => {
  if (!map) return;
  map.flyTo([mapCenter.latitude, mapCenter.longitude], 12, { duration: 0.8 });
};

const toLatLng = (coordinate) => [Number(coordinate[1]), Number(coordinate[0])];

const buildDronePopupHtml = (drone) => `
  <div class="drone-map-popup">
    <strong>${escapeHtml(drone.id)}</strong>
    <span>Status: ${escapeHtml(drone.isOffline ? "offline - last known position" : formatStatus(drone.status))}</span>
    <span>Battery: ${escapeHtml(drone.battery ?? "--")}%</span>
    <span>Signal: ${escapeHtml(drone.signal ?? "--")}%</span>
    <span>Altitude: ${escapeHtml(drone.altitude ?? "--")} m</span>
    <span>Speed: ${escapeHtml(drone.speed ?? "--")} m/s</span>
    <span>Mission: ${escapeHtml(drone.missionLabel ?? "No active mission")}</span>
    <span>Flight status: ${escapeHtml(formatStatus(drone.flightStatus ?? drone.status))}</span>
    <span>Source: ${escapeHtml(drone.simulatorDroneId ?? drone.source ?? "DroneOps")}</span>
    <span>Location: ${escapeHtml(formatCoordinate(drone.coordinates))}</span>
    <span>Seen: ${escapeHtml(formatTimestamp(drone.timestamp))}</span>
  </div>
`;

const formatStatus = (status = "") => status.toString().toLowerCase().replaceAll("_", " ");

const formatCoordinate = (coordinates = []) => {
  const [longitude, latitude] = coordinates;
  if (typeof latitude !== "number" || typeof longitude !== "number") return "No coordinates";
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
};

const formatTimestamp = (value) => {
  if (!value) return "No timestamp";
  return new Date(value).toLocaleString();
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const escapeAttribute = escapeHtml;

export default GeospatialMap;
