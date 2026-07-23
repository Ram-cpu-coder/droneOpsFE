export const fleetSummary = [
  { label: "Total Drones", value: "12", delta: "+2 this month", tone: "blue" },
  { label: "Active Missions", value: "3", delta: "2 finishing today", tone: "green" },
  { label: "Open Alerts", value: "2", delta: "1 needs action", tone: "red" },
  { label: "Locations", value: "5", delta: "Sydney region", tone: "purple" }
];

export const drones = [
  {
    id: "DRN-001",
    model: "AeroScan X4",
    manufacturer: "AeroVision",
    serialNumber: "AV-X4-2026-001",
    batteryType: "Li-ion 6S",
    firmwareVersion: "v12.4.1",
    status: "IN_MISSION",
    battery: 85,
    health: 94,
    location: "Site A - Zone 1",
    mission: "North Ridge Survey",
    pilot: "Maya Chen",
    payload: "LiDAR + RGB",
    signal: 96,
    flightHours: 128,
    purchaseDate: "2025-08-14",
    certificationStatus: "CERTIFIED",
    nextMaintenance: "2026-05-27"
  },
  {
    id: "DRN-002",
    model: "SkyMapper Pro",
    manufacturer: "SkyWorks",
    serialNumber: "SW-SMP-2026-044",
    batteryType: "LiPo 4S",
    firmwareVersion: "v10.9.3",
    status: "IN_MISSION",
    battery: 72,
    health: 88,
    location: "Site B - Zone 2",
    mission: "Harbor Perimeter Scan",
    pilot: "Noah Patel",
    payload: "Thermal",
    signal: 89,
    flightHours: 93,
    purchaseDate: "2025-11-02",
    certificationStatus: "CERTIFIED",
    nextMaintenance: "2026-05-29"
  },
  {
    id: "DRN-003",
    model: "CargoLift M2",
    manufacturer: "LiftLabs",
    serialNumber: "LL-M2-2025-118",
    batteryType: "Li-ion smart pack",
    firmwareVersion: "v8.6.0",
    status: "AVAILABLE",
    battery: 45,
    health: 91,
    location: "Base Station",
    mission: "Standby",
    pilot: "Unassigned",
    payload: "Cargo bay",
    signal: 100,
    flightHours: 76,
    purchaseDate: "2025-06-22",
    certificationStatus: "CERTIFIED",
    nextMaintenance: "2026-06-02"
  },
  {
    id: "DRN-004",
    model: "Sentinel V8",
    manufacturer: "Sentinel Robotics",
    serialNumber: "SR-V8-2026-019",
    batteryType: "LiPo 6S",
    firmwareVersion: "v15.1.2",
    status: "AVAILABLE",
    battery: 100,
    health: 98,
    location: "Base Station",
    mission: "Standby",
    pilot: "Unassigned",
    payload: "Zoom camera",
    signal: 100,
    flightHours: 52,
    purchaseDate: "2026-01-16",
    certificationStatus: "AWAITING_RENEWAL",
    nextMaintenance: "2026-06-08"
  },
  {
    id: "DRN-005",
    model: "AeroScan X4",
    manufacturer: "AeroVision",
    serialNumber: "AV-X4-2025-086",
    batteryType: "Li-ion 6S",
    firmwareVersion: "v12.3.9",
    status: "IN_MISSION",
    battery: 68,
    health: 86,
    location: "Site C - Zone 3",
    mission: "Solar Farm Inspection",
    pilot: "Ava Brown",
    payload: "Multispectral",
    signal: 84,
    flightHours: 141,
    purchaseDate: "2025-04-08",
    certificationStatus: "CERTIFIED",
    nextMaintenance: "2026-05-25"
  },
  {
    id: "DRN-006",
    model: "RescueEye R2",
    manufacturer: "RescueEye Systems",
    serialNumber: "RES-R2-2024-237",
    batteryType: "Li-ion emergency pack",
    firmwareVersion: "v9.2.7",
    status: "MAINTENANCE",
    battery: 63,
    health: 71,
    location: "Hangar 2",
    mission: "Unavailable",
    pilot: "Maintenance",
    payload: "Searchlight",
    signal: 0,
    flightHours: 188,
    purchaseDate: "2024-10-30",
    certificationStatus: "GROUNDED_PENDING_INSPECTION",
    nextMaintenance: "2026-05-22"
  }
];

