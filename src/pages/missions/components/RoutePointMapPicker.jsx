/* oxlint-disable react-hooks/exhaustive-deps */
import { CheckCircle2, Crosshair, Loader2, MapPin, Route, Search, Trash2, X } from "lucide-react";
import L from "leaflet";
import MapWorkspace, { MapDataDetails } from "../../../components/maps/MapWorkspace";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = { latitude: -33.8679, longitude: 151.2073 };
const defaultOperatingAreaRadiusMeters = 500;

const toolOptions = [
  { id: "launchSite", label: "Launch", icon: MapPin, marker: "L" },
  { id: "routePath", label: "Route", icon: Route, marker: "S" }
];

const RoutePointMapPicker = ({ value = [], onChange, locationPlan = {}, onLocationPlanChange, locked = false, analysis = null }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const toolbarRef = useRef(null);
  const searchRef = useRef(null);
  const helpRef = useRef(null);
  const pointsPanelRef = useRef(null);
  const activeIndexRef = useRef(0);
  const activeToolRef = useRef("routePath");
  const lockedRef = useRef(locked);
  const routeFinishedRef = useRef(false);
  const locationPlanRef = useRef({});
  const routePointsRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [activeTool, setActiveTool] = useState("routePath");
  const [activeIndex, setActiveIndex] = useState(() => getFirstEmptyIndex(value));
  const [routeFinished, setRouteFinished] = useState(() => normalizeRoutePoints(value).filter(hasCoordinates).length >= 2);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const routePoints = useMemo(() => normalizeRoutePoints(value), [value]);
  const activePoint = routePoints[activeIndex] ?? routePoints[0];
  const launchSite = normalizeLocation(locationPlan.launchSite);
  const operatingArea = normalizeLocation(locationPlan.operatingArea);
  const councilOverlay = useMemo(() => createCouncilOverlay(analysis?.authorityAnalysis), [analysis]);
  const showRouteSearch = activeTool === "routePath" && isStartOrEndPoint(activeIndex, routePoints.length) && !locked;
  const canFinishRoute = routePoints.filter(hasCoordinates).length >= 2;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    activeToolRef.current = activeTool;
    lockedRef.current = locked;
    routeFinishedRef.current = routeFinished;
    locationPlanRef.current = { launchSite, operatingArea };
    routePointsRef.current = routePoints;
  }, [activeIndex, activeTool, launchSite, locked, operatingArea, routeFinished, routePoints]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: toLatLng(getInitialCenter(routePoints, launchSite, operatingArea)),
        zoom: 11,
        zoomControl: false,
        attributionControl: true
      });

      L.control.zoom({ position: "bottomleft" }).addTo(map);
      L.control.scale({ position: "bottomleft", imperial: true, metric: true }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      layersRef.current = {
        route: L.layerGroup().addTo(map),
        locations: L.layerGroup().addTo(map),
        operatingArea: L.layerGroup().addTo(map),
        councils: L.layerGroup().addTo(map)
      };

      map.on("click", (event) => {
        if (lockedRef.current) return;
        const coordinates = {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng
        };

        if (activeToolRef.current === "launchSite") {
          setLocationPoint("launchSite", coordinates);
          return;
        }

        setPoint(activeIndexRef.current, coordinates, { continueRoute: true });
      });

      resizeObserverRef.current = new ResizeObserver(() => map.invalidateSize());
      resizeObserverRef.current.observe(mapContainerRef.current);
      mapRef.current = map;
      setMapReady(true);
    } catch (error) {
      setMapError(error.message || "Route map failed to load.");
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
    if (!mapReady || !mapRef.current || !layersRef.current) return;

    renderRouteLayers({
      layers: layersRef.current,
      routePoints,
      activeIndex,
      activeTool,
      locked,
      launchSite,
      operatingArea,
      councilOverlay,
      onPointMove: setPoint,
      onLocationMove: setLocationPoint,
      onPointFocus: focusPoint,
      onToolFocus: setActiveTool
    });
  }, [activeIndex, activeTool, councilOverlay, launchSite, locked, mapReady, operatingArea, routePoints]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const bounds = getRouteBounds(routePoints, launchSite, operatingArea);
    if (bounds) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [mapReady]);

  const setPoint = (index, coordinates, options = {}) => {
    if (lockedRef.current) return;
    const currentPoints = routePointsRef.current;
    const nextPoints = currentPoints.map((point, pointIndex) => (
      pointIndex === index
        ? { ...point, latitude: coordinates.latitude, longitude: coordinates.longitude }
        : point
    ));

    if (options.continueRoute && activeToolRef.current === "routePath" && !routeFinishedRef.current && index === currentPoints.length - 1) {
      const drawingPoints = renumberStops([
        ...nextPoints,
        { label: "End point", latitude: "", longitude: "", altitude: "" }
      ]);

      routePointsRef.current = drawingPoints;
      onChange?.(drawingPoints);
      setActiveIndex(drawingPoints.length - 1);
      setRouteFinished(false);
      return;
    }

    routePointsRef.current = nextPoints;
    onChange?.(nextPoints);
    setRouteFinished(false);
    setActiveIndex(getNextEmptyIndex(nextPoints, index));
  };

  const setLocationPoint = (field, coordinates) => {
    if (lockedRef.current) return;
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

  const clearLocationPoint = (field) => {
    if (lockedRef.current) return;
    onLocationPlanChange?.({
      ...locationPlanRef.current,
      [field]: null
    });
  };

  const removeStop = (index) => {
    if (lockedRef.current) return;
    const nextPoints = renumberStops(routePoints.filter((_, pointIndex) => pointIndex !== index));
    routePointsRef.current = nextPoints;
    onChange?.(nextPoints);
    setRouteFinished(nextPoints.filter(hasCoordinates).length >= 2 && !nextPoints.some((point) => !hasCoordinates(point)));
    setActiveIndex(Math.min(index, nextPoints.length - 1));
  };

  const clearRoute = () => {
    if (lockedRef.current) return;
    const nextPoints = [
      { label: "Start point", latitude: "", longitude: "", altitude: "" },
      { label: "End point", latitude: "", longitude: "", altitude: "" }
    ];

    routePointsRef.current = nextPoints;
    onChange?.(nextPoints);
    setRouteFinished(false);
    setActiveIndex(0);
  };

  const finishRoute = () => {
    if (lockedRef.current) return;
    const filledPoints = routePointsRef.current.filter(hasCoordinates);
    if (filledPoints.length < 2) return;

    const nextPoints = renumberStops(filledPoints);

    routePointsRef.current = nextPoints;
    onChange?.(nextPoints);
    setActiveIndex(nextPoints.length - 1);
    setActiveTool("routePath");
    setRouteFinished(true);
  };

  const startRouteAgain = () => {
    if (lockedRef.current) return;
    const filledPoints = routePointsRef.current.filter(hasCoordinates);

    if (!filledPoints.length) {
      setRouteFinished(false);
      setActiveTool("routePath");
      setActiveIndex(0);
      return;
    }

    const drawingPoints = renumberStops([
      ...filledPoints,
      { label: "End point", latitude: "", longitude: "", altitude: "" }
    ]);

    routePointsRef.current = drawingPoints;
    onChange?.(drawingPoints);
    setRouteFinished(false);
    setActiveTool("routePath");
    setActiveIndex(drawingPoints.length - 1);
  };

  const searchRouteLocation = async (event) => {
    event?.preventDefault();
    if (lockedRef.current) return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError("");
      return;
    }

    if (!mapboxToken) {
      setSearchError("Location search needs the Mapbox token already used by DroneOps.");
      return;
    }

    setIsSearching(true);
    setSearchError("");

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
          new URLSearchParams({
            access_token: mapboxToken,
            country: "AU",
            limit: "5",
            proximity: `${defaultCenter.longitude},${defaultCenter.latitude}`
          })
      );

      if (!response.ok) throw new Error("Location search failed");
      const payload = await response.json();
      const results = Array.isArray(payload.features) ? payload.features : [];
      setSearchResults(results);
      if (!results.length) setSearchError("No matching locations found.");
    } catch (error) {
      setSearchResults([]);
      setSearchError(error.message || "Location search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const applySearchResult = (result) => {
    if (lockedRef.current) return;
    const [longitude, latitude] = Array.isArray(result.center) ? result.center : [];
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;

    setPoint(activeIndexRef.current, { latitude, longitude }, { continueRoute: true });
    setSearchQuery(result.place_name || result.text || "");
    setSearchResults([]);
    mapRef.current?.flyTo([Number(latitude), Number(longitude)], Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
  };

  function focusPoint(index) {
    setActiveTool("routePath");
    setActiveIndex(index);
    const point = routePointsRef.current[index];
    if (hasCoordinates(point)) {
      mapRef.current?.flyTo(toLatLng(point), Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });
    }
  }

  return (
    <MapWorkspace title="Mission planning" details={<>
      <MapDataDetails title="Planning status" value={{ route: routeFinished ? "Finished" : "Editing", accepted: locked ? "Yes" : "No", points: routePoints.length }} />
      <MapDataDetails title="Launch site" value={launchSite} />
      <MapDataDetails title="Route points" value={routePoints} />
    </>}>
    <div className="route-map-picker leaflet-route-picker">
      <div className="route-picker-map-shell">
        <div className="route-picker-map leaflet-route-map" ref={mapContainerRef} data-cy="mission-route-map" />

        <div
          className="route-picker-toolbar"
          ref={toolbarRef}
          role="group"
          aria-label="Mission map tools"
          onClick={stopMapOverlayEvent}
          onDoubleClick={stopMapOverlayEvent}
          onMouseDown={stopMapOverlayEvent}
        >
          {toolOptions.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                className={activeTool === tool.id ? "active" : ""}
                onClick={() => setActiveTool(tool.id)}
                disabled={locked}
                title={tool.label}
              >
                <Icon size={15} />
              </button>
            );
          })}
          {routeFinished ? (
            <button type="button" onClick={startRouteAgain} disabled={locked} title="Extend route">
              <Route size={15} />
            </button>
          ) : (
            <button type="button" onClick={finishRoute} disabled={locked || !canFinishRoute || routeFinished} title="Finish route">
              <CheckCircle2 size={15} />
            </button>
          )}
          <button type="button" onClick={clearRoute} disabled={locked} title="Clear route">
            <Trash2 size={15} />
          </button>
        </div>

        {showRouteSearch && (
          <form
            className="route-picker-search"
            ref={searchRef}
            onClick={stopMapOverlayEvent}
            onDoubleClick={stopMapOverlayEvent}
            onMouseDown={stopMapOverlayEvent}
            onSubmit={searchRouteLocation}
          >
            <div className="route-picker-search-row">
              <Search size={16} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={`Search ${getPointLabel(activeIndex, routePoints.length).toLowerCase()}`}
                aria-label={`Search ${getPointLabel(activeIndex, routePoints.length)}`}
              />
              {searchQuery && (
                <button type="button" onClick={clearSearch} aria-label="Clear location search">
                  <X size={15} />
                </button>
              )}
              <button type="submit" disabled={isSearching}>
                {isSearching ? <Loader2 size={15} className="spin-icon" /> : "Find"}
              </button>
            </div>
            {(searchResults.length > 0 || searchError) && (
              <div className="route-picker-search-results">
                {searchError && <span>{searchError}</span>}
                {searchResults.map((result) => (
                  <button key={result.id} type="button" onClick={() => applySearchResult(result)}>
                    <strong>{result.text}</strong>
                    <small>{result.place_name}</small>
                  </button>
                ))}
              </div>
            )}
          </form>
        )}

        <div className="route-picker-help" ref={helpRef} onClick={stopMapOverlayEvent} onDoubleClick={stopMapOverlayEvent} onMouseDown={stopMapOverlayEvent}>
          <Crosshair size={15} />
          <div>
            <strong>{getActiveToolLabel(activeTool, activePoint)}</strong>
            <span>{locked ? "Accepted route is locked. Use Edit accepted route to change it." : getToolHelp(activeTool, activePoint)}</span>
          </div>
        </div>

        <div className="route-picker-legend" aria-label="Mission map legend">
          <span><i className="route-dot route" /> Route point</span>
          <span><i className="route-dot location" /> Launch / area</span>
          <span><i className="route-dot council" /> Council area</span>
          <span><i className="route-line" /> Planned path</span>
        </div>

        <div
          className="route-picker-points-panel"
          ref={pointsPanelRef}
          onClick={stopMapOverlayEvent}
          onDoubleClick={stopMapOverlayEvent}
          onMouseDown={stopMapOverlayEvent}
        >
          <LocationSummary label="Launch Site" value={launchSite} active={activeTool === "launchSite"} locked={locked} onSelect={() => setActiveTool("launchSite")} onClear={() => clearLocationPoint("launchSite")} />
          <LocationSummary label="Operating Area" value={operatingArea} active={false} locked onSelect={null} onClear={null} />
          {hasCoordinates(operatingArea) && (
            <div className="operating-radius-control readonly">
              <span>Backend calculated radius</span>
              <strong>{formatRadius(Number(operatingArea.radiusMeters) || defaultOperatingAreaRadiusMeters)}</strong>
            </div>
          )}
          {routeFinished ? (
            <button className="route-picker-finish-button" type="button" onClick={startRouteAgain} disabled={locked}>
              <Route size={15} />
              <span>Start Route Again</span>
            </button>
          ) : (
            <button className="route-picker-finish-button" type="button" onClick={finishRoute} disabled={locked || !canFinishRoute || routeFinished}>
              <CheckCircle2 size={15} />
              <span>Finish Route</span>
            </button>
          )}
          <div className="route-point-list compact">
            {routePoints.map((point, index) => (
              <div className={`route-point-item ${index === activeIndex && activeTool === "routePath" ? "active" : ""}`} key={`${point.label}-${index}`}>
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
                    disabled={locked}
                    aria-label={`Remove ${point.label}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {!mapReady && !mapError && <div className="route-picker-map-status">Loading route map...</div>}
        {mapError && <div className="route-picker-map-status error">{mapError}</div>}
      </div>
    </div>
    </MapWorkspace>
  );
};

const LocationSummary = ({ label, value, active, locked, onSelect, onClear }) => (
  <div className={`location-summary ${active ? "active" : ""}`}>
    <button type="button" onClick={() => onSelect?.()} disabled={locked || !onSelect}>
      <span>{label}</span>
      <strong>{formatPoint(value)}</strong>
    </button>
    {hasCoordinates(value) && onClear && (
      <button className="location-summary-clear" type="button" onClick={onClear} disabled={locked} aria-label={`Clear ${label}`}>
        <Trash2 size={13} />
      </button>
    )}
  </div>
);

const renderRouteLayers = ({ layers, routePoints, activeIndex, activeTool, locked, launchSite, operatingArea, councilOverlay, onPointMove, onLocationMove, onPointFocus, onToolFocus }) => {
  Object.values(layers).forEach((layer) => layer.clearLayers());

  const routeLatLngs = routePoints.filter(hasCoordinates).map(toLatLng);
  if (routeLatLngs.length >= 2) {
    L.polyline(routeLatLngs, {
      color: "#2563eb",
      weight: 4,
      opacity: 0.9,
      dashArray: "8 6"
    }).addTo(layers.route);
  }

  if (hasCoordinates(operatingArea)) {
    L.circle(toLatLng(operatingArea), {
      radius: Number(operatingArea.radiusMeters) || defaultOperatingAreaRadiusMeters,
      color: "#2563eb",
      weight: 1.5,
      opacity: 0.48,
      dashArray: "6 8",
      fillColor: "#93c5fd",
      fillOpacity: 0.05,
      interactive: false
    }).addTo(layers.operatingArea);
  }

  if (councilOverlay?.features?.length) {
    L.geoJSON(councilOverlay, {
      style: {
        color: "#7c3aed",
        weight: 2,
        opacity: 0.65,
        fillColor: "#8b5cf6",
        fillOpacity: 0.12
      }
    }).addTo(layers.councils);
  }

  [
    { key: "launchSite", point: launchSite, label: "L", title: "Launch site" },
    { key: "operatingArea", point: operatingArea, label: "A", title: "Operating area" }
  ].forEach(({ key, point, label, title }) => {
    if (!hasCoordinates(point)) return;
    const isServerDerivedOperatingArea = key === "operatingArea";

    const marker = L.marker(toLatLng(point), {
      draggable: !locked && !isServerDerivedOperatingArea,
      icon: createMarkerIcon(label, `location ${key} ${activeTool === key ? "active" : ""}`, title)
    }).addTo(layers.locations);

    if (!isServerDerivedOperatingArea) {
      marker.on("click", () => onToolFocus(key));
      marker.on("dragend", () => {
        const nextPosition = marker.getLatLng();
        onLocationMove(key, { latitude: nextPosition.lat, longitude: nextPosition.lng });
      });
    }
  });

  routePoints.forEach((point, index) => {
    if (!hasCoordinates(point)) return;

    const marker = L.marker(toLatLng(point), {
      draggable: !locked,
      icon: createMarkerIcon(
        "",
        `route ${index === activeIndex && activeTool === "routePath" ? "active" : ""}`,
        getMarkerCalloutLabel(index, routePoints.length, point)
      )
    }).addTo(layers.route);

    marker.on("click", () => onPointFocus(index));
    marker.on("dragend", () => {
      const nextPosition = marker.getLatLng();
      onPointMove(index, { latitude: nextPosition.lat, longitude: nextPosition.lng });
    });
  });
};

const createMarkerIcon = (label, className, title) => L.divIcon({
  className: "leaflet-route-marker-wrapper",
  html: `<button type="button" class="route-picker-marker ${className}" aria-label="${escapeAttribute(title)}"><span class="route-picker-marker-bubble">${escapeHtml(label)}</span><span class="route-picker-marker-tag">${escapeHtml(title)}</span></button>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

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

const isStartOrEndPoint = (index, total) => index === 0 || index === total - 1;

const stopMapOverlayEvent = (event) => {
  event.stopPropagation();
};

const getMarkerCalloutLabel = (index, total, point) => {
  const altitude = point.altitude ? `${point.altitude} m AGL` : "0 m AGL";
  return `${getMarkerLabel(index, total)} - ${altitude}`;
};

const isStop = (index, total) => index > 0 && index < total - 1;

const hasCoordinates = (point) => {
  if (!point) return false;
  if (point.latitude === "" || point.longitude === "" || point.latitude == null || point.longitude == null) return false;
  return Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
};

const toLatLng = (point) => [Number(point.latitude), Number(point.longitude)];

const getInitialCenter = (points, launchSite, operatingArea) => {
  const point = points.find(hasCoordinates) ?? launchSite ?? operatingArea;
  return hasCoordinates(point) ? point : defaultCenter;
};

const getRouteBounds = (points, launchSite, operatingArea) => {
  const latLngs = [
    ...points.filter(hasCoordinates).map(toLatLng),
    ...(hasCoordinates(launchSite) ? [toLatLng(launchSite)] : []),
    ...(hasCoordinates(operatingArea) ? [toLatLng(operatingArea)] : [])
  ];

  return latLngs.length ? L.latLngBounds(latLngs) : null;
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
  return activePoint ? `Click the map to place ${activePoint.label || "selected route point"}. Each route click prepares the next point. Use Finish Route when done.` : "Click the map to start the route.";
};

const getActiveToolLabel = (activeTool, activePoint) => {
  if (activeTool === "launchSite") return "Launch Site";
  return activePoint?.label ?? "Route Path";
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

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const escapeAttribute = escapeHtml;

export default RoutePointMapPicker;
