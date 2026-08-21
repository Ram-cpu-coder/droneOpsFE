import { saveAs } from "./saveFile";

const normalizeSnapshot = (report) => {
  if (report?.dataSnapshot && typeof report.dataSnapshot === "object") {
    return report.dataSnapshot;
  }

  return {
    summary: {
      value: report?.value ?? "Snapshot",
      change: report?.change ?? "No comparison available",
      status: report?.status ?? "Ready",
      owner: report?.owner ?? "DroneOps"
    }
  };
};

const flattenObject = (value, prefix = "") => {
  if (value == null) {
    return prefix ? [{ field: prefix, value: "" }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenObject(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }

  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, nestedValue]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return flattenObject(nestedValue, nextPrefix);
    });
  }

  return [{ field: prefix, value: String(value) }];
};

const toRows = (report) => {
  const snapshot = normalizeSnapshot(report);

  return [
    { field: "Report", value: report.name },
    { field: "Type", value: report.type ?? "Snapshot" },
    { field: "Status", value: report.status ?? "Ready" },
    { field: "Category", value: report.owner ?? "DroneOps" },
    { field: "Date Scope", value: formatSnapshotScope(snapshot.scope) },
    { field: "Record Limit", value: snapshot.scope?.limit ?? "No limit stored" },
    { field: "Value", value: report.value ?? "Snapshot" },
    { field: "Change", value: report.change ?? "Stored audit snapshot" },
    ...flattenObject(snapshot, "snapshot")
  ];
};

const safeFileName = (name) => (name ?? "droneops-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const exportSingleReport = async (report, format) => {
  if (format === "excel") return exportReportExcel(report);
  if (format === "pdf") return exportReportPdf(report);
  if (format === "word") return exportReportWord(report);
  if (format === "json") return exportReportJson(report);
};

export const exportReportCollection = async (reports, format) => {
  if (format === "excel") return exportCollectionExcel(reports);
  if (format === "pdf") return exportCollectionPdf(reports);
  if (format === "word") return exportCollectionWord(reports);
  if (format === "json") return exportCollectionJson(reports);
};

const loadSpreadsheetExport = async () => import("xlsx");

const loadPdfExport = async () => {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable")
  ]);

  return { jsPDF, autoTable: autoTableModule.default };
};

const loadWordExport = async () => import("docx");

const exportReportExcel = async (report) => {
  const XLSX = await loadSpreadsheetExport();
  const rows = toRows(report);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFileName(report.name)}.xlsx`);
};

const exportCollectionExcel = async (reports) => {
  const XLSX = await loadSpreadsheetExport();
  const rows = reports.map((report) => ({
    Report: report.name,
    Type: report.type ?? "Snapshot",
    Status: report.status ?? "Ready",
    Category: report.owner ?? "DroneOps",
    Value: report.value ?? "Snapshot",
    Change: report.change ?? "Stored audit snapshot"
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "droneops-reports.xlsx");
};

const exportReportPdf = async (report) => {
  const { jsPDF, autoTable } = await loadPdfExport();
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(report.name, 14, 18);
  doc.setFontSize(11);
  doc.text(`Type: ${report.type ?? "Snapshot"}`, 14, 28);
  doc.text(`Status: ${report.status ?? "Ready"}`, 14, 35);
  doc.text(`Category: ${report.owner ?? "DroneOps"}`, 14, 42);

  autoTable(doc, {
    startY: 50,
    head: [["Field", "Value"]],
    body: toRows(report).map((row) => [row.field, row.value]),
    styles: { fontSize: 9, cellPadding: 3 }
  });

  doc.save(`${safeFileName(report.name)}.pdf`);
};

const exportCollectionPdf = async (reports) => {
  const { jsPDF, autoTable } = await loadPdfExport();
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("DroneOps Reports", 14, 18);

  autoTable(doc, {
    startY: 28,
    head: [["Report", "Type", "Status", "Category", "Value", "Change"]],
    body: reports.map((report) => [
      report.name,
      report.type ?? "Snapshot",
      report.status ?? "Ready",
      report.owner ?? "DroneOps",
      report.value ?? "Snapshot",
      report.change ?? "Stored audit snapshot"
    ]),
    styles: { fontSize: 9, cellPadding: 3 }
  });

  doc.save("droneops-reports.pdf");
};

const exportReportWord = async (report) => {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await loadWordExport();
  const rows = toRows(report);
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: report.name, bold: true, size: 32 })] }),
          new Paragraph({ children: [new TextRun(`Type: ${report.type ?? "Snapshot"}`)] }),
          new Paragraph({ children: [new TextRun(`Status: ${report.status ?? "Ready"}`)] }),
          new Paragraph({ children: [new TextRun(`Category: ${report.owner ?? "DroneOps"}`)] }),
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
                    new TableCell({ children: [new Paragraph(row.field)] }),
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
  saveAs(blob, `${safeFileName(report.name)}.docx`);
};

const exportCollectionWord = async (reports) => {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await loadWordExport();
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "DroneOps Reports", bold: true, size: 32 })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ["Report", "Type", "Status", "Category", "Value", "Change"].map((cell) => (
                  new TableCell({ children: [new Paragraph(cell)] })
                ))
              }),
              ...reports.map((report) => (
                new TableRow({
                  children: [
                    report.name,
                    report.type ?? "Snapshot",
                    report.status ?? "Ready",
                    report.owner ?? "DroneOps",
                    report.value ?? "Snapshot",
                    report.change ?? "Stored audit snapshot"
                  ].map((cell) => new TableCell({ children: [new Paragraph(String(cell))] }))
                })
              ))
            ]
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "droneops-reports.docx");
};

const exportReportJson = async (report) => {
  const payload = toJsonReport(report);
  saveJson(payload, `${safeFileName(report.name)}.json`);
};

const exportCollectionJson = async (reports) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    totalReports: reports.length,
    exportScope: "shareable_summary",
    reports: reports.map(toShareableJsonReport)
  };
  saveJson(payload, "droneops-reports.json");
};

const toJsonReport = (report) => ({
  id: report.uuid ?? report.id ?? null,
  name: report.name ?? "DroneOps Report",
  type: report.type ?? "Snapshot",
  status: report.status ?? "Ready",
  category: report.owner ?? "DroneOps",
  value: report.value ?? "Snapshot",
  change: report.change ?? "Stored audit snapshot",
  exportScope: normalizeSnapshot(report).scope ?? null,
  createdAt: report.createdAt ?? null,
  updatedAt: report.updatedAt ?? null,
  fileUrl: report.fileUrl ?? null,
  dataSnapshot: normalizeSnapshot(report)
});

const toShareableJsonReport = (report) => ({
  name: report.name ?? "DroneOps Report",
  type: report.type ?? "Snapshot",
  status: report.status ?? "Ready",
  category: report.type ?? report.owner ?? "DroneOps",
  value: report.value ?? "Snapshot",
  change: report.change ?? "Stored audit snapshot",
  createdAt: report.createdAt ?? null
});

const saveJson = (payload, fileName) => {
  const json = JSON.stringify(payload, null, 2);
  saveAs(new Blob([json], { type: "application/json;charset=utf-8" }), fileName);
};

const formatSnapshotScope = (scope) => {
  if (!scope) return "All available dates";
  const from = scope.dateFrom ? new Date(scope.dateFrom).toLocaleDateString("en-AU") : null;
  const to = scope.dateTo ? new Date(scope.dateTo).toLocaleDateString("en-AU") : null;
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;
  return "All available dates";
};
