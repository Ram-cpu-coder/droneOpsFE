export const toPercent = (value) => `${Math.round(value)}%`;

export const formatDateOnly = (value, fallback = "") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
};

export const getRiskTone = (risk) => {
  const normalized = risk?.toLowerCase();
  if (["high", "critical"].includes(normalized)) return "red";
  if (normalized === "medium") return "amber";
  return "green";
};

export const getStatusTone = (status) => {
  const normalized = status?.toLowerCase();
  if (["active", "available", "in progress", "ready", "certified", "verified"].includes(normalized)) return "green";
  if (["in_mission", "charging", "scheduled", "review", "monitoring", "investigating", "awaiting_approval", "awaiting_renewal", "risk_assessment_completed", "risk assessment completed"].includes(normalized)) return "amber";
  if (["maintenance", "overdue", "grounded", "disconnected", "open", "unavailable", "grounded_pending_inspection", "available_offline"].includes(normalized)) return "red";
  return "gray";
};
