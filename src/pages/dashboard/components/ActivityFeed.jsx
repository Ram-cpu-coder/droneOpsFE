import { AlertTriangle, BarChart3, CheckCircle2, Plane, Route } from "lucide-react";

const icons = {
  success: CheckCircle2,
  drone: Plane,
  mission: Route,
  incident: AlertTriangle,
  report: BarChart3
};

const ActivityFeed = ({ activity, isLoading = false, onActivitySelect }) => {
  return (
    <div className="panel activity-panel">
      <div className="panel-heading compact">
        <h3>Recent Activity</h3>
      </div>
      <div className="activity-list">
        {isLoading && <p className="empty-state">Loading recent activity...</p>}
        {!isLoading && activity.length === 0 && <p className="empty-state">No recent activity yet.</p>}
        {activity.map((item) => {
          const Icon = icons[item.type] ?? CheckCircle2;
          return (
            <button
              className="activity-item dashboard-clickable-item"
              key={item.id ?? item.label}
              type="button"
              onClick={() => onActivitySelect?.(item)}
              disabled={!item.targetPath}
            >
              <div className="activity-icon"><Icon size={17} /></div>
              <div>
                <p>{item.label}</p>
                <span>{item.time}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityFeed;
