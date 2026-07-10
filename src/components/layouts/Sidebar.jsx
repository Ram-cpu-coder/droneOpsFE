import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import DroneLogo from "../common/DroneLogo";

const Sidebar = ({ activeRoute, routes, onNavigate, onLogout }) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const safeRoutes = Array.isArray(routes) ? routes : [];
  const primaryRoutes = safeRoutes.filter((route) => !route.secondary);
  const secondaryRoutes = safeRoutes.filter((route) => route.secondary);
  const handleNavigate = (routeId) => {
    onNavigate(routeId);
    setIsMobileNavOpen(false);
  };

  return (
    <aside className={`sidebar ${isMobileNavOpen ? "mobile-open" : ""}`}>
      <div className="brand">
        <DroneLogo className="brand-drone-logo" />
        <div>
          <h1>DroneOps</h1>
          <p>Fleet Management</p>
        </div>
        <button
          className="mobile-menu-button"
          type="button"
          onClick={() => setIsMobileNavOpen((current) => !current)}
          aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isMobileNavOpen}
        >
          {isMobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className="sidebar-nav-surface">
        <nav className="nav-list" aria-label="Primary navigation">
          {primaryRoutes.map((route) => (
            <SidebarButton
              key={route.id}
              route={route}
              active={activeRoute === route.id}
              onNavigate={handleNavigate}
            />
          ))}
        </nav>

        <div className="sidebar-footer">
          {secondaryRoutes.map((route) => (
            <SidebarButton
              key={route.id}
              route={route}
              active={activeRoute === route.id}
              onNavigate={handleNavigate}
            />
          ))}
          <button className="nav-item logout" type="button" onClick={onLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

const SidebarButton = ({ route, active, onNavigate }) => {
  const Icon = route.icon;

  return (
    <button
      type="button"
      className={`nav-item ${active ? "active" : ""}`}
      onClick={() => onNavigate(route.id)}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={20} />
      <span>{route.label}</span>
    </button>
  );
};

export default Sidebar;
