/* oxlint-disable react-hooks/exhaustive-deps */
import { MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = [151.2073, -33.8679];

const MissionRouteMap = ({ waypoints = [], launchSite = null, operatingArea = null }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const routePoints = useMemo(() => waypoints.filter(hasCoordinates), [waypoints]);
  const locationPoints = useMemo(() => [
    { ...normaliseLocation(launchSite), markerLabel: "L", popupLabel: "Launch Site", markerClass: "launch" },
    { ...normaliseLocation(operatingArea), markerLabel: "A", popupLabel: "Operating Area", markerClass: "area" }
  ].filter(hasCoordinates), [launchSite, operatingArea]);
  const mapPoints = useMemo(() => [...routePoints, ...locationPoints], [locationPoints, routePoints]);

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
          renderRoute(mapRef.current, mapboxgl, routePoints, locationPoints, markersRef);
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
    resetMarkers(markersRef);
    addMarkers(mapRef.current, mapboxRef.current, routePoints, locationPoints, markersRef);
    fitMapToRoute(mapRef.current, mapboxRef.current, mapPoints);
  }, [locationPoints, mapPoints, mapReady, routePoints]);

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

const renderRoute = (map, mapboxgl, points, locationPoints, markersRef) => {
  updateRouteSource(map, points);
  updateOperatingAreaSource(map, locationPoints.find((point) => point.markerClass === "area"));
  addMarkers(map, mapboxgl, points, locationPoints, markersRef);
  fitMapToRoute(map, mapboxgl, [...points, ...locationPoints]);
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

const addMarkers = (map, mapboxgl, points, locationPoints, markersRef) => {
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
};

const createRouteData = (points) => ({
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: points.map((point) => [Number(point.longitude), Number(point.latitude)])
  },
  properties: {}
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
