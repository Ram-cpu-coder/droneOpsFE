/* oxlint-disable react-hooks/exhaustive-deps */
import { Crosshair, Map as MapIcon, MapPin, Plus, Route, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = [151.2073, -33.8679];
const defaultOperatingAreaRadiusMeters = 500;

const toolOptions = [
  { id: "launchSite", label: "Launch Site", icon: MapPin },
  { id: "operatingArea", label: "Operating Area", icon: MapIcon },
  { id: "routePath", label: "Route Path", icon: Route }
];

const RoutePointMapPicker = ({ value = [], onChange, locationPlan = {}, onLocationPlanChange }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef(new Map());
  const locationMarkersRef = useRef(new Map());
  const activeIndexRef = useRef(0);
  const activeToolRef = useRef("routePath");
  const locationPlanRef = useRef({});
  const routePointsRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [activeTool, setActiveTool] = useState("routePath");
  const [activeIndex, setActiveIndex] = useState(() => getFirstEmptyIndex(value));
  const routePoints = useMemo(() => normalizeRoutePoints(value), [value]);
  const activePoint = routePoints[activeIndex] ?? routePoints[0];
  const launchSite = normalizeLocation(locationPlan.launchSite);
  const operatingArea = normalizeLocation(locationPlan.operatingArea);

  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    activeIndexRef.current = activeIndex;
    activeToolRef.current = activeTool;
    locationPlanRef.current = { launchSite, operatingArea };
    routePointsRef.current = routePoints;
  }, [activeIndex, activeTool, launchSite, operatingArea, routePoints]);

  // oxlint-disable-next-line react-hooks/exhaustive-deps
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
          const coordinates = {
            longitude: event.lngLat.lng,
            latitude: event.lngLat.lat
          };

          if (activeToolRef.current === "launchSite") {
            setLocationPoint("launchSite", coordinates);
            return;
          }

          if (activeToolRef.current === "operatingArea") {
            setLocationPoint("operatingArea", coordinates);
            return;
          }

          setPoint(activeIndexRef.current, coordinates);
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
      locationMarkersRef.current.forEach((marker) => marker.remove());
      locationMarkersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapboxRef.current) return;

    mapRef.current.resize();
    syncRouteLayer(mapRef.current, routePoints);
    syncOperatingAreaLayer(mapRef.current, operatingArea);
    syncLocationMarkers();
    syncMarkers();
  }, [activeIndex, activeTool, launchSite, mapReady, operatingArea, routePoints]);

  const setPoint = (index, coordinates) => {
    const nextPoints = routePointsRef.current.map((point, pointIndex) => (
      pointIndex === index
        ? { ...point, latitude: coordinates.latitude, longitude: coordinates.longitude }
        : point
    ));

    onChange?.(nextPoints);
    setActiveIndex(getNextEmptyIndex(nextPoints, index));
  };

  const setLocationPoint = (field, coordinates) => {
    const label = field === "launchSite" ? "Launch site" : "Operating area";
    const existingLocation = locationPlanRef.current[field];
    const nextPlan = {
      ...locationPlanRef.current,
      [field]: {
        ...existingLocation,
        label,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        ...(field === "operatingArea" ? { radiusMeters: existingLocation?.radiusMeters ?? defaultOperatingAreaRadiusMeters } : {})
      }
    };

    onLocationPlanChange?.(nextPlan);
  };

  const updateOperatingAreaRadius = (radiusMeters) => {
    if (!locationPlanRef.current.operatingArea) return;

    onLocationPlanChange?.({
      ...locationPlanRef.current,
      operatingArea: {
        ...locationPlanRef.current.operatingArea,
        radiusMeters
      }
    });
  };

  const clearLocationPoint = (field) => {
    const nextPlan = {
      ...locationPlanRef.current,
      [field]: null
    };

    onLocationPlanChange?.(nextPlan);
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

  const clearRoute = () => {
    const nextPoints = [
      { label: "Start point", latitude: "", longitude: "", altitude: "" },
      { label: "End point", latitude: "", longitude: "", altitude: "" }
    ];

    onChange?.(nextPoints);
    setActiveIndex(0);
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

  const syncLocationMarkers = () => {
    const mapboxgl = mapboxRef.current;
    const map = mapRef.current;
    if (!mapboxgl || !map) return;

    const locations = [
      { key: "launchSite", point: launchSite, label: "L" },
      { key: "operatingArea", point: operatingArea, label: "A" }
    ];
    const visibleKeys = new Set();

    locations.forEach(({ key, point, label }) => {
      if (!hasCoordinates(point)) return;

      visibleKeys.add(key);
      const lngLat = [Number(point.longitude), Number(point.latitude)];
      const existingMarker = locationMarkersRef.current.get(key);

      if (existingMarker) {
        existingMarker.setLngLat(lngLat);
        existingMarker.getElement().dataset.active = String(activeTool === key);
        return;
      }

      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = `route-picker-marker location-marker ${key}`;
      markerElement.dataset.active = String(activeTool === key);
      markerElement.textContent = label;
      markerElement.addEventListener("click", (event) => {
        event.stopPropagation();
        setActiveTool(key);
      });

      const marker = new mapboxgl.Marker({ element: markerElement, draggable: true, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);

      marker.on("dragend", () => {
        const coordinates = marker.getLngLat();
        setLocationPoint(key, {
          longitude: coordinates.lng,
          latitude: coordinates.lat
        });
      });

      locationMarkersRef.current.set(key, marker);
    });

    locationMarkersRef.current.forEach((marker, key) => {
      if (!visibleKeys.has(key)) {
        marker.remove();
        locationMarkersRef.current.delete(key);
      }
    });
  };

  if (!mapboxToken) {
    return (
      <div className="route-picker-empty">
        <MapPin size={22} />
        <div>
          <strong>Map route selection is unavailable</strong>
          <p>Map-based route selection is currently unavailable. Manual route details can still be entered in the mission form.</p>
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
            <strong>Plan mission locations</strong>
            <span>{getToolHelp(activeTool, activePoint)}</span>
          </div>
        </div>

        <div className="map-tool-selector" role="group" aria-label="Mission map tools">
          {toolOptions.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                className={activeTool === tool.id ? "active" : ""}
                onClick={() => setActiveTool(tool.id)}
              >
                <Icon size={15} />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>

        <div className="location-selection-list">
          <LocationSummary label="Launch Site" value={launchSite} active={activeTool === "launchSite"} onSelect={() => setActiveTool("launchSite")} onClear={() => clearLocationPoint("launchSite")} />
          <LocationSummary label="Operating Area" value={operatingArea} active={activeTool === "operatingArea"} onSelect={() => setActiveTool("operatingArea")} onClear={() => clearLocationPoint("operatingArea")} />
          {hasCoordinates(operatingArea) && (
            <label className="operating-radius-control">
              <span>Area Radius</span>
              <input
                type="range"
                min="100"
                max="2000"
                step="50"
                value={Number(operatingArea.radiusMeters) || defaultOperatingAreaRadiusMeters}
                onChange={(event) => updateOperatingAreaRadius(Number(event.target.value))}
              />
              <strong>{formatRadius(Number(operatingArea.radiusMeters) || defaultOperatingAreaRadiusMeters)}</strong>
            </label>
          )}
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
        <button className="secondary-inline-action muted" type="button" onClick={clearRoute}>
          <Trash2 size={16} />
          <span>Clear route</span>
        </button>
      </div>

      <div className="route-picker-map-shell">
        <div className="route-picker-map" ref={mapContainerRef} />
        <div className="route-picker-help">
          <strong>{getActiveToolLabel(activeTool, activePoint)}</strong>
          <span>Click anywhere on the map to place the selected item. Drag markers to adjust.</span>
        </div>
        {!mapReady && !mapError && <div className="route-picker-map-status">Loading route map...</div>}
        {mapError && <div className="route-picker-map-status error">{mapError}</div>}
      </div>
    </div>
  );
};

const LocationSummary = ({ label, value, active, onSelect, onClear }) => (
  <div className={`location-summary ${active ? "active" : ""}`}>
    <button type="button" onClick={onSelect}>
      <span>{label}</span>
      <strong>{formatPoint(value)}</strong>
    </button>
    {hasCoordinates(value) && (
      <button className="location-summary-clear" type="button" onClick={onClear} aria-label={`Clear ${label}`}>
        <Trash2 size={13} />
      </button>
    )}
  </div>
);

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

const syncOperatingAreaLayer = (map, operatingArea) => {
  const areaData = hasCoordinates(operatingArea)
    ? createCircleFeature(
        [Number(operatingArea.longitude), Number(operatingArea.latitude)],
        Number(operatingArea.radiusMeters) || defaultOperatingAreaRadiusMeters
      )
    : {
        type: "FeatureCollection",
        features: []
      };

  if (!map.getSource("mission-operating-area-picker")) {
    map.addSource("mission-operating-area-picker", {
      type: "geojson",
      data: areaData
    });
    map.addLayer({
      id: "mission-operating-area-picker-fill",
      type: "fill",
      source: "mission-operating-area-picker",
      paint: {
        "fill-color": "#8d6bff",
        "fill-opacity": 0.18
      }
    });
    map.addLayer({
      id: "mission-operating-area-picker-outline",
      type: "line",
      source: "mission-operating-area-picker",
      paint: {
        "line-color": "#f7c85f",
        "line-width": 2,
        "line-opacity": 0.85
      }
    });
    return;
  }

  map.getSource("mission-operating-area-picker")?.setData(areaData);
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

const normalizeLocation = (location) => {
  if (!location || typeof location !== "object") return null;
  return {
    label: location.label ?? "",
    latitude: location.latitude ?? location.lat ?? "",
    longitude: location.longitude ?? location.lng ?? location.lon ?? "",
    radiusMeters: location.radiusMeters ?? location.radius ?? ""
  };
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
  const coordinates = `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`;
  return point.radiusMeters ? `${coordinates} | ${formatRadius(Number(point.radiusMeters))}` : coordinates;
};

const formatRadius = (radiusMeters) => {
  if (!Number.isFinite(radiusMeters)) return "500 m";
  return radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(1)} km` : `${Math.round(radiusMeters)} m`;
};

const getToolHelp = (activeTool, activePoint) => {
  if (activeTool === "launchSite") return "Click the map to set the launch site.";
  if (activeTool === "operatingArea") return "Click the map to set the operating area centre.";
  return activePoint ? `Click the map to set ${activePoint.label || "selected route point"}.` : "Add route points to continue.";
};

const getActiveToolLabel = (activeTool, activePoint) => {
  if (activeTool === "launchSite") return "Launch Site";
  if (activeTool === "operatingArea") return "Operating Area";
  return activePoint?.label ?? "Route Path";
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
