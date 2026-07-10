import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Moon,
  Monitor,
  Plane,
  RefreshCw,
  Search,
  Sun,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingLogo from "../common/LoadingLogo";
import { hasClientPermission } from "../../features/auth/accessControl";
import { droneOpsApi } from "../../services/droneOpsApi";
import { getRealtimeSocket } from "../../services/realtimeClient";
import { buildNotificationsFromEvents } from "../../utils/activityStream";

const themeOptions = [
  { id: "default", label: "Default", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun }
];

const readStoredNotificationIds = (key) => {
  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const TopBar = ({ title, description, routes = [], user, searchValue, themeMode, onSearchChange, onThemeModeChange }) => {
  const navigate = useNavigate();
  const notificationRef = useRef(null);
  const searchRef = useRef(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState("");
  const [isNotificationLoading, setIsNotificationLoading] = useState(false);
  const lastLoadedAtRef = useRef(0);
  const searchRequestRef = useRef(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [globalResults, setGlobalResults] = useState([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);
  const [globalSearchError, setGlobalSearchError] = useState("");
  const storageKeys = useMemo(() => {
    const keys = new Set(["droneops-read-notifications"]);
    if (user?.id) keys.add(`droneops-read-notifications:${user.id}`);
    if (user?.email) keys.add(`droneops-read-notifications:${user.email.toLowerCase()}`);
    return Array.from(keys);
  }, [user?.email, user?.id]);
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const unreadCount = useMemo(
    () => notifications.filter((item) => !readNotificationIds.includes(item.id)).length,
    [notifications, readNotificationIds]
  );
  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const canRunGlobalSearch = normalizedSearchValue.length >= 2;

  const canRead = useCallback((permission) => hasClientPermission(user, permission), [user]);

  const loadNotifications = useCallback(async ({ force = false } = {}) => {
    if (!force && lastLoadedAtRef.current && Date.now() - lastLoadedAtRef.current < 60000) return;

    setIsNotificationLoading(true);
    setNotificationError("");

    try {
      const auditResult = canRead("audit:read") ? await droneOpsApi.audit.list({ limit: 20 }).catch(() => []) : [];

      setNotifications(buildNotificationsFromEvents({
        auditLogs: auditResult,
        telemetryRows: []
      }));
      const loadedAt = Date.now();
      lastLoadedAtRef.current = loadedAt;
    } catch (error) {
      setNotificationError(error.message ?? "Notifications could not be loaded.");
    } finally {
      setIsNotificationLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const mergedIds = storageKeys.flatMap((key) => readStoredNotificationIds(key));
    setReadNotificationIds(Array.from(new Set(mergedIds)));
  }, [storageKeys]);

  useEffect(() => {
    loadNotifications();
    const intervalId = window.setInterval(() => loadNotifications({ force: true }), 60000);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const handleTrackedChange = () => loadNotifications({ force: true });

    socket.on("operations:activity", handleTrackedChange);
    socket.on("operations:alert", handleTrackedChange);
    window.addEventListener("droneops:activity-changed", handleTrackedChange);

    return () => {
      socket.off("operations:activity", handleTrackedChange);
      socket.off("operations:alert", handleTrackedChange);
      window.removeEventListener("droneops:activity-changed", handleTrackedChange);
    };
  }, [loadNotifications]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!notificationRef.current?.contains(event.target)) {
        setIsNotificationsOpen(false);
      }

      if (!searchRef.current?.contains(event.target)) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!canRunGlobalSearch) {
      setGlobalResults([]);
      setGlobalSearchError("");
      setIsGlobalSearching(false);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setIsGlobalSearching(true);
    setGlobalSearchError("");

    const timerId = window.setTimeout(async () => {
      try {
        const results = await loadGlobalSearchResults({
          query: normalizedSearchValue,
          routes,
          canRead
        });

        if (searchRequestRef.current === requestId) {
          setGlobalResults(results);
          setIsGlobalSearching(false);
        }
      } catch (error) {
        if (searchRequestRef.current === requestId) {
          setGlobalResults([]);
          setGlobalSearchError(error.message ?? "Search could not be completed.");
          setIsGlobalSearching(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [canRead, canRunGlobalSearch, normalizedSearchValue, routes]);

  const markNotificationsRead = useCallback((items) => {
    if (!items.length) return;

    setReadNotificationIds((current) => {
      const next = Array.from(new Set([...current, ...items.map((item) => item.id)]));
      storageKeys.forEach((key) => {
        window.localStorage.setItem(key, JSON.stringify(next));
      });
      return next;
    });
  }, [storageKeys]);

  const handleNotificationClick = () => {
    const nextOpenState = !isNotificationsOpen;
    setIsNotificationsOpen(nextOpenState);
    if (nextOpenState) {
      loadNotifications();
    }
  };

  const handleNotificationItemClick = (item) => {
    markNotificationsRead([item]);
    setIsNotificationsOpen(false);

    if (item.targetPath) {
      navigate(item.targetPath);
    }
  };

  const handleSearchResultClick = (result) => {
    setIsSearchOpen(false);
    navigate(result.path);
  };

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Operations Center</p>
        <h2>{title}</h2>
        <p className="subtitle">{description}</p>
      </div>
      <div className="topbar-actions">
        <div className="global-search-shell" ref={searchRef}>
          <label className={`search-box ${isSearchOpen && canRunGlobalSearch ? "active" : ""}`}>
            <Search size={18} />
            <input
              value={searchValue}
              onChange={(event) => {
                onSearchChange(event.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsSearchOpen(false);
                }
              }}
              placeholder="Search DroneOps"
            />
          </label>
          {isSearchOpen && canRunGlobalSearch && (
            <div className="global-search-popover" role="dialog" aria-label="Global search results">
              <div className="global-search-header">
                <strong>Search results</strong>
                <span>{isGlobalSearching ? "Searching..." : `${globalResults.length} found`}</span>
              </div>
              <div className="global-search-list">
                {globalSearchError && <p className="empty-state error">{globalSearchError}</p>}
                {!globalSearchError && isGlobalSearching && globalResults.length === 0 && (
                  <p className="empty-state">Checking fleet, missions, incidents, reports, and users...</p>
                )}
                {!globalSearchError && !isGlobalSearching && globalResults.length === 0 && (
                  <p className="empty-state">No matching records in your accessible modules.</p>
                )}
                {globalResults.map((result) => {
                  const Icon = result.icon;
                  return (
                    <button
                      className="global-search-result"
                      key={`${result.type}-${result.id}`}
                      type="button"
                      onClick={() => handleSearchResultClick(result)}
                    >
                      <span className={`global-search-icon ${result.tone}`}>
                        <Icon size={17} />
                      </span>
                      <span>
                        <strong>{result.title}</strong>
                        <small>{result.subtitle}</small>
                      </span>
                      <em>{result.type}</em>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="notification-shell" ref={notificationRef}>
          <button
            className="icon-button notification-button"
            type="button"
            aria-label="Notifications"
            aria-expanded={isNotificationsOpen}
            onClick={handleNotificationClick}
          >
            <Bell size={19} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          {isNotificationsOpen && (
            <div className="notification-popover" role="dialog" aria-label="User notifications">
              <div className="notification-popover-header">
                <div>
                  <strong>Notifications</strong>
                  <span>{user?.roleLabel ?? "Current user"}</span>
                </div>
                <div className="notification-actions">
                  {unreadCount > 0 && (
                    <button
                      className="notification-read-button"
                      type="button"
                      onClick={() => markNotificationsRead(notifications)}
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    className="icon-button compact"
                    type="button"
                    aria-label="Refresh notifications"
                    onClick={() => loadNotifications({ force: true })}
                    disabled={isNotificationLoading}
                  >
                    {isNotificationLoading ? <LoadingLogo label="Refreshing notifications" size="xs" compact /> : <RefreshCw size={15} />}
                  </button>
                </div>
              </div>
              <div className="notification-list">
                {isNotificationLoading && notifications.length === 0 && <p className="empty-state">Loading notifications...</p>}
                {notificationError && <p className="empty-state error">{notificationError}</p>}
                {!isNotificationLoading && !notificationError && notifications.length === 0 && (
                  <article className="notification-item">
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>All clear</strong>
                      <p>No notifications for your current role.</p>
                    </div>
                  </article>
                )}
                {notifications.map((item) => {
                  const Icon = item.priority === "info" ? CheckCircle2 : AlertTriangle;
                  const isRead = readNotificationIds.includes(item.id);
                  return (
                    <button
                      className={`notification-item ${item.priority} ${isRead ? "is-read" : "is-unread"}`}
                      key={item.id}
                      type="button"
                      onClick={() => handleNotificationItemClick(item)}
                    >
                      <Icon size={18} />
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.message}</p>
                        <span>{item.time}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="theme-switcher" aria-label="Theme mode">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const isActive = themeMode === option.id;
            return (
              <button
                key={option.id}
                className={isActive ? "active" : ""}
                type="button"
                onClick={() => onThemeModeChange(option.id)}
                aria-pressed={isActive}
                title={`${option.label} mode`}
              >
                <Icon size={16} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        <div className="operator">
          <UserRound size={18} />
          <span>{user?.roleLabel ?? "Ops Lead"}</span>
        </div>
      </div>
    </header>
  );
};

const searchText = (values) => values.filter(Boolean).join(" ").toLowerCase();

const itemMatches = (values, query) => searchText(values).includes(query);

const safeRows = (rows) => (Array.isArray(rows) ? rows : []);
const globalSearchCache = new Map();
const GLOBAL_SEARCH_CACHE_MS = 30000;

const loadCachedSearchRows = async (key, loader) => {
  const cached = globalSearchCache.get(key);

  if (cached && Date.now() - cached.timestamp < GLOBAL_SEARCH_CACHE_MS) {
    return cached.rows;
  }

  const rows = await loader().catch(() => []);
  globalSearchCache.set(key, { rows, timestamp: Date.now() });
  return rows;
};

const loadGlobalSearchResults = async ({ query, routes, canRead }) => {
  const routeResults = routes
    .filter((route) => itemMatches([route.label, route.description, route.path], query))
    .map((route) => ({
      id: route.id,
      type: "Page",
      title: route.label,
      subtitle: route.description,
      path: route.path,
      icon: route.icon ?? Search,
      tone: "blue"
    }));

  const loaders = [
    {
      enabled: canRead("fleet"),
      type: "Drone",
      tone: "blue",
      icon: Plane,
      load: () => droneOpsApi.drones.list(),
      map: (drone) => ({
        id: drone.id,
        title: drone.droneCode ?? drone.id,
        subtitle: [drone.model, drone.manufacturer, drone.status].filter(Boolean).join(" / "),
        path: `/fleet/${encodeURIComponent(drone.id)}`
      }),
      values: (drone) => [drone.droneCode, drone.model, drone.manufacturer, drone.serialNumber, drone.status]
    },
    {
      enabled: canRead("missions"),
      type: "Mission",
      tone: "green",
      icon: MapPin,
      load: () => droneOpsApi.missions.list(),
      map: (mission) => ({
        id: mission.id,
        title: mission.missionCode ?? mission.title ?? mission.id,
        subtitle: [mission.title, mission.type, mission.status, mission.drone?.droneCode, mission.pilot?.name].filter(Boolean).join(" / "),
        path: `/missions/${encodeURIComponent(mission.id)}`
      }),
      values: (mission) => [mission.missionCode, mission.title, mission.type, mission.status, mission.drone?.droneCode, mission.pilot?.name]
    },
    {
      enabled: canRead("incidents"),
      type: "Incident",
      tone: "red",
      icon: AlertTriangle,
      load: () => droneOpsApi.incidents.list(),
      map: (incident) => ({
        id: incident.id,
        title: incident.incidentCode ?? incident.title ?? incident.id,
        subtitle: [incident.title, incident.type, incident.severity, incident.status, incident.drone?.droneCode].filter(Boolean).join(" / "),
        path: `/incidents/${encodeURIComponent(incident.id)}`
      }),
      values: (incident) => [incident.incidentCode, incident.title, incident.type, incident.severity, incident.status, incident.drone?.droneCode]
    },
    {
      enabled: canRead("reports"),
      type: "Report",
      tone: "purple",
      icon: ClipboardList,
      load: () => droneOpsApi.reports.list(),
      map: (report) => ({
        id: report.id,
        title: report.title ?? report.name ?? report.id,
        subtitle: [report.type, report.status, report.generatedBy?.name].filter(Boolean).join(" / "),
        path: `/reports/${encodeURIComponent(report.id)}`
      }),
      values: (report) => [report.title, report.name, report.type, report.status, report.generatedBy?.name]
    },
    {
      enabled: canRead("users"),
      type: "User",
      tone: "blue",
      icon: UserRound,
      load: () => droneOpsApi.users.list(),
      map: (record) => ({
        id: record.id,
        title: record.name ?? record.email,
        subtitle: [record.email, formatRoleLabel(record.role), record.organisation?.name].filter(Boolean).join(" / "),
        path: `/users/${encodeURIComponent(record.id)}`
      }),
      values: (record) => [record.name, record.email, record.role, record.organisation?.name]
    }
  ];

  const loadedGroups = await Promise.all(
    loaders
      .filter((loader) => loader.enabled)
      .map(async (loader) => {
        const rows = await loadCachedSearchRows(loader.type, loader.load);
        return safeRows(rows)
          .filter((row) => itemMatches(loader.values(row), query))
          .slice(0, 4)
          .map((row) => ({
            ...loader.map(row),
            type: loader.type,
            tone: loader.tone,
            icon: loader.icon
          }));
      })
  );

  return [...routeResults, ...loadedGroups.flat()].slice(0, 12);
};

const formatRoleLabel = (role = "") => role
  .toString()
  .toLowerCase()
  .split("_")
  .filter(Boolean)
  .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  .join(" ");

export default TopBar;
