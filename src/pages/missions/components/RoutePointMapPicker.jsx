import { Crosshair, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

const RoutePointMapPicker = ({ value = [], onChange }) => {
  const routePoints = useMemo(() => normalizeRoutePoints(value), [value]);
  const [activeIndex, setActiveIndex] = useState(() => getFirstEmptyIndex(value));
  const activePoint = routePoints[activeIndex] ?? routePoints[0];

  const updatePoint = (index, field, fieldValue) => {
    const nextPoints = routePoints.map((point, pointIndex) => (
      pointIndex === index ? { ...point, [field]: fieldValue } : point
    ));
    onChange?.(nextPoints);
  };

  const addStop = () => {
    const insertIndex = Math.max(routePoints.length - 1, 1);
    const nextPoints = [
      ...routePoints.slice(0, insertIndex),
      { label: `Stop ${insertIndex}`, latitude: "", longitude: "", altitude: "" },
      ...routePoints.slice(insertIndex)
    ];
    onChange?.(renumberStops(nextPoints));
    setActiveIndex(insertIndex);
  };

  const removeStop = (index) => {
    const nextPoints = renumberStops(routePoints.filter((_, pointIndex) => pointIndex !== index));
    onChange?.(nextPoints);
    setActiveIndex(Math.min(index, nextPoints.length - 1));
  };

  return (
    <div className="route-map-picker">
      <div className="route-picker-sidebar">
        <div className="route-picker-heading">
          <Crosshair size={18} />
          <div>
            <strong>Build drone path</strong>
            <span>{activePoint ? `${activePoint.label || "Selected point"} is ready for local coordinates.` : "Add route points to continue."}</span>
          </div>
        </div>

        <div className="route-point-list">
          {routePoints.map((point, index) => (
            <div className={`route-point-item ${index === activeIndex ? "active" : ""}`} key={`${point.label}-${index}`}>
              <button className="route-point-select" type="button" onClick={() => setActiveIndex(index)}>
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
        <div className="route-picker-empty route-picker-coordinate-panel">
          <Crosshair size={22} />
          <div>
            <strong>{activePoint?.label ?? "Drone path"}</strong>
            <p>Enter dummy GPS coordinates for local mission planning.</p>
          </div>
        </div>
        <div className="route-coordinate-grid">
          {routePoints.map((point, index) => (
            <div className={`route-coordinate-card ${index === activeIndex ? "active" : ""}`} key={`${point.label}-fields-${index}`}>
              <div className="route-coordinate-card-header">
                <strong>{point.label || getPointLabel(index, routePoints.length)}</strong>
                <button type="button" onClick={() => setActiveIndex(index)}>Select</button>
              </div>
              <label>
                <span>Latitude</span>
                <input value={point.latitude ?? ""} onChange={(event) => updatePoint(index, "latitude", event.target.value)} placeholder="-33.86880" />
              </label>
              <label>
                <span>Longitude</span>
                <input value={point.longitude ?? ""} onChange={(event) => updatePoint(index, "longitude", event.target.value)} placeholder="151.20930" />
              </label>
              <label>
                <span>Altitude</span>
                <input value={point.altitude ?? ""} onChange={(event) => updatePoint(index, "altitude", event.target.value)} placeholder="120" />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

const getFirstEmptyIndex = (points) => {
  const normalized = normalizeRoutePoints(points);
  const emptyIndex = normalized.findIndex((point) => !hasCoordinates(point));
  return emptyIndex >= 0 ? emptyIndex : 0;
};

export default RoutePointMapPicker;
