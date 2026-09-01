/* oxlint-disable react-hooks/exhaustive-deps */
import { MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = [151.2073, -33.8679];

const MissionRouteMap = ({ waypoints = [], launchSite = null, operatingArea = null, telemetry = null, telemetryTrail = [], telemetryMode = "planned" }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef([]);
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
  const mapPoints = useMemo(() => [...routePoints, ...locationPoints, ...telemetryPoints], [locationPoints, routePoints, telemetryPoints]);

  useEffect(() => {
    if (!mapboxToken || mapRef.current || !mapContainerRef.current || mapPoints.length === 0) return;

    let isMounted = true;

    const setupMap = async () => {
      try {
        const mapboxModule = await import("mapbox-gl");
        if (!isMounted) return;

        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = mapboxToken;
        mapboxRef.current = mapboxgl;

        mapRef.current = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/navigation-night-v1",
          center: getInitialCenter(mapPoints),
          zoom: mapPoints.length > 1 ? 12 : 14,
          pitch: 18,
          bearing: -8,
          interactive: true
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
        mapRef.current.on("load", () => {
          if (!isMounted) return;
          setMapReady(true);
          renderRoute(mapRef.current, mapboxgl, routePoints, locationPoints, telemetryPoints, latestTelemetryPoint, telemetryMode, markersRef);
        });

        const resizeObserver = new ResizeObserver(() => mapRef.current?.resize());
        resizeObserver.observe(mapContainerRef.current);
        mapRef.current.once("remove", () => resizeObserver.disconnect());
      } catch (error) {
        if (isMounted) setMapError(error.message);
      }
    };

    setupMap();

    return () => {
      isMounted = false;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapboxRef.current || mapPoints.length === 0) return;
    mapRef.current.resize();
    updateRouteSource(mapRef.current, routePoints);
    updateOperatingAreaSource(mapRef.current, normaliseLocation(operatingArea));
    updateTelemetrySource(mapRef.current, telemetryPoints, latestTelemetryPoint);
    resetMarkers(markersRef);
    addMarkers(mapRef.current, mapboxRef.current, routePoints, locationPoints, latestTelemetryPoint, telemetryMode, markersRef);
    if (!hasFittedRef.current) {
      fitMapToRoute(mapRef.current, mapboxRef.current, mapPoints);
      hasFittedRef.current = true;
    }
  }, [latestTelemetryPoint, locationPoints, mapPoints, mapReady, routePoints, telemetryMode, telemetryPoints]);

  if (!mapboxToken) {
    return (
      <div className="mission-profile-map-empty">
        <MapPin size={20} />
        <span>Route map is unavailable.</span>
      </div>
    );
  }

  if (mapPoints.length === 0) {
    return (
      <div className="mission-profile-map-empty">
        <MapPin size={20} />
        <span>No route points have been selected for this mission.</span>
      </div>
    );
  }

  return (
    <div className="mission-profile-map-shell">
      <div className="mission-profile-map" ref={mapContainerRef} />
      {!mapReady && !mapError && <div className="mission-profile-map-status">Loading mission route...</div>}
      {mapError && <div className="mission-profile-map-status error">{mapError}</div>}
    </div>
  );
};

const renderRoute = (map, mapboxgl, points, locationPoints, telemetryPoints, latestTelemetryPoint, telemetryMode, markersRef) => {
  updateRouteSource(map, points);
  updateOperatingAreaSource(map, locationPoints.find((point) => point.markerClass === "area"));
  updateTelemetrySource(map, telemetryPoints, latestTelemetryPoint);
  addMarkers(map, mapboxgl, points, locationPoints, latestTelemetryPoint, telemetryMode, markersRef);
  fitMapToRoute(map, mapboxgl, [...points, ...locationPoints, ...telemetryPoints]);
};

const updateRouteSource = (map, points) => {
  const routeData = createRouteData(points);

  if (!map.getSource("mission-profile-route-line")) {
    map.addSource("mission-profile-route-line", {
      type: "geojson",
      data: routeData
    });
    map.addLayer({
      id: "mission-profile-route-line",
      type: "line",
      source: "mission-profile-route-line",
      paint: {
        "line-color": "#73a8ff",
        "line-width": 4,
        "line-opacity": 0.9
      }
    });
    return;
  }

  map.getSource("mission-profile-route-line")?.setData(routeData);
};

const updateOperatingAreaSource = (map, operatingArea) => {
  const areaData = hasCoordinates(operatingArea)
    ? createCircleFeature(
        [Number(operatingArea.longitude), Number(operatingArea.latitude)],
        Number(operatingArea.radiusMeters) || 500
      )
    : {
        type: "FeatureCollection",
        features: []
      };

  if (!map.getSource("mission-profile-operating-area")) {
    map.addSource("mission-profile-operating-area", {
      type: "geojson",
      data: areaData
    });
    map.addLayer({
      id: "mission-profile-operating-area-fill",
      type: "fill",
      source: "mission-profile-operating-area",
      paint: {
        "fill-color": "#8d6bff",
        "fill-opacity": 0.16
      }
    }, "mission-profile-route-line");
    map.addLayer({
      id: "mission-profile-operating-area-outline",
      type: "line",
      source: "mission-profile-operating-area",
      paint: {
        "line-color": "#f7c85f",
        "line-width": 2,
        "line-opacity": 0.88
      }
    }, "mission-profile-route-line");
    return;
  }

  map.getSource("mission-profile-operating-area")?.setData(areaData);
};

const updateTelemetrySource = (map, telemetryPoints, latestTelemetryPoint) => {
  const trailData = createTelemetryTrailData(telemetryPoints);
  const currentData = createTelemetryCurrentData(latestTelemetryPoint);

  if (!map.getSource("mission-profile-telemetry-trail")) {
    map.addSource("mission-profile-telemetry-trail", {
      type: "geojson",
      data: trailData
    });
    map.addLayer({
      id: "mission-profile-telemetry-trail-shadow",
      type: "line",
      source: "mission-profile-telemetry-trail",
      paint: {
        "line-color": "#04111f",
        "line-width": 7,
        "line-opacity": 0.42
      }
    });
    map.addLayer({
      id: "mission-profile-telemetry-trail",
      type: "line",
      source: "mission-profile-telemetry-trail",
      paint: {
        "line-color": "#2cf4b6",
        "line-width": 4,
        "line-opacity": 0.94
      }
    });
  } else {
    map.getSource("mission-profile-telemetry-trail")?.setData(trailData);
  }

  if (!map.getSource("mission-profile-telemetry-current")) {
    map.addSource("mission-profile-telemetry-current", {
      type: "geojson",
      data: currentData
    });
    map.addLayer({
      id: "mission-profile-telemetry-current-halo",
      type: "circle",
      source: "mission-profile-telemetry-current",
      paint: {
        "circle-color": "#2cf4b6",
        "circle-radius": 16,
        "circle-opacity": 0.2,
        "circle-stroke-color": "#bdfdeb",
        "circle-stroke-width": 2
      }
    });
  } else {
    map.getSource("mission-profile-telemetry-current")?.setData(currentData);
  }
};

const addMarkers = (map, mapboxgl, points, locationPoints, latestTelemetryPoint, telemetryMode, markersRef) => {
  points.forEach((point, index) => {
    const markerElement = document.createElement("span");
    markerElement.className = "mission-profile-map-marker";
    markerElement.textContent = getMarkerLabel(index, points.length);

    const popup = new mapboxgl.Popup({ offset: 18 }).setText(getPointLabel(index, points.length));

    const marker = new mapboxgl.Marker({ element: markerElement, anchor: "center" })
      .setLngLat([Number(point.longitude), Number(point.latitude)])
      .setPopup(popup)
      .addTo(map);

    markersRef.current.push(marker);
  });

  locationPoints.forEach((point) => {
    const markerElement = document.createElement("span");
    markerElement.className = `mission-profile-map-marker location ${point.markerClass}`;
    markerElement.textContent = point.markerLabel;

    const popup = new mapboxgl.Popup({ offset: 18 }).setText(point.popupLabel);

    const marker = new mapboxgl.Marker({ element: markerElement, anchor: "center" })
      .setLngLat([Number(point.longitude), Number(point.latitude)])
      .setPopup(popup)
      .addTo(map);

    markersRef.current.push(marker);
  });

  if (hasCoordinates(latestTelemetryPoint)) {
    const markerElement = document.createElement("span");
    markerElement.className = `mission-profile-map-marker drone ${telemetryMode === "recorded" ? "recorded" : "live"}`;
    markerElement.setAttribute("aria-label", telemetryMode === "recorded" ? "Recorded aircraft position" : "Live aircraft position");

    const popup = new mapboxgl.Popup({ offset: 20 }).setHTML(`
      <strong>${escapeHtml(latestTelemetryPoint.label || "Aircraft")}</strong><br />
      ${formatMarkerLine("Status", latestTelemetryPoint.status)}<br />
      ${formatMarkerLine("Battery", latestTelemetryPoint.battery)}<br />
      ${formatMarkerLine("Speed", latestTelemetryPoint.speed)}<br />
      ${formatMarkerLine("Updated", latestTelemetryPoint.timestamp)}
    `);

    const marker = new mapboxgl.Marker({ element: markerElement, anchor: "center" })
      .setLngLat([Number(latestTelemetryPoint.longitude), Number(latestTelemetryPoint.latitude)])
      .setPopup(popup)
      .addTo(map);

    markersRef.current.push(marker);
  }
};

const createRouteData = (points) => ({
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: points.map((point) => [Number(point.longitude), Number(point.latitude)])
  },
  properties: {}
});

