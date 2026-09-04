/* oxlint-disable react-hooks/exhaustive-deps */
import { MapPin } from "lucide-react";
import MapWorkspace, { MapDataDetails } from "../../../components/maps/MapWorkspace";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOperationalGeofences } from "../../../hooks/useOperationalGeofences";

const defaultCenter = { latitude: -33.8679, longitude: 151.2073 };

const MissionRouteMap = ({ waypoints = [], launchSite = null, operatingArea = null, authorityAnalysis = null, telemetry = null, telemetryTrail = [], telemetryMode = "planned", incidentLocation = null, context = null, geofences: suppliedGeofences, onMapClick, showEmptyMap = false }) => {
  const operationalGeofences = useOperationalGeofences(suppliedGeofences === undefined);
  const geofences = suppliedGeofences ?? operationalGeofences.zones;
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const hasFittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const routePoints = useMemo(() => waypoints.filter(hasCoordinates), [waypoints]);
  const telemetryPoints = useMemo(() => {
    const points = Array.isArray(telemetryTrail) ? telemetryTrail.map(normaliseTelemetryPoint).filter(hasCoordinates) : [];
    const latestPoint = normaliseTelemetryPoint(telemetry);

    if (hasCoordinates(latestPoint) && !points.some((point) => pointsAreSame(point, latestPoint))) {
      points.push(latestPoint);
    }

    return points;
  }, [telemetry, telemetryTrail]);
  const latestTelemetryPoint = telemetryPoints[telemetryPoints.length - 1] ?? null;
  const locationPoints = useMemo(() => [
    { ...normaliseLocation(launchSite), markerLabel: "L", popupLabel: "Launch Site", markerClass: "launch" },
    { ...normaliseLocation(operatingArea), markerLabel: "A", popupLabel: "Operating Area", markerClass: "area" }
  ].filter(hasCoordinates), [launchSite, operatingArea]);
  const incidentPoint = useMemo(() => normaliseLocation(incidentLocation), [incidentLocation]);
  const mapPoints = useMemo(() => [
    ...routePoints,
    ...locationPoints,
    ...telemetryPoints,
    ...(hasCoordinates(incidentPoint) ? [incidentPoint] : [])
  ], [incidentPoint, locationPoints, routePoints, telemetryPoints]);
  const councilOverlay = useMemo(() => createCouncilOverlay(authorityAnalysis), [authorityAnalysis]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current || (!showEmptyMap && mapPoints.length === 0)) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: toLatLng(getInitialCenter(mapPoints)),
        zoom: mapPoints.length > 1 ? 12 : 14,
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
        councils: L.layerGroup().addTo(map),
        operatingArea: L.layerGroup().addTo(map),
        route: L.layerGroup().addTo(map),
        telemetry: L.layerGroup().addTo(map),
        markers: L.layerGroup().addTo(map)
      };
      map.on("click", (event) => clickRef.current?.([event.latlng.lng,event.latlng.lat]));

      resizeObserverRef.current = new ResizeObserver(() => map.invalidateSize());
      resizeObserverRef.current.observe(mapContainerRef.current);
      mapRef.current = map;
      setMapReady(true);
    } catch (error) {
      setMapError(error.message || "Mission route map failed to load.");
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
    const layer=layersRef.current.geofences;
    layer.clearLayers();
    geofences.filter(zone=>zone.isActive!==false&&Array.isArray(zone.polygon)&&zone.polygon.length>=3).forEach(zone=>{
      const color=zone.type==="RESTRICTED"?"#dc2626":zone.type==="WARNING"?"#d97706":"#2563eb";
      const label=document.createElement("span");label.textContent=`${zone.name} (${zone.type})`;
      L.polygon(zone.polygon.map(([lng,lat])=>[lat,lng]),{color,weight:2,fillOpacity:0.14}).bindTooltip(label).addTo(layer);
    });
  }, [geofences,mapReady,mapPoints]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !layersRef.current) return;
    if (mapPoints.length === 0) {
      Object.entries(layersRef.current).forEach(([name, layer]) => { if (name !== "geofences") layer.clearLayers(); });
      hasFittedRef.current = false;
      return;
    }

    renderMapLayers({
      layers: layersRef.current,
      routePoints,
      locationPoints,
      operatingArea: normaliseLocation(operatingArea),
      councilOverlay,
      telemetryPoints,
      latestTelemetryPoint,
      telemetryMode,
      incidentPoint
    });

    if (!hasFittedRef.current) {
      fitMapToPoints(mapRef.current, mapPoints);
      hasFittedRef.current = true;
    }
  }, [councilOverlay, incidentPoint, latestTelemetryPoint, locationPoints, mapPoints, mapReady, operatingArea, routePoints, telemetryMode, telemetryPoints]);

  if (mapPoints.length === 0 && !showEmptyMap) {
    return (
      <div className="mission-profile-map-empty">
        <MapPin size={20} />
        <span>No route points have been selected for this mission.</span>
      </div>
    );
  }

  return (
    <MapWorkspace overlayControls title={incidentLocation ? "Incident map" : telemetry ? "Aircraft map" : "Mission route"} details={<>
      <MapDataDetails title="Details" value={context} />
      <MapDataDetails title="Geofences" value={geofences.filter(zone => zone.isActive !== false).map(zone => zone.name)} />
      {operationalGeofences.error && <p role="status">{operationalGeofences.error}</p>}
      <MapDataDetails title="Route summary" value={{ waypoints: routePoints.length, telemetryRecords: telemetryPoints.length, mode: telemetryMode }} />
      <MapDataDetails title="Council areas" value={authorityAnalysis?.authorities?.map((item) => item.authorityName ?? item.name)} />
      <MapDataDetails title="Launch site" value={launchSite} />
      <MapDataDetails title="Incident location" value={incidentLocation} />
      <MapDataDetails title="Aircraft telemetry" value={telemetry} />
      <MapDataDetails title="Waypoints" value={routePoints} />
    </>}>
    <div className="mission-profile-map-shell leaflet-mission-map-shell">
      <div className="mission-profile-map leaflet-mission-map" ref={mapContainerRef} />
      {!mapReady && !mapError && <div className="mission-profile-map-status">Loading mission route...</div>}
      {mapError && <div className="mission-profile-map-status error">{mapError}</div>}
    </div>
    </MapWorkspace>
  );
};

