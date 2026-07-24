import { Crosshair, MapPin, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = [151.2073, -33.8679];

const RoutePointMapPicker = ({ value = [], onChange }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef(new Map());
  const activeIndexRef = useRef(0);
  const routePointsRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [activeIndex, setActiveIndex] = useState(() => getFirstEmptyIndex(value));
  const routePoints = useMemo(() => normalizeRoutePoints(value), [value]);
  const activePoint = routePoints[activeIndex] ?? routePoints[0];

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    routePointsRef.current = routePoints;
  }, [activeIndex, routePoints]);

  useEffect(() => {
    if (!mapboxToken || mapRef.current || !mapContainerRef.current) return;

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
          zoom: 12.5,
          pitch: 24,
          bearing: -10
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
        mapRef.current.on("load", () => {
          if (!isMounted) return;
          setMapReady(true);
        });
        mapRef.current.on("click", (event) => {
          if (!isMounted) return;
          setPoint(activeIndexRef.current, {
            longitude: event.lngLat.lng,
            latitude: event.lngLat.lat
          });
        });

        const resizeObserver = new ResizeObserver(() => {
          mapRef.current?.resize();
        });
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
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapboxRef.current) return;

    mapRef.current.resize();
    syncRouteLayer(mapRef.current, routePoints);
    syncMarkers();
  }, [activeIndex, mapReady, routePoints]);

  const setPoint = (index, coordinates) => {
    const nextPoints = routePointsRef.current.map((point, pointIndex) => (
      pointIndex === index
        ? { ...point, latitude: coordinates.latitude, longitude: coordinates.longitude }
        : point
    ));

    onChange?.(nextPoints);
    setActiveIndex(getNextEmptyIndex(nextPoints, index));
  };

  const addStop = () => {
    const currentPoints = routePointsRef.current;
    const insertIndex = Math.max(currentPoints.length - 1, 1);
    const nextPoints = [
      ...currentPoints.slice(0, insertIndex),
      { label: `Stop ${insertIndex}`, latitude: "", longitude: "", altitude: "" },
      ...currentPoints.slice(insertIndex)
    ];

    onChange?.(renumberStops(nextPoints));
    setActiveIndex(insertIndex);
  };

  const removeStop = (index) => {
    const nextPoints = renumberStops(routePoints.filter((_, pointIndex) => pointIndex !== index));
    onChange?.(nextPoints);
    setActiveIndex(Math.min(index, nextPoints.length - 1));
  };

  const focusPoint = (index) => {
    setActiveIndex(index);
    const point = routePoints[index];
    if (hasCoordinates(point) && mapRef.current) {
      mapRef.current.flyTo({
        center: [Number(point.longitude), Number(point.latitude)],
        zoom: Math.max(mapRef.current.getZoom(), 14),
        speed: 0.9
      });
    }
  };

  const syncMarkers = () => {
    const mapboxgl = mapboxRef.current;
    const map = mapRef.current;
    if (!mapboxgl || !map) return;

    const visibleKeys = new Set();

    routePoints.forEach((point, index) => {
      if (!hasCoordinates(point)) return;

      const key = String(index);
      visibleKeys.add(key);
      const lngLat = [Number(point.longitude), Number(point.latitude)];
      const existingMarker = markersRef.current.get(key);

      if (existingMarker) {
        existingMarker.setLngLat(lngLat);
        existingMarker.getElement().dataset.active = String(index === activeIndex);
        return;
      }

      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = "route-picker-marker";
      markerElement.dataset.active = String(index === activeIndex);
      markerElement.textContent = getMarkerLabel(index, routePoints.length);
      markerElement.addEventListener("click", (event) => {
        event.stopPropagation();
        focusPoint(index);
      });

      const marker = new mapboxgl.Marker({ element: markerElement, draggable: true, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);

      marker.on("dragend", () => {
        const coordinates = marker.getLngLat();
        setPoint(index, {
          longitude: coordinates.lng,
          latitude: coordinates.lat
        });
      });

      markersRef.current.set(key, marker);
    });

    markersRef.current.forEach((marker, key) => {
      if (!visibleKeys.has(key)) {
        marker.remove();
        markersRef.current.delete(key);
      }
    });
  };

  if (!mapboxToken) {
    return (
      <div className="route-picker-empty">
        <MapPin size={22} />
        <div>
          <strong>Map route selection is unavailable</strong>
          <p>Add `VITE_MAPBOX_TOKEN` to use map-based start, end, and stop selection.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="route-map-picker">
      <div className="route-picker-sidebar">
        <div className="route-picker-heading">
          <Crosshair size={18} />
          <div>
            <strong>Build drone path</strong>
            <span>{activePoint ? `Click the map to set ${activePoint.label || "selected point"}. Drag markers to adjust.` : "Add route points to continue."}</span>
          </div>
        </div>

        <div className="route-point-list">
          {routePoints.map((point, index) => (
            <div
              className={`route-point-item ${index === activeIndex ? "active" : ""}`}
              key={`${point.label}-${index}`}
            >
              <button className="route-point-select" type="button" onClick={() => focusPoint(index)}>
                <span>{getMarkerLabel(index, routePoints.length)}</span>
                <div>
                  <strong>{point.label || getPointLabel(index, routePoints.length)}</strong>
                  <small>{formatPoint(point)}</small>
                </div>
              </button>
              {isStop(index, routePoints.length) && (
                <button
                  className="route-point-remove"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeStop(index);
                  }}
                  aria-label={`Remove ${point.label}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button className="secondary-inline-action" type="button" onClick={addStop}>
          <Plus size={16} />
          <span>Add stop</span>
        </button>
      </div>

      <div className="route-picker-map-shell">
        <div className="route-picker-map" ref={mapContainerRef} />
        <div className="route-picker-help">
          <strong>{activePoint?.label ?? "Drone path"}</strong>
          <span>Click anywhere on the map to place this point.</span>
        </div>
        {!mapReady && !mapError && <div className="route-picker-map-status">Loading route map...</div>}
        {mapError && <div className="route-picker-map-status error">{mapError}</div>}
      </div>
    </div>
  );
};

const syncRouteLayer = (map, routePoints) => {
  const coordinates = routePoints
    .filter(hasCoordinates)
    .map((point) => [Number(point.longitude), Number(point.latitude)]);
  const routeData = coordinates.length >= 2
    ? {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: {}
      }
    : {
        type: "FeatureCollection",
        features: []
      };

  if (!map.getSource("mission-route-picker-line")) {
    map.addSource("mission-route-picker-line", {
      type: "geojson",
      data: routeData
    });
    map.addLayer({
      id: "mission-route-picker-line",
      type: "line",
      source: "mission-route-picker-line",
      paint: {
        "line-color": "#5b96ff",
        "line-width": 4,
        "line-opacity": 0.9,
        "line-dasharray": [1, 1.3]
      }
    });
    return;
  }

  map.getSource("mission-route-picker-line")?.setData(routeData);
};

const normalizeRoutePoints = (points) => {
  const normalized = Array.isArray(points) ? points.map((point, index) => ({
    label: point.label || getPointLabel(index, points.length),
    latitude: point.latitude ?? point.lat ?? "",
    longitude: point.longitude ?? point.lng ?? point.lon ?? "",
    altitude: point.altitude ?? point.alt ?? ""
  })) : [];

  if (normalized.length >= 2) return normalized;
  return [
    { label: "Start point", latitude: "", longitude: "", altitude: "" },
    { label: "End point", latitude: "", longitude: "", altitude: "" }
  ];
};

const renumberStops = (points) => points.map((point, index) => ({
  ...point,
  label: point.label?.startsWith("Stop") || point.label === "Start point" || point.label === "End point"
    ? getPointLabel(index, points.length)
    : point.label
}));

const getPointLabel = (index, total) => {
  if (index === 0) return "Start point";
  if (index === total - 1) return "End point";
  return `Stop ${index}`;
};

const getMarkerLabel = (index, total) => {
  if (index === 0) return "S";
  if (index === total - 1) return "E";
  return String(index);
};

const isStop = (index, total) => index > 0 && index < total - 1;

const hasCoordinates = (point) => {
  if (!point) return false;
  if (point.latitude === "" || point.longitude === "" || point.latitude == null || point.longitude == null) return false;
  return Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
};

const formatPoint = (point) => {
  if (!hasCoordinates(point)) return "Not selected yet";
  return `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`;
};

const getInitialCenter = (points) => {
  const point = points.find(hasCoordinates);
  return point ? [Number(point.longitude), Number(point.latitude)] : defaultCenter;
};

const getFirstEmptyIndex = (points) => {
  const normalized = normalizeRoutePoints(points);
  const emptyIndex = normalized.findIndex((point) => !hasCoordinates(point));
  return emptyIndex >= 0 ? emptyIndex : 0;
};

const getNextEmptyIndex = (points, currentIndex) => {
  const nextIndex = points.findIndex((point, index) => index > currentIndex && !hasCoordinates(point));
  if (nextIndex >= 0) return nextIndex;

  const firstEmptyIndex = points.findIndex((point) => !hasCoordinates(point));
  return firstEmptyIndex >= 0 ? firstEmptyIndex : currentIndex;
};

export default RoutePointMapPicker;
