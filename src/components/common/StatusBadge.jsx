import { getRiskTone, getStatusTone } from "../../utils/formatters";

const StatusBadge = ({ children, type = "status" }) => {
  const tone = type === "risk" ? getRiskTone(children) : getStatusTone(children);
  return <span className={`status-pill ${tone}`}>{children}</span>;
};

export default StatusBadge;
