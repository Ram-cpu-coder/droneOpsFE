import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function MapWorkspace({ title, details, children, overlayControls = false }) {
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleChange = () => {
      const active = document.fullscreenElement === rootRef.current;
      setExpanded(active);
      if (!active) buttonRef.current?.focus();
    };
    // Capture Escape so parent profile dialogs do not close with the map.
    const handleKey = (event) => {
      if (event.key === "Escape" && document.fullscreenElement === rootRef.current) {
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("fullscreenchange", handleChange);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, []);

  const toggle = async () => {
    setError("");
    try {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
      else if (rootRef.current.requestFullscreen) await rootRef.current.requestFullscreen();
      else setError("Fullscreen is not supported by this browser.");
    } catch {
      setError("Could not open fullscreen. Please try again.");
    }
  };

  const fullscreenButton = (
    <button ref={buttonRef} type="button" className="icon-button" onClick={toggle}
      title={expanded ? "Exit fullscreen" : "Open fullscreen map and details"}
      aria-label={expanded ? "Exit fullscreen" : `Expand ${title}`} aria-expanded={expanded}>
      {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
    </button>
  );
  const customToolbar = typeof children === "function";
  return (
    <section ref={rootRef} className={`map-workspace${expanded ? " expanded" : ""}${overlayControls ? " overlay-controls" : ""}`} aria-label={title}>
      {!customToolbar && <header className="map-workspace-header">
        {(!overlayControls || expanded) && <h3>{title}</h3>}
        {fullscreenButton}
      </header>}
      {error && <div role="alert">{error}</div>}
      <div className="map-workspace-layout">
        <div className="map-workspace-canvas">{customToolbar ? children(fullscreenButton) : children}</div>
        {expanded && <aside className="map-workspace-details" aria-label={`${title} details`}>{details}</aside>}
      </div>
    </section>
  );
}

export function MapDataDetails({ title, value }) {
  if (value == null) return null;
  if (typeof value !== "object") return <div className="map-data-value"><dt>{title}</dt><dd>{String(value)}</dd></div>;
  if (Array.isArray(value)) {
    return (
      <details className="map-data-group" open>
        <summary>{title}</summary>
        <ul className="map-data-list">
          {value.filter((item) => item != null).map((item, index) => (
            <li key={index}>
              {typeof item === "object"
                ? <MapDataDetails title={item.label || item.name || "Details"} value={item} />
                : String(item)}
            </li>
          ))}
        </ul>
      </details>
    );
  }
  const heading = typeof value.label === "string" && value.label.trim() ? value.label : title;
  return (
    <details className="map-data-group" open>
      <summary>{heading}</summary>
      <dl>{Object.entries(value).filter(([key, item]) => item != null && key !== "label").map(([key, item]) => (
        <MapDataDetails key={key} title={key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")} value={item} />
      ))}</dl>
    </details>
  );
}