const createTelemetryTrailData = (points) => ({
  type: "FeatureCollection",
  features: points.length >= 2
    ? [{
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: points.map((point) => [Number(point.longitude), Number(point.latitude)])
        },
        properties: {}
      }]
    : []
});

const createTelemetryCurrentData = (point) => ({
  type: "FeatureCollection",
  features: hasCoordinates(point)
    ? [{
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(point.longitude), Number(point.latitude)]
        },
        properties: {}
      }]
    : []
});

const fitMapToRoute = (map, mapboxgl, points) => {
  if (points.length === 1) {
    map.flyTo({ center: [Number(points[0].longitude), Number(points[0].latitude)], zoom: 14, speed: 0.8 });
    return;
  }

  const bounds = points.reduce((currentBounds, point) => {
    return currentBounds.extend([Number(point.longitude), Number(point.latitude)]);
  }, new mapboxgl.LngLatBounds(
    [Number(points[0].longitude), Number(points[0].latitude)],
    [Number(points[0].longitude), Number(points[0].latitude)]
  ));

  map.fitBounds(bounds, { padding: 62, maxZoom: 15, duration: 700 });
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
    timestamp: record.timestamp ?? raw.timestamp ?? raw.recorded_at_utc,
    latitudeSource: latitude,
    longitudeSource: longitude
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

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
}[character]));