const renderMapLayers = ({ layers, routePoints, locationPoints, operatingArea, councilOverlay, telemetryPoints, latestTelemetryPoint, telemetryMode, incidentPoint }) => {
  Object.entries(layers).forEach(([key,layer]) => { if(key!=="geofences") layer.clearLayers(); });

  if (councilOverlay?.features?.length) {
    L.geoJSON(councilOverlay, {
      style: {
        color: "#7c3aed",
        weight: 2,
        opacity: 0.62,
        fillColor: "#8b5cf6",
        fillOpacity: 0.12
      }
    }).addTo(layers.councils);
  }

  if (hasCoordinates(operatingArea)) {
    L.circle(toLatLng(operatingArea), {
      radius: Number(operatingArea.radiusMeters) || 500,
      color: "#2563eb",
      weight: 1.5,
      opacity: 0.48,
      dashArray: "6 8",
      fillColor: "#93c5fd",
      fillOpacity: 0.05,
      interactive: false
    }).addTo(layers.operatingArea);
  }

  const routeLatLngs = routePoints.map(toLatLng);
  if (routeLatLngs.length >= 2) {
    L.polyline(routeLatLngs, {
      color: "#2563eb",
      weight: 4,
      opacity: 0.9,
      dashArray: "8 6"
    }).addTo(layers.route);
  }

  const telemetryLatLngs = telemetryPoints.map(toLatLng);
  if (telemetryLatLngs.length >= 2) {
    L.polyline(telemetryLatLngs, {
      color: "#04111f",
      weight: 7,
      opacity: 0.42
    }).addTo(layers.telemetry);
    L.polyline(telemetryLatLngs, {
      color: "#2cf4b6",
      weight: 4,
      opacity: 0.94
    }).addTo(layers.telemetry);
  }

  routePoints.forEach((point, index) => {
    L.marker(toLatLng(point), {
      icon: createMarkerIcon(getMarkerLabel(index, routePoints.length), "route", getPointLabel(index, routePoints.length))
    })
      .bindPopup(getPointLabel(index, routePoints.length))
      .addTo(layers.markers);
  });

  locationPoints.forEach((point) => {
    L.marker(toLatLng(point), {
      icon: createMarkerIcon(point.markerLabel, `location ${point.markerClass}`, point.popupLabel)
    })
      .bindPopup(point.popupLabel)
      .addTo(layers.markers);
  });

  if (hasCoordinates(latestTelemetryPoint)) {
    L.marker(toLatLng(latestTelemetryPoint), {
      icon: createMarkerIcon("", `drone ${telemetryMode === "recorded" ? "recorded" : "live"}`, telemetryMode === "recorded" ? "Recorded aircraft position" : "Live aircraft position")
    })
      .bindPopup(buildTelemetryPopup(latestTelemetryPoint))
      .addTo(layers.markers);
  }

  if (hasCoordinates(incidentPoint)) {
    L.marker(toLatLng(incidentPoint), {
      icon: createMarkerIcon("!", "incident", "Incident Location")
    })
      .bindPopup(incidentPoint.label || "Incident Location")
      .addTo(layers.markers);
  }
};

