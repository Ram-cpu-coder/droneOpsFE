export const mapCenter = {
  latitude: -33.8688,
  longitude: 151.2093
};

export const droneMapPoints = [
  {
    id: "DRN-001",
    status: "IN_MISSION",
    mission: "North Ridge Survey",
    coordinates: [151.2093, -33.8688],
    battery: 85,
    signal: 96
  },
  {
    id: "DRN-002",
    status: "IN_MISSION",
    mission: "Harbor Perimeter Scan",
    coordinates: [151.2267, -33.861],
    battery: 72,
    signal: 89
  },
  {
    id: "DRN-005",
    status: "IN_MISSION",
    mission: "Solar Farm Inspection",
    coordinates: [151.1902, -33.8796],
    battery: 68,
    signal: 84
  }
];

export const activeFlightPath = [
  [151.185, -33.883],
  [151.194, -33.878],
  [151.203, -33.872],
  [151.2093, -33.8688],
  [151.217, -33.864]
];

export const geofenceZones = [
  {
    name: "Restricted Airspace",
    type: "RESTRICTED",
    polygon: [
      [151.218, -33.878],
      [151.233, -33.875],
      [151.237, -33.865],
      [151.222, -33.86],
      [151.214, -33.868],
      [151.218, -33.878]
    ]
  },
  {
    name: "Warning Zone",
    type: "WARNING",
    polygon: [
      [151.181, -33.872],
      [151.197, -33.867],
      [151.201, -33.858],
      [151.184, -33.855],
      [151.176, -33.864],
      [151.181, -33.872]
    ]
  }
];
