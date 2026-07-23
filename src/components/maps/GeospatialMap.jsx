import { Home, MapPin } from "lucide-react";
import { activeFlightPath, droneMapPoints, geofenceZones } from "../../data/geospatialData";

const GeospatialMap = () => {
  return (
    <div className="panel map-panel">
      <div className="panel-heading compact">
        <div>
          <h3>Telemetry Map</h3>
          <p>Dummy fleet positions and geofence overlays.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Center map">
          <Home size={17} />
        </button>
      </div>
      <div className="map-canvas geospatial-fallback" aria-label="Drone location map">
        <div className="map-grid" />
        {geofenceZones.map((zone) => (
          <div
            className={`geofence-shape ${zone.type === "RESTRICTED" ? "restricted" : "warning"}`}
            key={zone.name}
          />
        ))}
        <div className="flight-path-line" />
        {droneMapPoints.map((drone, index) => (
          <MapPin
            className={`map-pin pin-${["a", "b", "c"][index] ?? "a"}`}
            key={drone.id}
            size={index === 0 ? 34 : index === 1 ? 28 : 30}
          />
        ))}
        <div className="map-label">Dummy fleet map preview</div>
      </div>
      <div className="map-legend">
        <span><i className="dot green" /> Dummy drone</span>
        <span><i className="dot blue" /> Reference path</span>
        <span><i className="dot red" /> Restricted</span>
        <span><i className="dot amber" /> Warning</span>
        <span className="map-legend-detail">{activeFlightPath.length} local path points loaded</span>
      </div>
    </div>
  );
};

export default GeospatialMap;