const createCircleFeature = (center, radiusMeters, steps = 72) => {
  const earthRadiusMeters = 6371008.8;
  const coordinates = [];
  const distance = radiusMeters / earthRadiusMeters;
  const centerLongitude = toRadians(center[0]);
  const centerLatitude = toRadians(center[1]);

  for (let index = 0; index <= steps; index += 1) {
    const bearing = 2 * Math.PI * (index / steps);
    const latitude = Math.asin(
      Math.sin(centerLatitude) * Math.cos(distance) +
      Math.cos(centerLatitude) * Math.sin(distance) * Math.cos(bearing)
    );
    const longitude = centerLongitude + Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(centerLatitude),
      Math.cos(distance) - Math.sin(centerLatitude) * Math.sin(latitude)
    );

    coordinates.push([toDegrees(longitude), toDegrees(latitude)]);
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coordinates]
    },
    properties: {}
  };
};

const toRadians = (degrees) => degrees * Math.PI / 180;
const toDegrees = (radians) => radians * 180 / Math.PI;

const resetMarkers = (markersRef) => {
  markersRef.current.forEach((marker) => marker.remove());
  markersRef.current = [];
};

const getInitialCenter = (points) => {
  const point = points.find(hasCoordinates);
  return point ? [Number(point.longitude), Number(point.latitude)] : defaultCenter;
};

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

export default MissionRouteMap;