const createMarkerIcon = (label, className, title) => L.divIcon({
  className: "leaflet-route-marker-wrapper",
  html: `<button type="button" class="route-picker-marker mission-profile-map-marker ${className}" aria-label="${escapeAttribute(title)}"><span class="route-picker-marker-bubble">${escapeHtml(label)}</span><span class="route-picker-marker-tag">${escapeHtml(title)}</span></button>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const buildTelemetryPopup = (point) => `
  <strong>${escapeHtml(point.label || "Aircraft")}</strong><br />
  ${escapeHtml(formatMarkerLine("Status", point.status))}<br />
  ${escapeHtml(formatMarkerLine("Battery", point.battery))}<br />
  ${escapeHtml(formatMarkerLine("Speed", point.speed))}<br />
  ${escapeHtml(formatMarkerLine("Updated", point.timestamp))}
`;

const fitMapToPoints = (map, points) => {
  if (points.length === 1) {
    map.flyTo(toLatLng(points[0]), 14, { duration: 0.7 });
    return;
  }

  map.fitBounds(L.latLngBounds(points.map(toLatLng)), { padding: [62, 62], maxZoom: 15 });
};

const hasCoordinates = (point) => {
  if (!point) return false;
  if (point.latitude == null || point.longitude == null || point.latitude === "" || point.longitude === "") return false;
  return Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
};

const normaliseLocation = (location) => {
  if (!location || typeof location !== "object") return {};
  return {
    label: location.label,
    latitude: location.latitude ?? location.lat,
    longitude: location.longitude ?? location.lng ?? location.lon,
    radiusMeters: location.radiusMeters ?? location.radius
  };
};

const normaliseTelemetryPoint = (record) => {
  if (!record || typeof record !== "object") return null;
  const raw = record.simulator?.raw ?? record.raw ?? record;
  const latitude = record.location?.latitude ?? getNestedValue(raw, "position.latitude") ?? raw.latitude ?? raw.lat;
  const longitude = record.location?.longitude ?? getNestedValue(raw, "position.longitude") ?? raw.longitude ?? raw.lng ?? raw.lon;

  return {
    label: record.drone ?? record.droneCode ?? record.simulator?.droneId ?? raw.drone_id ?? "Aircraft",
    latitude,
    longitude,
    altitude: record.location?.altitude ?? getNestedValue(raw, "position.altitude_agl_m") ?? raw.altitude_agl_m ?? raw.altitude_m,
    battery: record.battery?.level ?? getNestedValue(raw, "power.remaining_percent") ?? raw.battery_percent,
    speed: record.velocity?.speed ?? getNestedValue(raw, "motion.ground_speed_mps") ?? raw.speed_mps,
    status: record.status ?? getNestedValue(raw, "aircraft.flight_status") ?? raw.flight_status,
    timestamp: record.timestamp ?? raw.timestamp ?? raw.recorded_at_utc
  };
};

const getNestedValue = (source, path) => {
  if (!source || !path) return undefined;
  return path.split(".").reduce((current, key) => current?.[key], source);
};

const pointsAreSame = (first, second) => {
  if (!hasCoordinates(first) || !hasCoordinates(second)) return false;
  return Number(first.latitude) === Number(second.latitude) && Number(first.longitude) === Number(second.longitude);
};

const createCouncilOverlay = (authorityAnalysis) => {
  const features = Array.isArray(authorityAnalysis?.authorities)
    ? authorityAnalysis.authorities
      .filter((authority) => authority.geometry)
      .map((authority) => ({
        type: "Feature",
        geometry: authority.geometry,
        properties: {
          authorityName: authority.authorityName,
          lgaName: authority.lgaName,
          source: authority.source
        }
      }))
    : [];

  return features.length ? { type: "FeatureCollection", features } : null;
};

const toLatLng = (point) => [Number(point.latitude), Number(point.longitude)];

const getInitialCenter = (points) => points.find(hasCoordinates) ?? defaultCenter;

const getPointLabel = (index, total) => {
  if (index === 0) return "Start Point";
  if (index === total - 1) return "End Point";
  return `Stop ${index}`;
};

const getMarkerLabel = (index, total) => {
  if (index === 0) return "S";
  if (index === total - 1) return "E";
  return String(index);
};

const formatMarkerLine = (label, value) => {
  if (value === null || value === undefined || value === "") return `${label}: No data`;
  if (label === "Battery") {
    const number = Number(value);
    return `${label}: ${Number.isFinite(number) ? `${Math.round(number)}%` : value}`;
  }
  if (label === "Speed") {
    const number = Number(value);
    return `${label}: ${Number.isFinite(number) ? `${number.toFixed(1)} m/s` : value}`;
  }
  if (label === "Updated") {
    const date = new Date(value);
    return `${label}: ${Number.isNaN(date.getTime()) ? value : date.toLocaleString()}`;
  }
  return `${label}: ${String(value).replaceAll("_", " ")}`;
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const escapeAttribute = escapeHtml;

export default MissionRouteMap;
