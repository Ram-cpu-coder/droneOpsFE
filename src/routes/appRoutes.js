import { createElement, lazy } from "react";
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
import PlaceholderPage from "../pages/PlaceholderPage";

const Dashboard = lazy(() => import("../pages/dashboard/Dashboard"));
const Fleet = lazy(() => import("../pages/fleet/Fleet"));
const Missions = lazy(() => import("../pages/missions/Missions"));

const createPlaceholder = (route) => function PlaceholderRoute() {
  return createElement(PlaceholderPage, { route });
};

const routes = [
  {
    id: "dashboard",
    path: "/dashboard",
    label: "Dashboard",
    description: "Fleet health, mission status, alerts, and operational activity.",
    icon: Grid2X2,
    requiredPermission: "dashboard"
  },
  {
    id: "fleet",
    path: "/fleet",
    label: "Fleet",
    description: "Aircraft inventory, dock status, maintenance, payloads, and telemetry readiness.",
    icon: Plane,
    requiredPermission: "fleet"
  },
  {
    id: "missions",
    path: "/missions",
    label: "Missions",
    description: "Mission planning, route progress, assigned drones, and scheduled work.",
    icon: MapPin,
    requiredPermission: "missions"
  },
  {
    id: "incidents",
    path: "/incidents",
    label: "Incidents",
    description: "Open alerts, severity handling, incident ownership, and audit trail.",
    icon: AlertTriangle,
    requiredPermission: "incidents"
  },
  {
    id: "reports",
    path: "/reports",
    label: "Reports",
    description: "Utilization, safety, compliance, energy, and export-ready summaries.",
    icon: ClipboardList,
    requiredPermission: "reports"
  },
  {
    id: "users",
    path: "/users",
    label: "Users",
    description: "Manage users, verification status, role assignments, and access control.",
    icon: Users,
    requiredPermission: "users",
    secondary: true
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    description: "Operational thresholds, team access, notification rules, and integrations.",
    icon: Settings,
    requiredPermission: "settings",
    secondary: true
  }
];

export const appRoutes = routes.map((route) => ({
  ...route,
  component: route.id === "dashboard"
    ? Dashboard
    : route.id === "fleet"
      ? Fleet
      : route.id === "missions"
        ? Missions
        : createPlaceholder(route)
}));

export const quickActions = [
  { label: "Create Mission", icon: MapPin, target: "missions" },
  { label: "Fleet Report", icon: BarChart3, target: "reports" },
  { label: "Register Drone", icon: Plane, target: "fleet" }
];
