import { AlertTriangle } from "lucide-react";
import StatusBadge from "../../../components/common/StatusBadge";

const IncidentWatch = ({ incidents, onIncidentSelect }) => {
  return (
    <div className="panel incident-panel">
      <div className="panel-heading compact">
        <h3>Incident Watch</h3>
        <StatusBadge>Open</StatusBadge>
      </div>
      {incidents.length === 0 && <p className="empty-state">No open incidents.</p>}
      {incidents.map((incident) => (
        <button className="incident-card dashboard-clickable-item" key={incident.id} type="button" onClick={() => onIncidentSelect?.(incident)}>
          <AlertTriangle size={18} />
          <div>
            <h4>{incident.title}</h4>
            <p>{incident.place}</p>
          </div>
          <span>{incident.time}</span>
        </button>
      ))}
    </div>
  );
};

export default IncidentWatch;
