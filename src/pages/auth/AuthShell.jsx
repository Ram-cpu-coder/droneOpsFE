import { lazy, Suspense } from "react";
import { Moon, Monitor, Sun } from "lucide-react";
import DroneLogo from "../../components/common/DroneLogo";

const DroneOpsVantaScene = lazy(
  () => import("../../components/visuals/DroneOpsVantaScene"),
);

const themeOptions = [
  { id: "default", label: "Default", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
];

const AuthShell = ({ children, themeMode, onThemeModeChange }) => {
  return (
    <main className="auth-shell">
      <Suspense fallback={<div className="vanta-scene" aria-hidden="true" />}>
        <DroneOpsVantaScene />
      </Suspense>
      <section className="auth-visual" aria-hidden="true">
        <div className="drone-orbit">
          <div className="drone-model">
            <span className="prop prop-a" />
            <span className="prop prop-b" />
            <span className="prop prop-c" />
            <span className="prop prop-d" />
            <span className="drone-wing wing-left" />
            <span className="drone-wing wing-right" />
            <span className="drone-core" />
            <span className="drone-camera" />
          </div>
        </div>
        <div className="ops-console">
          <div className="console-map">
            <span className="route-line route-one" />
            <span className="route-line route-two" />
            <span className="map-node map-node-a" />
            <span className="map-node map-node-b" />
            <span className="map-node map-node-c" />
            <span className="zone zone-primary" />
            <span className="zone zone-warning" />
          </div>
          <div className="console-side">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div
          className="theme-switcher auth-theme-switcher"
          aria-label="Theme mode"
        >
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
                <Icon size={15} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        <div className="auth-brand">
          <DroneLogo />
          <div>
            <h1>
              Drone <span>Ops</span>
            </h1>
            <p>Intelligent. Autonomous. Connected.</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
};

export default AuthShell;
