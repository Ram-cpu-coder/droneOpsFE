import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Download, FileSpreadsheet, FileText, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/ActionButton";
import CopyableId from "../../components/common/CopyableId";
import DataTable from "../../components/common/DataTable";
import MetricCard from "../../components/common/MetricCard";
import SectionHeader from "../../components/common/SectionHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { hasClientPermission } from "../../features/auth/accessControl";
import { useApiResource } from "../../hooks/useApiResource";
import { useFleetSearch } from "../../hooks/useFleetSearch";
import { droneOpsApi } from "../../services/droneOpsApi";
import ReportProfileDialog from "./components/ReportProfileDialog";
import { exportReportCollection } from "../../utils/reportExport";

const exportableStatuses = new Set(["READY", "GENERATED"]);

const Reports = ({ user, searchValue = "" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const actionsRef = useRef(null);
  const generateAnchorRef = useRef(null);
  const exportAnchorRef = useRef(null);
  const generateMenuRef = useRef(null);
  const exportMenuRef = useRef(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [toast, setToast] = useState(null);
  const loadReports = useCallback(() => droneOpsApi.reports.list(), []);
  const { data: reportRecords, error, isLoading, isFallback, refresh, setData: setReportRecords } = useApiResource(loadReports, []);
  const normalizedReports = useMemo(() => reportRecords.map((report, index) => normalizeReport(report, index)), [reportRecords]);
  const filteredReports = useFleetSearch(normalizedReports, searchValue);
  const metricReports = isFallback ? [] : normalizedReports;
  const routeReportId = useMemo(() => getDetailId(location.pathname, "/reports"), [location.pathname]);
  const canGenerateReports = hasClientPermission(user, "reports:manage");
  const canDeleteReports = hasClientPermission(user, "*");
  const canManageReportStatus = hasClientPermission(user, "*") || hasClientPermission(user, "reports:manage");
  const exportableReports = useMemo(() => normalizedReports.filter(isReportExportable), [normalizedReports]);
  const readyReports = exportableReports.length;
  const reportTypeCount = new Set(metricReports.map((report) => report.type).filter(Boolean)).size;
  const generateOptions = [
    { value: "FLIGHT_ACTIVITY", label: "Flight Activity" },
    { value: "INCIDENT", label: "Incident" },
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "COMPLIANCE", label: "Compliance" },
    { value: "UTILIZATION", label: "Utilization" }
  ];

  const exportReadyReports = async (format) => {
    if (!exportableReports.length) {
      setIsExportOpen(false);
      setToast({
        title: "No ready reports",
        message: "Only reports marked Ready can be exported."
      });
      window.setTimeout(() => setToast(null), 5000);
      return;
    }

    await exportReportCollection(exportableReports, format);
    setIsExportOpen(false);
  };

  useEffect(() => {
    const handlePointerDown = (event) => {
      const isInsideActions = actionsRef.current?.contains(event.target);
      const isInsideGenerateMenu = generateMenuRef.current?.contains(event.target);
      const isInsideExportMenu = exportMenuRef.current?.contains(event.target);
      if (!isInsideActions && !isInsideGenerateMenu && !isInsideExportMenu) {
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
      key: "systemId",
      label: "ID",
      render: (report) => <CopyableId value={report.systemId} />
    },
    { key: "serialNumber", label: "Serial Number" },
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
    { key: "status", label: "Status", filterable: true, render: (report) => <StatusBadge>{report.status}</StatusBadge> },
    { key: "owner", label: "Category", filterable: true }
  ];

  return (
    <section className="page-stack">
      {selectedReport && (
        <ReportProfileDialog
          report={selectedReport}
          canDelete={canDeleteReports}
          canManageStatus={canManageReportStatus}
          onStatusChange={async (report, status) => {
            const reportId = getReportIdentity(report);
            const updatedReport = await droneOpsApi.reports.updateStatus(reportId, status);
            setReportRecords((current) => current.map((item) => (
              getReportIdentity(item) === reportId ? updatedReport : item
            )));
            setSelectedReport(normalizeReport(updatedReport));
            setToast({
              title: "Report status updated",
              message: `${selectedReport.name} is now ${formatReportStatus(status)}.`
            });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onDeleted={() => {
            refresh();
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
        <MetricCard label="Reports" value={isLoading ? "..." : metricReports.length} delta={isFallback ? "Backend unavailable" : "Live report records"} icon={BarChart3} tone="blue" />
        <MetricCard label="Ready Reports" value={readyReports} delta="Ready to view or export" icon={FileText} tone="green" />
        <MetricCard label="Report Types" value={reportTypeCount} delta="Unique report categories" icon={Download} tone="purple" />
      </div>
      {error && <div className="auth-alert">Report records could not be loaded. {error}</div>}
      <div className="panel">
        <SectionHeader
          title="Operational Reports"
          description="Stored operational snapshots generated from DroneOps data and ready for export."
          action={(
            <div className="section-actions report-actions" ref={actionsRef}>
              {canGenerateReports && (
                <div className="dashboard-filter-wrap report-menu-wrap" ref={generateAnchorRef}>
                  <ActionButton
                    icon={BarChart3}
                    onClick={() => {
                      setIsExportOpen(false);
                      setIsGenerateOpen((current) => !current);
                    }}
                  >
                    Generate Report
                  </ActionButton>
                  {isGenerateOpen && createPortal(
                    <div
                      className="dashboard-filter-menu export-menu report-generate-menu floating-report-menu"
                      ref={generateMenuRef}
                      role="menu"
                      aria-label="Generate reports"
                      style={getFloatingMenuStyle(generateAnchorRef.current)}
                    >
                      {generateOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isGeneratingReport}
                          onClick={async () => {
                            setIsGeneratingReport(true);
                            try {
                              const report = await droneOpsApi.reports.generate({ type: option.value });
                              window.dispatchEvent(new Event("droneops:activity-changed"));
                              setReportRecords((current) => [report, ...current.filter((item) => item.id !== report.id)]);
                              await refresh();
                              navigate(`/reports/${encodeURIComponent(report.id)}`);
                              setIsGenerateOpen(false);
                              setToast({
                                title: "Report generated",
                                message: `${option.label} report was created successfully.`
                              });
                              window.setTimeout(() => setToast(null), 4500);
                            } catch {
                              setToast({
                                title: "Report generation failed",
                                message: "The report could not be saved to the backend, so no notification was created."
                              });
                              window.setTimeout(() => setToast(null), 5000);
                            } finally {
                              setIsGeneratingReport(false);
                            }
                          }}
                        >
                          <span>{option.label}</span>
                          <BarChart3 size={15} />
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
                </div>
              )}
              <div className="dashboard-filter-wrap report-menu-wrap" ref={exportAnchorRef}>
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
                {isExportOpen && createPortal(
                  <div
                    className="dashboard-filter-menu export-menu report-export-menu floating-report-menu"
                    ref={exportMenuRef}
                    role="menu"
                    aria-label="Export reports"
                    style={getFloatingMenuStyle(exportAnchorRef.current)}
                  >
                    <button type="button" onClick={async () => {
                      try {
                        await exportReadyReports("excel");
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
                        await exportReadyReports("pdf");
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
                        await exportReadyReports("word");
                      } catch (requestError) {
                        setToast({ title: "Word export failed", message: requestError.message });
                        window.setTimeout(() => setToast(null), 5000);
                      }
                    }}>
                      <span>Export Word</span>
                      <Download size={15} />
                    </button>
                    <button type="button" onClick={async () => {
                      try {
                        await exportReadyReports("json");
                      } catch (requestError) {
                        setToast({ title: "JSON export failed", message: requestError.message });
                        window.setTimeout(() => setToast(null), 5000);
                      }
                    }}>
                      <span>Export JSON</span>
                      <FileText size={15} />
                    </button>
                  </div>,
                  document.body
                )}
              </div>
            </div>
          )}
        />
        <DataTable
          columns={columns}
          rows={filteredReports}
          getRowKey={(report) => report.uuid ?? report.id}
          onRowClick={(report) => navigate(`/reports/${encodeURIComponent(report.uuid ?? report.id)}`)}
          emptyMessage={isLoading ? "Loading reports..." : "No reports generated yet."}
        />
      </div>
    </section>
  );
};

const normalizeReport = (report, index = 0) => {
  const name = report.title ?? report.name;

  return {
    ...report,
    uuid: report.id ?? toReportRouteId(name),
    systemId: report.id ?? toReportRouteId(name),
    serialNumber: report.reportCode ?? `RPT-${String(index + 1).padStart(4, "0")}`,
    name,
    type: report.type,
    value: report.value ?? report.dataSnapshot?.summary?.value ?? report.type ?? "Snapshot",
    change: report.change ?? report.dataSnapshot?.summary?.change ?? "Stored audit snapshot",
    status: report.status ?? report.dataSnapshot?.summary?.status ?? "REVIEW",
    owner: report.owner ?? report.generatedBy?.name ?? report.dataSnapshot?.summary?.owner ?? "DroneOps"
  };
};

const toReportRouteId = (name) => (
  name ?? "report"
).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const getDetailId = (pathname, basePath) => {
  if (pathname === basePath || !pathname.startsWith(`${basePath}/`)) return null;
  return decodeURIComponent(pathname.slice(basePath.length + 1).split("/")[0] ?? "");
};

const isReportExportable = (report) => exportableStatuses.has(String(report.status ?? "").toUpperCase());

const getReportIdentity = (report) => report.id ?? report.uuid ?? toReportRouteId(report.title ?? report.name);

const formatReportStatus = (status = "") => status.toString().toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const getFloatingMenuStyle = (anchor) => {
  if (!anchor) return undefined;

  const rect = anchor.getBoundingClientRect();
  const menuWidth = 220;
  const viewportPadding = 12;
  const left = Math.min(
    Math.max(viewportPadding, rect.right - menuWidth),
    window.innerWidth - menuWidth - viewportPadding
  );

  return {
    position: "fixed",
    top: `${rect.bottom + 8}px`,
    left: `${left}px`,
    right: "auto",
    width: `${menuWidth}px`,
    zIndex: 10080
  };
};

export default Reports;
