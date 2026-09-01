import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Home, MapPin, MoonStar, RefreshCw, SunDim, SunMedium } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import LoadingLogo from "../common/LoadingLogo";
import { geofenceZones, mapCenter } from "../../data/geospatialData";
import { droneOpsApi } from "../../services/droneOpsApi";
import { getRealtimeSocket } from "../../services/realtimeClient";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const TELEMETRY_REFRESH_MS = 3000;
const DRONE_HISTORY_LIMIT = 30;
const OFFLINE_AFTER_MS = 30000;
const mapPresets = [
  { id: "dawn", label: "Dawn", icon: SunDim, lightPreset: "dawn", theme: "default" },
  { id: "dusk", label: "Dusk", icon: SunMedium, lightPreset: "dusk", theme: "faded" },
  { id: "night", label: "Night", icon: MoonStar, lightPreset: "night", theme: "monochrome" }
];
const GeospatialMap = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const droneMarkersRef = useRef(new Map());
  const telemetryTimerRef = useRef(null);
  const telemetryErrorCountRef = useRef(0);
  const hasAutoFramedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [liveDrones, setLiveDrones] = useState([]);
  const [liveGeofences, setLiveGeofences] = useState(geofenceZones);
  const [selectedDroneId, setSelectedDroneId] = useState("");
  const [selectedDroneTrack, setSelectedDroneTrack] = useState([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [mapError, setMapError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [geofenceMessage, setGeofenceMessage] = useState("");
  const [telemetrySyncMessage, setTelemetrySyncMessage] = useState("");
  const [mapPresetId, setMapPresetId] = useState("dusk");

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

        const normalizedGeofences = geofenceRows
          .map(normalizeGeofence)
          .filter(Boolean);

        if (normalizedGeofences.length) {
          setLiveGeofences(normalizedGeofences);
          setGeofenceMessage("");
          return;
        }

        setGeofenceMessage("No live geofences configured. Showing reference zones.");
      } catch (error) {
        if (!isMounted) return;
        setGeofenceMessage(`Geofences unavailable. ${error.message}`);
      }
    };

    loadGeofences();

    return () => {
      isMounted = false;
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
        if (!options.keepSyncError) {
          setMapError("");
        }
        if (!options.keepSyncMessage) {
          setTelemetrySyncMessage("");
        }

        const nextDrones = telemetryRows
          .map(normalizeTelemetryRow)
          .filter(Boolean)
          .sort((left, right) => {
            if (left.isOffline === right.isOffline) return left.id.localeCompare(right.id);
            return left.isOffline ? 1 : -1;
          });

        setLiveDrones(nextDrones);
        setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setSelectedDroneId((current) => {
          if (current && nextDrones.some((drone) => drone.id === current)) return current;
          return nextDrones[0]?.id ?? "";
        });

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

  const deckLayers = useMemo(() => {
    const layers = [
      new PolygonLayer({
        id: "geofence-zones",
        data: liveGeofences,
        getPolygon: (zone) => zone.polygon,
        getFillColor: (zone) => zone.type === "RESTRICTED" ? [198, 23, 50, 36] : zone.type === "WARNING" ? [245, 183, 0, 36] : [29, 111, 234, 24],
        getLineColor: (zone) => zone.type === "RESTRICTED" ? [198, 23, 50, 210] : zone.type === "WARNING" ? [245, 183, 0, 210] : [29, 111, 234, 180],
        getLineWidth: 3,
        lineWidthMinPixels: 2,
        stroked: true,
        filled: true,
        pickable: true
      })
    ];

    if (selectedDrone?.missionRoute?.length > 1) {
      layers.push(
        new PathLayer({
          id: "active-mission-route",
          data: [{ path: selectedDrone.missionRoute }],
          getPath: (item) => item.path,
          getColor: [247, 200, 95, 235],
          getWidth: 6,
          widthMinPixels: 4,
          rounded: true
        })
      );
    }

    if (selectedDroneTrack.length > 1) {
      layers.push(
        new PathLayer({
          id: "selected-drone-path",
          data: [{ path: selectedDroneTrack }],
          getPath: (item) => item.path,
          getColor: selectedDrone?.isOffline ? [148, 163, 184, 220] : [29, 111, 234, 235],
          getWidth: 4,
          widthMinPixels: 3,
          rounded: true
        }),
        new ScatterplotLayer({
          id: "selected-drone-breadcrumbs",
          data: selectedDroneTrack.map((coordinates, index) => ({
            coordinates,
            isCurrent: index === selectedDroneTrack.length - 1,
            isStart: index === 0
          })),
          getPosition: (item) => item.coordinates,
          getRadius: (item) => item.isCurrent ? 22 : item.isStart ? 18 : 10,
          radiusMinPixels: 3,
          radiusMaxPixels: 14,
          stroked: true,
          filled: true,
          getFillColor: (item) => item.isCurrent
            ? [255, 255, 255, 230]
            : item.isStart
              ? [82, 211, 172, 220]
              : selectedDrone?.isOffline
                ? [148, 163, 184, 180]
                : [77, 141, 255, 170],
          getLineColor: (item) => item.isCurrent ? [29, 111, 234, 255] : [255, 255, 255, 180],
          getLineWidth: (item) => item.isCurrent ? 3 : 1,
          lineWidthMinPixels: 1,
          pickable: false
        })
      );
    }

    return layers;
  }, [liveGeofences, selectedDrone, selectedDroneTrack]);

  useEffect(() => {
    if (!mapboxToken || mapRef.current || !mapContainerRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const droneMarkers = droneMarkersRef.current;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      config: {
        basemap: {
          lightPreset: "dusk",
          theme: "faded"
        }
      },
      center: [mapCenter.longitude, mapCenter.latitude],
      zoom: 12.4,
      pitch: 54,
      bearing: -18,
      attributionControl: false
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: getMapTooltip
    });

    overlayRef.current = overlay;

    map.on("load", () => {
      map.addControl(overlay);
      setMapReady(true);
    });

    return () => {
      overlay.finalize();
      droneMarkers.forEach((marker) => marker.remove());
      droneMarkers.clear();
      map.remove();
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    overlayRef.current?.setProps({ layers: deckLayers });
  }, [deckLayers]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapContainerRef.current) return;

    let resizeFrame = 0;
    const resizeMap = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    };

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resizeMap)
      : null;

    resizeObserver?.observe(mapContainerRef.current);
    window.addEventListener("droneops-map-layout-change", resizeMap);
    resizeMap();

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("droneops-map-layout-change", resizeMap);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const preset = mapPresets.find((item) => item.id === mapPresetId);
    if (!preset) return;

    mapRef.current.setConfigProperty("basemap", "lightPreset", preset.lightPreset);
    mapRef.current.setConfigProperty("basemap", "theme", preset.theme);
  }, [mapPresetId, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const activeMarkerIds = new Set(liveDrones.map((drone) => drone.id));

    droneMarkersRef.current.forEach((marker, markerId) => {
      if (!activeMarkerIds.has(markerId)) {
        marker.remove();
        droneMarkersRef.current.delete(markerId);
      }
    });

    liveDrones.forEach((drone) => {
      const existingMarker = droneMarkersRef.current.get(drone.id);
      const popup = new mapboxgl.Popup(getDronePopupOptions(drone, mapRef.current)).setHTML(buildDronePopupHtml(drone));

      if (existingMarker) {
        existingMarker.setLngLat(drone.coordinates);
        existingMarker.setPopup(popup);
        updateDroneMarkerElement(existingMarker.getElement(), drone, drone.id === selectedDroneId);
        placeDroneMarkerLabel(existingMarker.getElement(), drone, mapRef.current);
        return;
      }

      const markerElement = buildDroneMarkerElement(drone, drone.id === selectedDroneId, setSelectedDroneId);
      placeDroneMarkerLabel(markerElement, drone, mapRef.current);
      const marker = new mapboxgl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat(drone.coordinates)
        .setPopup(popup)
        .addTo(mapRef.current);

      droneMarkersRef.current.set(drone.id, marker);
    });
  }, [liveDrones, mapReady, selectedDroneId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = mapRef.current;
    const updateLabelPositions = () => {
      liveDrones.forEach((drone) => {
        const marker = droneMarkersRef.current.get(drone.id);
        if (marker) placeDroneMarkerLabel(marker.getElement(), drone, map);
      });
    };

    map.on("move", updateLabelPositions);
    map.on("zoom", updateLabelPositions);
    map.on("resize", updateLabelPositions);
    window.addEventListener("droneops-map-layout-change", updateLabelPositions);
    updateLabelPositions();

    return () => {
      map.off("move", updateLabelPositions);
      map.off("zoom", updateLabelPositions);
      map.off("resize", updateLabelPositions);
      window.removeEventListener("droneops-map-layout-change", updateLabelPositions);
    };
  }, [liveDrones, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !liveDrones.length || hasAutoFramedRef.current) return;
    fitMapToData(mapRef.current, liveDrones, liveGeofences, selectedDroneTrack);
    hasAutoFramedRef.current = true;
  }, [liveDrones, liveGeofences, mapReady, selectedDroneTrack]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedDrone) return;
    mapRef.current.easeTo({
      center: selectedDrone.coordinates,
      duration: 800,
      zoom: Math.max(mapRef.current.getZoom(), 13.8)
    });
  }, [mapReady, selectedDrone]);

  if (!mapboxToken) {
    return <FallbackOperationalMap />;
  }

  return (
    <div className="panel map-panel geospatial-panel">
      <div className="panel-heading compact map-panel-heading">
        <div>
          <div className="map-title-row">
            <h3>Telemetry Map</h3>
            <span className={`map-status ${telemetryStatus.tone}`}>{telemetryStatus.label}</span>
          </div>
          <p>{mapError || telemetrySyncMessage || geofenceMessage || "Live fleet positions, selected-drone replay, and geofence overlays."}</p>
        </div>
        <div className="map-toolbar">
          <div className="map-preset-switcher" aria-label="Map lighting preset">
            {mapPresets.map((preset) => {
              const Icon = preset.icon;
              const isActive = preset.id === mapPresetId;
              return (
                <button
                  key={preset.id}
                  className={isActive ? "active" : ""}
                  type="button"
                  onClick={() => setMapPresetId(preset.id)}
                  aria-pressed={isActive}
                >
                  <Icon size={15} />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
          <div className="map-view-controls" aria-label="Map view controls">
            <button className="icon-button" type="button" aria-label="Center map on active data" onClick={() => fitMapToData(mapRef.current, liveDrones, liveGeofences, selectedDroneTrack)}>
              <Crosshair size={17} />
            </button>
            <button className="icon-button" type="button" aria-label="Reset map to default view" onClick={() => resetMapView(mapRef.current)}>
              <Home size={17} />
            </button>
          </div>
        </div>
        <button className="icon-button map-refresh-button" type="button" aria-label="Refresh telemetry" onClick={() => refreshTelemetryNow(telemetryTimerRef, setIsRefreshing, setMapError)}>
          {isRefreshing ? <LoadingLogo label="Refreshing telemetry" size="xs" compact /> : <RefreshCw size={17} />}
        </button>
      </div>
      <div className="mapbox-canvas" ref={mapContainerRef} />
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
  );
};

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
        <div>
          <small>Battery</small>
          <strong>{selectedDrone.battery ?? "--"}%</strong>
        </div>
        <div>
          <small>Signal</small>
          <strong>{selectedDrone.signal ?? "--"}%</strong>
        </div>
        <div>
          <small>Speed</small>
          <strong>{selectedDrone.speed ?? "--"} m/s</strong>
        </div>
        <div>
          <small>Altitude</small>
          <strong>{selectedDrone.altitude ?? "--"} m</strong>
        </div>
        <div>
          <small>Heading</small>
          <strong>{selectedDrone.heading ?? "--"} deg</strong>
        </div>
        <div>
          <small>Replay</small>
          <strong>{selectedDroneTrackLength > 1 ? `${selectedDroneTrackLength} pts` : "Pending"}</strong>
        </div>
        <div>
          <small>Mission</small>
          <strong>{selectedDrone.missionLabel ?? "No active mission"}</strong>
        </div>
        <div>
          <small>Flight Status</small>
          <strong>{formatStatus(selectedDrone.flightStatus ?? selectedDrone.status)}</strong>
        </div>
        <div>
          <small>Source</small>
          <strong>{selectedDrone.simulatorDroneId ?? selectedDrone.source ?? "DroneOps"}</strong>
        </div>
        <div>
          <small>Position</small>
          <strong>{formatCoordinate(selectedDrone.coordinates)}</strong>
        </div>
      </div>
    </div>
  );
};

const LiveDroneList = ({ drones, lastUpdatedAt, selectedDroneId, onSelectDrone, replayStatus }) => {
  return (
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
};

const buildDroneMarkerElement = (drone, isSelected, onSelect) => {
  const element = document.createElement("button");
  element.type = "button";
  element.addEventListener("click", () => onSelect(drone.id));
  updateDroneMarkerElement(element, drone, isSelected);
  return element;
};

const updateDroneMarkerElement = (element, drone, isSelected) => {
  element.className = `drone-map-marker ${drone.isOffline ? "offline" : drone.status === "IN_MISSION" ? "in-mission" : "standby"} ${isSelected ? "selected" : ""}`;
  element.style.setProperty("--drone-heading", `${Number(drone.heading ?? 0)}deg`);
  element.setAttribute("aria-label", `${drone.id} ${drone.isOffline ? "offline" : formatStatus(drone.status)}`);
  element.innerHTML = `
    <span class="drone-marker-pulse"></span>
    <span class="drone-marker-body">
      <span class="drone-marker-glyph" aria-hidden="true"></span>
    </span>
    <span class="drone-marker-label">${drone.id} | ${drone.battery ?? "--"}%</span>
  `;
};

const placeDroneMarkerLabel = (element, drone, map) => {
  if (!map) return;

  const canvas = map.getCanvas();
  const point = map.project(drone.coordinates);
  const labelWidth = Math.max(86, String(drone.id ?? "").length * 8 + 44);
  const sideBuffer = labelWidth / 2 + 12;
  const topBuffer = 42;
  const bottomBuffer = 58;
  const classNames = ["label-top", "label-bottom", "label-left", "label-right"];

  element.classList.remove(...classNames);

  if (point.x < sideBuffer) {
    element.classList.add("label-right");
    return;
  }

  if (point.x > canvas.clientWidth - sideBuffer) {
    element.classList.add("label-left");
    return;
  }

  if (point.y < topBuffer) {
    element.classList.add("label-bottom");
    return;
  }

  if (point.y > canvas.clientHeight - bottomBuffer) {
    element.classList.add("label-top");
    return;
  }

  element.classList.add("label-top");
};

const buildDronePopupHtml = (drone) => {
  return `
    <div class="drone-map-popup">
      <strong>${drone.id}</strong>
      <span>Status: ${drone.isOffline ? "offline - last known position" : formatStatus(drone.status)}</span>
      <span>Battery: ${drone.battery ?? "--"}%</span>
      <span>Signal: ${drone.signal ?? "--"}%</span>
      <span>Altitude: ${drone.altitude ?? "--"} m</span>
      <span>Speed: ${drone.speed ?? "--"} m/s</span>
      <span>Mission: ${drone.missionLabel ?? "No active mission"}</span>
      <span>Flight status: ${formatStatus(drone.flightStatus ?? drone.status)}</span>
      <span>Source: ${drone.simulatorDroneId ?? drone.source ?? "DroneOps"}</span>
      <span>Location: ${formatCoordinate(drone.coordinates)}</span>
      <span>Seen: ${formatTimestamp(drone.timestamp)}</span>
    </div>
  `;
};

const getDronePopupOptions = (drone, map) => {
  const point = map?.project(drone.coordinates);
  const canvas = map?.getCanvas();
  const options = {
    closeButton: false,
    closeOnMove: false,
    maxWidth: "260px",
    offset: {
      top: [0, 30],
      bottom: [0, -30],
      left: [-30, 0],
      right: [30, 0],
      "top-left": [22, 30],
      "top-right": [-22, 30],
      "bottom-left": [22, -30],
      "bottom-right": [-22, -30]
    }
  };

  if (!point || !canvas) return options;

  const nearLeft = point.x < 180;
  const nearRight = point.x > canvas.clientWidth - 180;
  const nearTop = point.y < 145;
  const nearBottom = point.y > canvas.clientHeight - 185;

  if (nearBottom && nearLeft) return { ...options, anchor: "bottom-left" };
  if (nearBottom && nearRight) return { ...options, anchor: "bottom-right" };
  if (nearTop && nearLeft) return { ...options, anchor: "top-left" };
  if (nearTop && nearRight) return { ...options, anchor: "top-right" };
  if (nearBottom) return { ...options, anchor: "bottom" };
  if (nearTop) return { ...options, anchor: "top" };
  if (nearLeft) return { ...options, anchor: "left" };
  if (nearRight) return { ...options, anchor: "right" };
  return options;
};

const FallbackOperationalMap = () => {
  return (
    <div className="panel map-panel">
      <div className="panel-heading compact">
        <div>
          <h3>Telemetry Map</h3>
          <p>Live telemetry map is waiting for map service configuration.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Center map">
          <Home size={17} />
        </button>
      </div>
      <div className="map-canvas geospatial-fallback" aria-label="Drone location map">
        <div className="map-grid" />
        <div className="geofence-shape restricted" />
        <div className="geofence-shape warning" />
        <div className="flight-path-line" />
        <MapPin className="map-pin pin-a" size={34} />
        <MapPin className="map-pin pin-b" size={28} />
        <MapPin className="map-pin pin-c" size={30} />
        <div className="map-label">Telemetry map surface ready</div>
      </div>
      <MapLegend />
    </div>
  );
};

const MapLegend = () => {
  return (
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
};

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

  return {
    ...zone,
    polygon: normalizedPolygon
  };
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

  const bounds = new mapboxgl.LngLatBounds();
  let hasBounds = false;

  drones.forEach((drone) => {
    bounds.extend(drone.coordinates);
    hasBounds = true;
  });

  geofences.forEach((zone) => {
    zone.polygon?.forEach((coordinate) => {
      bounds.extend(coordinate);
      hasBounds = true;
    });
  });

  selectedTrack.forEach((coordinate) => {
    bounds.extend(coordinate);
    hasBounds = true;
  });

  if (!hasBounds) {
    resetMapView(map);
    return;
  }

  map.fitBounds(bounds, {
    padding: 60,
    duration: 900,
    maxZoom: 14.5
  });
};

const resetMapView = (map) => {
  if (!map) return;
  map.easeTo({
    center: [mapCenter.longitude, mapCenter.latitude],
    zoom: 12.4,
    pitch: 54,
    bearing: -18,
    duration: 800
  });
};

const getMapTooltip = ({ object, layer }) => {
  if (!object) return null;

  if (layer?.id === "geofence-zones") {
    return {
      html: `
        <strong>${object.name ?? "Geofence"}</strong><br/>
        Type: ${formatStatus(object.type)}
      `
    };
  }

  return null;
};

const formatStatus = (status = "") => {
  return status.toString().toLowerCase().replaceAll("_", " ");
};

const formatCoordinate = (coordinates = []) => {
  const [longitude, latitude] = coordinates;
  if (typeof latitude !== "number" || typeof longitude !== "number") return "No coordinates";
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
};

const formatTimestamp = (value) => {
  if (!value) return "No timestamp";
  return new Date(value).toLocaleString();
};

export default GeospatialMap;
