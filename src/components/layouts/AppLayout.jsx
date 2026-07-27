import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useEffect, useState } from "react";

const AppLayout = ({
  activeRoute,
  routes,
  user,
  searchValue,
  themeMode,
  onNavigate,
  onSearchChange,
  onThemeModeChange,
  onLogout,
  children
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("droneops-sidebar-collapsed") === "true";
  });
  const currentRoute = routes.find((route) => route.id === activeRoute) ?? routes[0] ?? {
    label: "DroneOps",
    description: "Your workspace is loading."
  };

  useEffect(() => {
    window.localStorage.setItem("droneops-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        activeRoute={activeRoute}
        routes={routes}
        isCollapsed={isSidebarCollapsed}
        onCollapsedChange={setIsSidebarCollapsed}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <main className="workspace">
        <TopBar
          title={currentRoute.label}
          description={currentRoute.description}
          routes={routes}
          user={user}
          searchValue={searchValue}
          themeMode={themeMode}
          onSearchChange={onSearchChange}
          onThemeModeChange={onThemeModeChange}
        />
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
