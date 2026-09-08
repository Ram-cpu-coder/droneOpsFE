import { saveAs } from "./saveFile";

export const exportMissionRouteCsv = (mission, waypoints = []) => {
  const columns = ["Point", "Latitude", "Longitude", "AGL_m", "Original_F", "Route_Source"];
  const rows = waypoints.map((point, index) => {
    const pointName = String.fromCharCode(65 + index);
    const savedAltitude = Number(point.altitude ?? point.altitudeM ?? point.planned_agl_m);
    const isRouteEndpoint = index === 0 || index === waypoints.length - 1;

    return {
      Point: pointName,
      Latitude: point.latitude ?? "",
      Longitude: point.longitude ?? "",
      AGL_m: Number.isFinite(savedAltitude) ? savedAltitude : isRouteEndpoint ? 0 : 100,
      Original_F: pointName,
      Route_Source: "DRAW"
    };
  });

  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(","))
  ].join("\r\n");

  const fileName = `${safeFileName(mission.missionCode ?? mission.name ?? "mission-route")}-route.csv`;
  saveAs(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), fileName);
};

const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const safeFileName = (value) => String(value)
  .trim()
  .replace(/[^a-z0-9-_]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase() || "mission-route";