export const missions = [
  {
    id: "MIS-1042",
    name: "North Ridge Survey",
    drone: "DRN-001",
    pilot: "Maya Chen",
    type: "Mapping",
    status: "In Progress",
    progress: 68,
    eta: "24 min",
    start: "09:30",
    area: "Site A - Zone 1",
    risk: "Low",
    checkpoints: "14 / 21"
  },
  {
    id: "MIS-1043",
    name: "Harbor Perimeter Scan",
    drone: "DRN-002",
    pilot: "Noah Patel",
    type: "Security",
    status: "In Progress",
    progress: 41,
    eta: "39 min",
    start: "10:05",
    area: "Site B - Zone 2",
    risk: "Medium",
    checkpoints: "9 / 22"
  },
  {
    id: "MIS-1044",
    name: "Solar Farm Inspection",
    drone: "DRN-005",
    pilot: "Ava Brown",
    type: "Inspection",
    status: "In Progress",
    progress: 82,
    eta: "11 min",
    start: "09:10",
    area: "Site C - Zone 3",
    risk: "Low",
    checkpoints: "31 / 38"
  },
  {
    id: "MIS-1045",
    name: "Emergency Response Drill",
    drone: "DRN-004",
    pilot: "Jordan Lee",
    type: "Training",
    status: "Scheduled",
    progress: 0,
    eta: "Starts 14:00",
    start: "14:00",
    area: "Training Field",
    risk: "Low",
    checkpoints: "0 / 16"
  }
];

export const incidents = [
  {
    id: "INC-2201",
    title: "Wind threshold exceeded",
    place: "Site B - Zone 2",
    time: "8 min ago",
    severity: "Medium",
    owner: "Noah Patel",
    status: "Investigating",
    source: "Weather API",
    details: "Gusts reached 36 km/h for 90 seconds near waypoint 9."
  },
  {
    id: "INC-2202",
    title: "Battery reserve warning",
    place: "Site C - Zone 3",
    time: "16 min ago",
    severity: "Low",
    owner: "Ava Brown",
    status: "Monitoring",
    source: "Telemetry",
    details: "Battery reserve projected below preferred landing threshold."
  },
  {
    id: "INC-2198",
    title: "Maintenance sensor drift",
    place: "Hangar 2",
    time: "Yesterday",
    severity: "High",
    owner: "Maintenance",
    status: "Open",
    source: "Diagnostics",
    details: "DRN-006 IMU calibration variance requires physical inspection."
  }
];

export const activity = [
  { label: "DRN-001 completed waypoint 14", time: "2 min ago", type: "success" },
  { label: "Mission North Ridge Survey route updated", time: "9 min ago", type: "mission" },
  { label: "DRN-003 docked for charging", time: "21 min ago", type: "charging" },
  { label: "Weekly utilization report generated", time: "1 hr ago", type: "report" }
];

export const reports = [
  { name: "Fleet Utilization", value: "78%", change: "+6%", status: "Ready", owner: "Operations" },
  { name: "Safety Compliance", value: "96%", change: "+1%", status: "Ready", owner: "Compliance" },
  { name: "Battery Efficiency", value: "84%", change: "-2%", status: "Review", owner: "Maintenance" },
  { name: "Mission Completion", value: "91%", change: "+4%", status: "Ready", owner: "Operations" }
];

export const settings = {
  roles: [
    { role: "Operations Lead", access: "Full fleet, mission, incident, report access" },
    { role: "Pilot", access: "Assigned missions, telemetry, incident notes" },
    { role: "Maintenance", access: "Aircraft health, service logs, diagnostics" }
  ]
};
