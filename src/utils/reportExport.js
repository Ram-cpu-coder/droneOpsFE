import { saveAs } from "./saveFile";

const toRows = (report) => [
  ["Report", report.name],
  ["Type", report.type ?? "Snapshot"],
  ["Status", report.status ?? "Ready"],
  ["Owner", report.owner ?? "DroneOps"],
  ["Value", report.value ?? "Snapshot"],
  ["Change", report.change ?? "Stored audit snapshot"]
];

const safeFileName = (name) => (name ?? "droneops-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const exportSingleReport = async (report, format) => {
  const extension = getExtension(format);
  const content = format === "excel" ? toCsv(toRows(report)) : toDocumentText([report]);
  const type = format === "excel" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
  saveAs(new Blob([content], { type }), `${safeFileName(report.name)}.${extension}`);
};

export const exportReportCollection = async (reports, format) => {
  const extension = getExtension(format);
  const content = format === "excel"
    ? toCsv([
        ["Report", "Type", "Status", "Owner", "Value", "Change"],
        ...reports.map((report) => [
          report.name,
          report.type ?? "Snapshot",
          report.status ?? "Ready",
          report.owner ?? "DroneOps",
          report.value ?? "Snapshot",
          report.change ?? "Stored audit snapshot"
        ])
      ])
    : toDocumentText(reports);
  const type = format === "excel" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
  saveAs(new Blob([content], { type }), `droneops-reports.${extension}`);
};

const getExtension = (format) => {
  if (format === "excel") return "csv";
  if (format === "pdf") return "txt";
  if (format === "word") return "txt";
  return "txt";
};

const toCsv = (rows) => rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");

const escapeCsvCell = (value) => {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};

const toDocumentText = (reports) => reports.map((report) => {
  const rows = toRows(report).map(([label, value]) => `${label}: ${value}`).join("\n");
  return `DroneOps Report\n${rows}`;
}).join("\n\n---\n\n");
