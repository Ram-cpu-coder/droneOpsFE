import { lazy } from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Grid2X2,
  MapPin,
  Plane,
  Settings,
  Users
} from "lucide-react";

// const Dashboard = lazy(() => import("../pages/dashboard/Dashboard"));
// const Fleet = lazy(() => import("../pages/fleet/Fleet"));
// const Missions = lazy(() => import("../pages/missions/Missions"));
// const Incidents = lazy(() => import("../pages/incidents/Incidents"));
// const Reports = lazy(() => import("../pages/reports/Reports"));
// const SettingsPage = lazy(() => import("../pages/settings/Settings"));
// const UserManagement = lazy(() => import("../pages/users/UserManagement"));

export const appRoutes = [
  // {
  //   id: "dashboard",
  //   path: "/dashboard",
  //   label: "Dashboard",
  //   description: "Fleet health, mission status, alerts, and operational activity.",
  //   icon: Grid2X2,
  //   requiredPermission: "dashboard",
  //   component: Dashboard
  // },
  // {
  //   id: "fleet",
  //   path: "/fleet",
  //   label: "Fleet",
  //   description: "Aircraft inventory, dock status, maintenance, payloads, and telemetry readiness.",
  //   icon: Plane,
  //   requiredPermission: "fleet",
  //   component: Fleet
  // },
  // {
  //   id: "missions",
  //   path: "/missions",
  //   label: "Missions",
  //   description: "Mission planning, route progress, assigned drones, and scheduled work.",
  //   icon: MapPin,
  //   requiredPermission: "missions",
  //   component: Missions
  // },
  // {
  //   id: "incidents",
  //   path: "/incidents",
  //   label: "Incidents",
  //   description: "Open alerts, severity handling, incident ownership, and audit trail.",
  //   icon: AlertTriangle,
  //   requiredPermission: "incidents",
  //   component: Incidents
  // },
  // {
  //   id: "reports",
  //   path: "/reports",
  //   label: "Reports",
  //   description: "Utilization, safety, compliance, energy, and export-ready summaries.",
  //   icon: ClipboardList,
  //   requiredPermission: "reports",
  //   component: Reports
  // },
  // {
  //   id: "users",
  //   path: "/users",
  //   label: "Users",
  //   description: "Manage users, verification status, role assignments, and access control.",
  //   icon: Users,
  //   requiredPermission: "users",
  //   component: UserManagement,
  //   secondary: true
  // },
  // {
  //   id: "settings",
  //   path: "/settings",
  //   label: "Settings",
  //   description: "Operational thresholds, team access, notification rules, and integrations.",
  //   icon: Settings,
  //   component: SettingsPage,
  //   secondary: true
  // }
];

// export const quickActions = [
//   { label: "Create Mission", icon: MapPin, target: "missions" },
//   { label: "Fleet Report", icon: BarChart3, target: "reports" },
//   { label: "Register Drone", icon: Plane, target: "fleet" }
// ];
