export const userRoles = [
  {
    id: "operations_manager",
    label: "Operations Manager",
    summary: "Manages missions, assigns drones and pilots, monitors operations, and views fleet status.",
    permissions: [
      "dashboard",
      "fleet",
      "drones:read",
      "drones:manage",
      "missions",
      "missions:read",
      "missions:manage",
      "telemetry:read",
      "geofences:read",
      "incidents",
      "incidents:read",
      "reports",
      "reports:read",
      "documents:read",
      "audit:read"
    ]
  },
  {
    id: "remote_pilot",
    label: "Remote Pilot",
    summary: "Accesses assigned missions, submits flight logs, completes risk assessments, and views telemetry.",
    permissions: [
      "dashboard",
      "fleet",
      "drones:read",
      "missions",
      "missions:read",
      "telemetry:read",
      "geofences:read",
      "incidents:create",
      "documents:read",
      "audit:read"
    ]
  },
  {
    id: "maintenance_coordinator",
    label: "Maintenance Coordinator",
    summary: "Manages maintenance schedules, tracks airworthiness, and logs repairs and inspections.",
    permissions: [
      "dashboard",
      "fleet",
      "drones:read",
      "maintenance:manage",
      "defects:manage",
      "reports",
      "reports:read",
      "documents:read",
      "audit:read"
    ]
  },
  {
    id: "safety_officer",
    label: "Safety Officer",
    summary: "Reviews incidents, monitors geofence breaches, accesses hazards, and manages JSA workflows.",
    permissions: [
      "dashboard",
      "incidents",
      "incidents:read",
      "incidents:manage",
      "geofences:read",
      "geofences:manage",
      "risk:manage",
      "telemetry:read",
      "reports",
      "reports:read",
      "documents:read",
      "audit:read"
    ]
  },
  {
    id: "compliance_officer",
    label: "Compliance Officer",
    summary: "Manages documentation, generates audit reports, and accesses compliance records.",
    permissions: [
      "dashboard",
      "reports",
      "reports:read",
      "reports:manage",
      "documents:read",
      "documents:manage",
      "audit:read"
    ]
  },
  {
    id: "system_administrator",
    label: "System Administrator",
    summary: "Manages users, configures platform settings, and accesses all modules.",
    permissions: ["dashboard", "fleet", "missions", "missions:manage", "incidents", "reports", "settings", "users", "*"]
  }
];

export const demoUsers = [
  {
    id: "usr-001",
    name: "Olivia Hart",
    email: "ops@droneops.test",
    password: "Password123!",
    role: "operations_manager",
    organization: "DroneOps NSW",
    isVerified: true,
    avatar: "OH"
  },
  {
    id: "usr-002",
    name: "Maya Chen",
    email: "pilot@droneops.test",
    password: "Password123!",
    role: "remote_pilot",
    organization: "DroneOps NSW",
    isVerified: true,
    avatar: "MC"
  },
  {
    id: "usr-003",
    name: "Sam Wright",
    email: "maintenance@droneops.test",
    password: "Password123!",
    role: "maintenance_coordinator",
    organization: "DroneOps NSW",
    isVerified: true,
    avatar: "SW"
  },
  {
    id: "usr-004",
    name: "Priya Rao",
    email: "unverified@droneops.test",
    password: "Password123!",
    role: "compliance_officer",
    organization: "DroneOps NSW",
    isVerified: false,
    avatar: "PR"
  }
];

export const platformHighlights = [
  {
    title: "Fleet Governance",
    text: "Centralize drone profiles, lifecycle status, airworthiness, and mission readiness in one operational portal."
  },
  {
    title: "Mission Readiness",
    text: "Coordinate pilots, aircraft availability, risk checks, geofences, and live mission progress before takeoff."
  },
  {
    title: "Safety & Compliance",
    text: "Track incidents, maintenance evidence, audit records, and compliance reports for regulated drone operations."
  }
];

export const loginMetrics = [
  { value: "50+", label: "Concurrent drones" },
  { value: "2s", label: "Telemetry refresh target" },
  { value: "6", label: "Operational roles" }
];
