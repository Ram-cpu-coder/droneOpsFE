import { saveAs } from "./saveFile";

const safeFileName = (name) => (name ?? "drone-profile").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const exportDroneTelemetrySnapshot = async ({ drone, telemetryRows, format }) => {
  if (format === "excel") return exportExcel(drone, telemetryRows);
  if (format === "pdf") return exportPdf(drone, telemetryRows);
  if (format === "word") return exportWord(drone, telemetryRows);
  if (format === "json") return exportJson(drone, telemetryRows);
  throw new Error("Unsupported export format");
};

const exportExcel = async (drone, rows) => {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(toSheetRows(drone, rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Telemetry");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${getBaseFileName(drone)}-telemetry.xlsx`);
};

const exportPdf = async (drone, rows) => {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable")
  ]);
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(`${drone.droneCode ?? drone.id ?? "Drone"} telemetry`, 14, 18);
  doc.setFontSize(11);
  doc.text(`Model: ${formatValue(drone.model)}`, 14, 28);
  doc.text(`Status: ${formatValue(drone.status)}`, 14, 35);
  autoTableModule.default(doc, {
    startY: 44,
    head: [["Field", "Value"]],
    body: rows.map((row) => [row.label, row.value]),
    styles: { fontSize: 9, cellPadding: 3 }
  });
  doc.save(`${getBaseFileName(drone)}-telemetry.pdf`);
};

const exportWord = async (drone, rows) => {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: `${drone.droneCode ?? drone.id ?? "Drone"} telemetry`, bold: true, size: 32 })] }),
          new Paragraph({ children: [new TextRun(`Model: ${formatValue(drone.model)}`)] }),
          new Paragraph({ children: [new TextRun(`Status: ${formatValue(drone.status)}`)] }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Field")] }),
                  new TableCell({ children: [new Paragraph("Value")] })
                ]
              }),
              ...rows.map((row) => (
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(row.label)] }),
                    new TableCell({ children: [new Paragraph(row.value)] })
                  ]
                })
              ))
            ]
          })
        ]
      }
    ]
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${getBaseFileName(drone)}-telemetry.docx`);
};

const exportJson = async (drone, rows) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    drone: {
      id: drone.id ?? null,
      uuid: drone.uuid ?? drone.idRaw ?? null,
      droneCode: drone.droneCode ?? drone.id ?? null,
      model: drone.model ?? null,
      manufacturer: drone.manufacturer ?? null,
      status: drone.status ?? null,
      telemetryProvider: drone.telemetryProvider ?? null,
      externalDeviceId: drone.externalDeviceId ?? null
    },
    telemetry: Object.fromEntries(rows.map((row) => [toJsonKey(row.label), row.value]))
  };
  saveAs(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), `${getBaseFileName(drone)}-telemetry.json`);
};

const toSheetRows = (drone, rows) => [
  { field: "Drone", value: drone.droneCode ?? drone.id ?? "Drone" },
  { field: "Model", value: formatValue(drone.model) },
  { field: "Manufacturer", value: formatValue(drone.manufacturer) },
  { field: "Status", value: formatValue(drone.status) },
  { field: "Telemetry Provider", value: formatValue(drone.telemetryProvider) },
  { field: "Vendor Device ID", value: formatValue(drone.externalDeviceId) },
  ...rows.map((row) => ({ field: row.label, value: row.value }))
];

const getBaseFileName = (drone) => safeFileName(drone.droneCode ?? drone.id ?? "drone-profile");

const toJsonKey = (label) => label.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, letter) => letter.toUpperCase());

const formatValue = (value) => value || "Not provided";
