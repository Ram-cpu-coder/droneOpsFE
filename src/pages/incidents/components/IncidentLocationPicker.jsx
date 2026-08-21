/* oxlint-disable react-hooks/exhaustive-deps */
import { LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const defaultCenter = [151.2073, -33.8679];

const IncidentLocationPicker = ({ value, onChange, error }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapboxRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [query, setQuery] = useState("");

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

        const location = normalizeLocation(value);
        mapRef.current = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/navigation-night-v1",
          center: location ? [location.longitude, location.latitude] : defaultCenter,
          zoom: location ? 14 : 11.5,
          pitch: 12
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
        mapRef.current.on("load", () => {
          if (!isMounted) return;
          setMapReady(true);
        });
        mapRef.current.on("click", async (event) => {
          await setLocationFromCoordinates(event.lngLat.lat, event.lngLat.lng);
        });
      } catch (setupError) {
        if (isMounted) setMapError(setupError.message);
      }
    };

    setupMap();

    return () => {
      isMounted = false;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapboxRef.current) return;
    syncMarker(normalizeLocation(value));
  }, [mapReady, value]);

  const setLocation = (location) => {
    onChange?.(location);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [location.longitude, location.latitude],
        zoom: Math.max(mapRef.current.getZoom(), 14),
        speed: 0.9
      });
    }
  };

  const setLocationFromCoordinates = async (latitude, longitude) => {
    const label = await reverseGeocodeLocation(latitude, longitude);
    setLocation({
      label,
      latitude,
      longitude
    });
  };

  const syncMarker = (location) => {
    if (!location || !mapRef.current || !mapboxRef.current) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const lngLat = [location.longitude, location.latitude];
    if (!markerRef.current) {
      const markerElement = document.createElement("div");
      markerElement.className = "incident-location-marker";
      markerElement.textContent = "!";
      markerRef.current = new mapboxRef.current.Marker({ element: markerElement, draggable: true })
        .setLngLat(lngLat)
        .addTo(mapRef.current);
      markerRef.current.on("dragend", async () => {
        const nextLocation = markerRef.current.getLngLat();
        await setLocationFromCoordinates(nextLocation.lat, nextLocation.lng);
      });
      return;
    }

    markerRef.current.setLngLat(lngLat);
  };

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !mapboxToken) return;

    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmedQuery)}.json?limit=1&access_token=${mapboxToken}`);
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

  if (!mapboxToken) {
    return (
      <div className={`incident-location-picker empty ${error ? "has-error" : ""}`}>
        <MapPin size={18} />
        <strong>Map location unavailable</strong>
        <span>Add `VITE_MAPBOX_TOKEN` to select incident locations on the map.</span>
        {error && <small>{error}</small>}
      </div>
    );
  }

  return (
    <div className={`incident-location-picker ${error ? "has-error" : ""}`}>
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
      <div className="incident-location-map" ref={mapContainerRef} />
      <div className="incident-location-meta">
        <LocateFixed size={15} />
        <span>{location ? formatLocationLabel(location) : "Search or click the map to choose the incident location."}</span>
      </div>
      {(error || mapError) && <small className="field-error">{error || mapError}</small>}
    </div>
  );
};

const normalizeLocation = (location) => {
  if (!location || typeof location !== "object") return null;
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng ?? location.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { ...location, latitude, longitude }
    : null;
};

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
