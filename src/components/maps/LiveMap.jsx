import { Home, MapPin } from "lucide-react";

const LiveMap = () => {
  return (
    <div className="panel map-panel">
      <div className="panel-heading compact">
        <h3>Live Map</h3>
        <button className="icon-button" type="button" aria-label="Center map">
          <Home size={17} />
        </button>
      </div>
      <div className="map-canvas" aria-label="Drone location map">
        <div className="map-grid" />
        <MapPin className="map-pin pin-a" size={34} />
        <MapPin className="map-pin pin-b" size={28} />
        <MapPin className="map-pin pin-c" size={30} />
        <div className="map-label">3 drones active</div>
      </div>
      <div className="map-legend">
        <span><i className="dot green" /> Active</span>
        <span><i className="dot amber" /> Charging</span>
        <span><i className="dot gray" /> Idle</span>
      </div>
    </div>
  );
};

export default LiveMap;
