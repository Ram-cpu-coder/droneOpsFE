import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Download, FileSpreadsheet, FileText, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/ActionButton";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { reports } from "../../data/droneOpsData";
import { hasClientPermission } from "../../features/auth/accessControl";
import { useFleetSearch } from "../../hooks/useFleetSearch";
import ReportProfileDialog from "./components/ReportProfileDialog";
import { exportReportCollection } from "../../utils/reportExport";

const Reports = ({ user, searchValue = "" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const actionsRef = useRef(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportRecords, setReportRecords] = useState(reports);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const normalizedReports = useMemo(() => reportRecords.map(normalizeReport), [reportRecords]);
  const filteredReports = useFleetSearch(normalizedReports, searchValue);
  const metricReports = normalizedReports;
  const routeReportId = useMemo(() => getDetailId(location.pathname, "/reports"), [location.pathname]);
  const canGenerateReports = hasClientPermission(user, "reports:read");
  const canDeleteReports = hasClientPermission(user, "*");
  const readyReports = metricReports.filter((report) => ["Ready", "READY", "GENERATED", "Generated"].includes(report.status)).length;
  const reportTypeCount = new Set(metricReports.map((report) => report.type).filter(Boolean)).size;
  const generateOptions = [
    { value: "FLIGHT_ACTIVITY", label: "Flight Activity" },
    { value: "INCIDENT", label: "Incident" },
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "COMPLIANCE", label: "Compliance" },
    { value: "UTILIZATION", label: "Utilization" }
  ];

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!actionsRef.current?.contains(event.target)) {
        setIsGenerateOpen(false);
        setIsExportOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!routeReportId) {
      setSelectedReport(null);
      return;
    }

    const matchedReport = normalizedReports.find((report) => String(report.uuid ?? report.id) === routeReportId);
    setSelectedReport(matchedReport ?? null);
  }, [normalizedReports, routeReportId]);

  const columns = [
    {
      key: "name",
      label: "Report",
      render: (report) => (
        <button className="link-button strong-link" type="button" onClick={() => navigate(`/reports/${encodeURIComponent(report.uuid ?? report.id)}`)}>
          <span>{report.name}</span>
        </button>
      )
    },
    { key: "value", label: "Current Value" },
    { key: "change", label: "Change" },
    { key: "status", label: "Status", render: (report) => <StatusBadge>{report.status}</StatusBadge> },
    { key: "owner", label: "Owner" }
  ];

  return (
    <section className="page-stack">
      {selectedReport && (
        <ReportProfileDialog
          report={selectedReport}
          canDelete={canDeleteReports}
          onDeleted={() => {
            setReportRecords((current) => current.filter((report) => report.id !== selectedReport.id && report.name !== selectedReport.name));
            navigate("/reports");
            setToast({ title: "Report deleted", message: `${selectedReport.name} was removed.` });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onClose={() => navigate("/reports")}
        />
      )}
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className="toast-card success">
            <CheckCircle2 size={20} />
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            <button className="toast-close" type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      <div className="stats-grid three">
        <MetricCard label="Reports" value={metricReports.length} delta="Dummy report records" icon={BarChart3} tone="blue" />
        <MetricCard label="Ready Reports" value={readyReports} delta="Ready to view or export" icon={FileText} tone="green" />
        <MetricCard label="Report Types" value={reportTypeCount} delta="Unique report categories" icon={Download} tone="purple" />
      </div>
      <div className="panel">
        <SectionHeader
          title="Operational Reports"
          description="Stored operational snapshots generated from DroneOps data and ready for export."
          action={(
            <div className="section-actions report-actions" ref={actionsRef}>
              {canGenerateReports && (
                <div className="dashboard-filter-wrap report-menu-wrap">
                  <ActionButton
                    icon={BarChart3}
                    onClick={() => {
                      setIsExportOpen(false);
                      setIsGenerateOpen((current) => !current);
                    }}
                  >
                    Generate Report
                  </ActionButton>
                  {isGenerateOpen && (
                    <div className="dashboard-filter-menu export-menu report-generate-menu" role="menu" aria-label="Generate reports">
                      {generateOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            const report = buildGeneratedReport(option, reportRecords.length);
                            setReportRecords((current) => [report, ...current]);
                            navigate(`/reports/${encodeURIComponent(report.id)}`);
                            setIsGenerateOpen(false);
                            setToast({
                              title: "Report generated",
                              message: `${option.label} report was created from local dummy data.`
                            });
                            window.setTimeout(() => setToast(null), 4500);
                          }}
                        >
                          <span>{option.label}</span>
                          <BarChart3 size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="dashboard-filter-wrap report-menu-wrap">
                <ActionButton
                  icon={Download}
                  variant="primary"
                  onClick={() => {
                    setIsGenerateOpen(false);
                    setIsExportOpen((current) => !current);
                  }}
                >
                  Export
                </ActionButton>
                {isExportOpen && (
                  <div className="dashboard-filter-menu export-menu report-export-menu" role="menu" aria-label="Export reports">
                    <button type="button" onClick={async () => {
                      try {
                        await exportReportCollection(normalizedReports, "excel");
                        setIsExportOpen(false);
                      } catch (requestError) {
                        setToast({ title: "Excel export failed", message: requestError.message });
                        window.setTimeout(() => setToast(null), 5000);
                      }
                    }}>
                      <span>Export Excel</span>
                      <FileSpreadsheet size={15} />
                    </button>
                    <button type="button" onClick={async () => {
                      try {
                        await exportReportCollection(normalizedReports, "pdf");
                        setIsExportOpen(false);
                      } catch (requestError) {
                        setToast({ title: "PDF export failed", message: requestError.message });
                        window.setTimeout(() => setToast(null), 5000);
                      }
                    }}>
                      <span>Export PDF</span>
                      <FileText size={15} />
                    </button>
                    <button type="button" onClick={async () => {
                      try {
                        await exportReportCollection(normalizedReports, "word");
                        setIsExportOpen(false);
                      } catch (requestError) {
                        setToast({ title: "Word export failed", message: requestError.message });
                        window.setTimeout(() => setToast(null), 5000);
                      }
                    }}>
                      <span>Export Word</span>
                      <Download size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        />
        <DataTable
          columns={columns}
          rows={filteredReports}
          getRowKey={(report) => report.name}
          emptyMessage="No reports generated yet."
        />
      </div>
    </section>
  );
};

const normalizeReport = (report) => ({
  ...report,
  uuid: report.id,
  name: report.title ?? report.name,
  type: report.type,
  value: report.value ?? report.dataSnapshot?.summary?.value ?? report.type ?? "Snapshot",
  change: report.change ?? report.dataSnapshot?.summary?.change ?? "Stored audit snapshot",
  status: report.status ?? "Ready",
  owner: report.owner ?? report.generatedBy?.name ?? report.dataSnapshot?.summary?.owner ?? "DroneOps"
});

const buildGeneratedReport = (option, currentCount) => {
  const createdAt = new Date().toISOString();
  const reportNumber = String(currentCount + 1).padStart(3, "0");

  return {
    id: `REP-${reportNumber}`,
    name: `${option.label} Report`,
    title: `${option.label} Report`,
    type: option.value,
    value: "Generated",
    change: "Created from dummy data",
    status: "Ready",
    owner: "Operations",
    createdAt,
    dataSnapshot: {
      summary: {
        value: "Generated",
        change: "Created from dummy data",
        status: "Ready",
        owner: "Operations"
      }
    }
  };
};

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

export default Reports;
