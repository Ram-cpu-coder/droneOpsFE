import { useEffect, useRef } from "react";

const DroneOpsVantaScene = () => {
  const sceneRef = useRef(null);
  const vantaRef = useRef(null);

  useEffect(() => {
    if (!sceneRef.current || vantaRef.current) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 900px)").matches;
    const hasEnoughHardware = window.navigator.hardwareConcurrency ? window.navigator.hardwareConcurrency >= 4 : true;

    if (prefersReducedMotion || isSmallScreen || !hasEnoughHardware) return;

    let cancelled = false;
    let idleHandle;
    let timeoutHandle;

    const loadVanta = async () => {
      const THREE = await import("three");
      const module = await import("vanta/dist/vanta.net.min");
      const NET = module.default;

      if (cancelled || !sceneRef.current) return;

      vantaRef.current = NET({
        el: sceneRef.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 1,
        color: 0x4d8dff,
        backgroundColor: 0x06101d,
        points: 12,
        maxDistance: 24,
        spacing: 18,
        showDots: true
      });
    };

    if ("requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(loadVanta, { timeout: 2200 });
    } else {
      timeoutHandle = window.setTimeout(loadVanta, 900);
    }

    return () => {
      cancelled = true;
      if (idleHandle) window.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      try {
        vantaRef.current?.destroy();
      } catch {
        // Vanta cleanup can race React unmounts during auth transitions.
      }
      vantaRef.current = null;
    };
  }, []);

  return (
    <div className="vanta-scene" ref={sceneRef} aria-hidden="true">
      <div className="radar-ring ring-one" />
      <div className="radar-ring ring-two" />
      <div className="flight-node node-a" />
      <div className="flight-node node-b" />
      <div className="flight-node node-c" />
    </div>
  );
};

export default DroneOpsVantaScene;
