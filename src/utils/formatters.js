export const toPercent = (value) => `${Math.round(value)}%`;

export const getRiskTone = (risk) => {
  const normalized = risk?.toLowerCase();
  if (["high", "critical"].includes(normalized)) return "red";
  if (normalized === "medium") return "amber";
  return "green";
};

export const getStatusTone = (status) => {
  const normalized = status?.toLowerCase();
  if (["active", "available", "in progress", "ready", "certified", "verified"].includes(normalized)) return "green";
  if (["in_mission", "charging", "scheduled", "review", "monitoring", "investigating", "awaiting_approval", "awaiting_renewal"].includes(normalized)) return "amber";
  if (["maintenance", "grounded", "disconnected", "open", "unavailable", "grounded_pending_inspection"].includes(normalized)) return "red";
  return "gray";
};
