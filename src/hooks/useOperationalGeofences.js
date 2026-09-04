import { useEffect, useState } from "react";
import { droneOpsApi } from "../services/droneOpsApi";
import { getRealtimeSocket } from "../services/realtimeClient";

export function useOperationalGeofences(enabled = true) {
  const [zones, setZones] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = async () => {
      try {
        const rows = await droneOpsApi.geofences.list();
        if (active) { setZones(rows); setError(""); }
      } catch {
        if (active) setError("Geofence updates unavailable; displayed boundaries may be out of date.");
      }
    };
    refresh();
    const socket = getRealtimeSocket();
    socket.on("geofences:changed", refresh);
    socket.on("connect", refresh);
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      socket.off("geofences:changed", refresh);
      socket.off("connect", refresh);
    };
  }, [enabled]);
  return { zones, error };
}
