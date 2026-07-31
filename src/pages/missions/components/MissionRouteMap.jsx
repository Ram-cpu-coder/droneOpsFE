/* oxlint-disable react-hooks/exhaustive-deps */
import { MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = [151.2073, -33.8679];

const MissionRouteMap = ({ waypoints = [] }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const routePoints = useMemo(() => waypoints.filter(hasCoordinates), [waypoints]);

  useEffect(() => {
    if (!mapboxToken || mapRef.current || !mapContainerRef.current || routePoints.length === 0) return;

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
          center: getInitialCenter(routePoints),
          zoom: routePoints.length > 1 ? 12 : 14,
          pitch: 18,
          bearing: -8,
          interactive: true
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
        mapRef.current.on("load", () => {
          if (!isMounted) return;
          setMapReady(true);
          renderRoute(mapRef.current, mapboxgl, routePoints, markersRef);
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
    if (!mapReady || !mapRef.current || !mapboxRef.current || routePoints.length === 0) return;
    mapRef.current.resize();
    updateRouteSource(mapRef.current, routePoints);
    fitMapToRoute(mapRef.current, mapboxRef.current, routePoints);
  }, [mapReady, routePoints]);

  if (!mapboxToken) {
    return (
      <div className="mission-profile-map-empty">
        <MapPin size={20} />
        <span>Route map is unavailable.</span>
      </div>
    );
  }

  if (routePoints.length === 0) {
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

const renderRoute = (map, mapboxgl, points, markersRef) => {
  updateRouteSource(map, points);
  addMarkers(map, mapboxgl, points, markersRef);
  fitMapToRoute(map, mapboxgl, points);
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

const addMarkers = (map, mapboxgl, points, markersRef) => {
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
