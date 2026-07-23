import { Plus, Route } from "lucide-react";
import ActionButton from "../../../components/common/ActionButton";
import ProgressBar from "../../../components/common/ProgressBar";
import SectionHeader from "../../../components/common/SectionHeader";
import StatusBadge from "../../../components/common/StatusBadge";

const MissionQueue = ({ canCreate = false, isLoading = false, missions = [], onCreateMission }) => {
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
          <article className="mission-row" key={mission.id}>
            <div className="mission-icon"><Route size={19} /></div>
            <div className="mission-main">
              <div className="mission-title">
                <h4>{mission.name}</h4>
                <StatusBadge type="risk">{mission.risk}</StatusBadge>
              </div>
              <p>{mission.drone} on route. ETA {mission.eta}.</p>
              <ProgressBar value={mission.progress} />
            </div>
            <strong>{mission.progress}%</strong>
          </article>
        ))}
      </div>
    </div>
  );
};

export default MissionQueue;
