/* oxlint-disable react-hooks/exhaustive-deps */
import { LocateFixed, Search } from "lucide-react";
import L from "leaflet";
import MapWorkspace, { MapDataDetails } from "../../../components/maps/MapWorkspace";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = { latitude: -33.8679, longitude: 151.2073 };

const IncidentLocationPicker = ({ value, onChange, error }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    try {
      const location = normalizeLocation(value);
      const map = L.map(mapContainerRef.current, {
        center: toLatLng(location ?? defaultCenter),
        zoom: location ? 14 : 11,
        zoomControl: false,
        attributionControl: true
      });

      L.control.zoom({ position: "topright" }).addTo(map);
      L.control.scale({ position: "bottomleft", imperial: true, metric: true }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      map.on("click", async (event) => {
        await setLocationFromCoordinates(event.latlng.lat, event.latlng.lng);
      });

      resizeObserverRef.current = new ResizeObserver(() => map.invalidateSize());
      resizeObserverRef.current.observe(mapContainerRef.current);
      mapRef.current = map;
      setMapReady(true);
    } catch (setupError) {
      setMapError(setupError.message || "Incident location map failed to load.");
    }

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    syncMarker(normalizeLocation(value));
  }, [mapReady, value]);

  const setLocation = (location) => {
    onChange?.(location);
    mapRef.current?.flyTo(toLatLng(location), Math.max(mapRef.current.getZoom(), 14), { duration: 0.7 });
  };

  const setLocationFromCoordinates = async (latitude, longitude) => {
    const label = await reverseGeocodeLocation(latitude, longitude);
    setLocation({ label, latitude, longitude });
  };

  const syncMarker = (location) => {
    if (!location || !mapRef.current) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const latLng = toLatLng(location);
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, {
        draggable: true,
        icon: createIncidentMarkerIcon()
      }).addTo(mapRef.current);

      markerRef.current.on("dragend", async () => {
        const nextLocation = markerRef.current.getLatLng();
        await setLocationFromCoordinates(nextLocation.lat, nextLocation.lng);
      });
      return;
    }

    markerRef.current.setLatLng(latLng);
  };

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    if (!mapboxToken) {
      setMapError("Location search needs the Mapbox token already used by DroneOps.");
      return;
    }

    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmedQuery)}.json?limit=1&country=AU&access_token=${mapboxToken}`);
    const result = await response.json().catch(() => ({}));
    const feature = result.features?.[0];
    if (!feature?.center) {
      setMapError("No matching location found. Try a more specific place name.");
      return;
    }

    setMapError("");
    setLocation({
      label: feature.place_name ?? trimmedQuery,
      latitude: feature.center[1],
      longitude: feature.center[0]
    });
  };

  const location = normalizeLocation(value);

  return (
    <MapWorkspace title="Incident location" details={location
      ? <MapDataDetails title="Selected location" value={location} />
      : <p>No incident location selected.</p>}>
    <div className={`incident-location-picker leaflet-incident-location-picker ${error ? "has-error" : ""}`}>
      <div className="incident-location-search">
        <Search size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSearch();
            }
          }}
          placeholder="Search incident location"
        />
        <button type="button" onClick={handleSearch}>Find</button>
      </div>
      <div className="incident-location-map leaflet-incident-location-map" ref={mapContainerRef} />
      <div className="incident-location-meta">
        <LocateFixed size={15} />
        <span>{location ? formatLocationLabel(location) : "Search or click the map to choose the incident location."}</span>
      </div>
      {(error || mapError) && <small className="field-error">{error || mapError}</small>}
    </div>
    </MapWorkspace>
  );
};

const createIncidentMarkerIcon = () => L.divIcon({
  className: "leaflet-route-marker-wrapper",
  html: '<button type="button" class="route-picker-marker mission-profile-map-marker incident" aria-label="Incident location"><span class="route-picker-marker-bubble">!</span></button>',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const normalizeLocation = (location) => {
  if (!location || typeof location !== "object") return null;
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng ?? location.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { ...location, latitude, longitude }
    : null;
};

const toLatLng = (location) => [Number(location.latitude), Number(location.longitude)];

const formatLocationLabel = (location) => (
  `${location.label || "Selected location"} (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`
);

const reverseGeocodeLocation = async (latitude, longitude) => {
  if (!mapboxToken) return "Selected location";

  try {
    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?limit=1&access_token=${mapboxToken}`);
    const result = await response.json().catch(() => ({}));
    return result.features?.[0]?.place_name ?? "Selected location";
  } catch {
    return "Selected location";
  }
};

export default IncidentLocationPicker;
