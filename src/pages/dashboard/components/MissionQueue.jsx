import { Plus, Route } from "lucide-react";
import ActionButton from "../../../components/common/ActionButton";
import ProgressBar from "../../../components/common/ProgressBar";
import SectionHeader from "../../../components/common/SectionHeader";
import StatusBadge from "../../../components/common/StatusBadge";

const MissionQueue = ({ canCreate = false, isLoading = false, missions = [], onCreateMission, onMissionSelect }) => {
  return (
    <div className="panel missions-panel">
      <SectionHeader
        title="Mission Queue"
        description="Current field work and estimated completion."
        action={canCreate ? (
          <ActionButton icon={Plus} variant="primary" onClick={onCreateMission}>
            New Mission
          </ActionButton>
        ) : null}
      />
      <div className="mission-list">
        {isLoading && <p className="empty-state">Loading mission queue...</p>}
        {!isLoading && missions.length === 0 && <p className="empty-state">No active or planned missions yet.</p>}
        {!isLoading && missions.map((mission) => (
          <button className="mission-row dashboard-clickable-item" key={mission.id} type="button" onClick={() => onMissionSelect?.(mission)}>
            <div className="mission-icon"><Route size={19} /></div>
            <div className="mission-main">
              <div className="mission-title">
                <h4>{mission.name}</h4>
                <StatusBadge type="risk">{mission.risk}</StatusBadge>
              </div>
              <p>{getMissionQueueLine(mission)}</p>
              <ProgressBar value={mission.progress} />
            </div>
            <strong>{mission.progress}%</strong>
          </button>
        ))}
      </div>
    </div>
  );
};

const getMissionQueueLine = (mission) => {
  const status = String(mission.status ?? "").toUpperCase();
  if (status === "ACTIVE") return `${mission.drone} on route. ETA ${mission.eta}.`;
  if (status === "RISK_ASSESSMENT_COMPLETED") return `${mission.drone} cleared for start.`;
  if (status === "APPROVED") return `${mission.drone} approved, risk assessment pending.`;
  if (status === "AWAITING_AUTHORITY_APPROVAL") return `${mission.drone} waiting for authority permissions.`;
  return `${mission.drone} planned for ${mission.eta}.`;
};

export default MissionQueue;
