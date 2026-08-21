import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarDays, CheckCircle2, Download, FileSpreadsheet, FileText, ListFilter, X } from "lucide-react";
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
  const [generateDraft, setGenerateDraft] = useState({
    type: "FLIGHT_ACTIVITY",
    dateFrom: "",
    dateTo: "",
    limit: 50
  });
  const [toast, setToast] = useState(null);
  const loadReports = useCallback(() => droneOpsApi.reports.list(), []);
  const { data: reportRecords, error, isLoading, isFallback, refresh, setData: setReportRecords } = useApiResource(loadReports, []);
  const normalizedReports = useMemo(() => reportRecords.map((report, index) => normalizeReport(report, index)), [reportRecords]);
  const filteredReports = useFleetSearch(normalizedReports, searchValue);
  const metricReports = isFallback ? [] : normalizedReports;
  const routeReportId = useMemo(() => getDetailId(location.pathname, "/reports"), [location.pathname]);
  const profileReturnPath = location.state?.returnTo === "/dashboard" ? "/dashboard" : "/reports";
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
  const selectedGenerateOption = generateOptions.find((option) => option.value === generateDraft.type) ?? generateOptions[0];

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

  const handleGenerateReport = async (event) => {
    event.preventDefault();

    if (generateDraft.dateFrom && generateDraft.dateTo && generateDraft.dateFrom > generateDraft.dateTo) {
      setToast({
        title: "Invalid report scope",
        message: "Start date cannot be after end date."
      });
      window.setTimeout(() => setToast(null), 5000);
      return;
    }

    setIsGeneratingReport(true);
    try {
      const payload = {
        type: generateDraft.type,
        limit: Number(generateDraft.limit) || 50
      };
      if (generateDraft.dateFrom) payload.dateFrom = generateDraft.dateFrom;
      if (generateDraft.dateTo) payload.dateTo = generateDraft.dateTo;

      const report = await droneOpsApi.reports.generate(payload);
      window.dispatchEvent(new Event("droneops:activity-changed"));
      setReportRecords((current) => [report, ...current.filter((item) => item.id !== report.id)]);
      await refresh();
      navigate(`/reports/${encodeURIComponent(report.id)}`);
      setIsGenerateOpen(false);
      setToast({
        title: "Report generated",
        message: `${selectedGenerateOption.label} report was created with the selected export scope.`
      });
      window.setTimeout(() => setToast(null), 4500);
    } catch (requestError) {
      setToast({
        title: "Report generation failed",
        message: requestError.message || "The scoped report could not be saved to the backend."
      });
      window.setTimeout(() => setToast(null), 5000);
    } finally {
      setIsGeneratingReport(false);
    }
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
    { key: "category", label: "Category", filterable: true }
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
            navigate(profileReturnPath);
            setToast({ title: "Report deleted", message: `${selectedReport.name} was removed.` });
            window.setTimeout(() => setToast(null), 4500);
          }}
          onClose={() => navigate(profileReturnPath)}
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
                      setIsGenerateOpen(true);
                    }}
                  >
                    Generate Report
                  </ActionButton>
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
      {isGenerateOpen && createPortal(
        <div className="modal-backdrop report-scope-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsGenerateOpen(false)}>
          <form className="modal-dialog report-scope-dialog" ref={generateMenuRef} role="dialog" aria-modal="true" aria-labelledby="report-scope-title" onSubmit={handleGenerateReport}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Report Builder</p>
                <h2 id="report-scope-title">Generate Scoped Report</h2>
                <p>Select the category and exact data range to include in this report export.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsGenerateOpen(false)} aria-label="Close report builder">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body report-scope-body">
              <section className="profile-section report-scope-section">
                <div className="profile-section-title">
                  <ListFilter size={18} />
                  <h3>Report Category</h3>
                </div>
                <div className="report-type-grid" role="radiogroup" aria-label="Report category">
                  {generateOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`report-type-card ${generateDraft.type === option.value ? "selected" : ""}`}
                      type="button"
                      onClick={() => setGenerateDraft((current) => ({ ...current, type: option.value }))}
                    >
                      <strong>{option.label}</strong>
                      <span>{getReportTypeHelp(option.value)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="profile-section report-scope-section">
                <div className="profile-section-title">
                  <CalendarDays size={18} />
                  <h3>Data Scope</h3>
                </div>
                <div className="form-grid report-scope-grid">
                  <label className="field">
                    <span>From date</span>
                    <input
                      type="date"
                      value={generateDraft.dateFrom}
                      onChange={(event) => setGenerateDraft((current) => ({ ...current, dateFrom: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>To date</span>
                    <input
                      type="date"
                      value={generateDraft.dateTo}
                      onChange={(event) => setGenerateDraft((current) => ({ ...current, dateTo: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Maximum records</span>
                    <input
                      type="number"
                      min="1"
                      max="250"
                      value={generateDraft.limit}
                      onChange={(event) => setGenerateDraft((current) => ({ ...current, limit: event.target.value }))}
                    />
                  </label>
                  <div className="report-scope-preview" aria-live="polite">
                    <span>Export scope</span>
                    <strong>{selectedGenerateOption.label}</strong>
                    <p>{buildScopePreview(generateDraft)}</p>
                  </div>
                </div>
              </section>
            </div>
            <div className="modal-footer">
              <ActionButton type="button" onClick={() => setIsGenerateOpen(false)}>Cancel</ActionButton>
              <ActionButton icon={BarChart3} variant="primary" type="submit" disabled={isGeneratingReport}>
                {isGeneratingReport ? "Generating..." : "Generate Report"}
              </ActionButton>
            </div>
          </form>
        </div>,
        document.body
      )}
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
    owner: report.owner ?? report.generatedBy?.name ?? report.dataSnapshot?.summary?.owner ?? "DroneOps",
    category: formatReportType(report.type),
    scope: report.dataSnapshot?.scope
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

const formatReportType = (type = "Snapshot") => type.toString().toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const getReportTypeHelp = (type) => {
  const help = {
    FLIGHT_ACTIVITY: "Missions by planned date",
    INCIDENT: "Incidents by reported date",
    MAINTENANCE: "Maintenance by due date",
    COMPLIANCE: "Compliance records in scope",
    UTILIZATION: "Fleet and mission utilization"
  };
  return help[type] ?? "Operational records";
};

const buildScopePreview = ({ dateFrom, dateTo, limit }) => {
  const dates = dateFrom && dateTo
    ? `${formatDateLabel(dateFrom)} to ${formatDateLabel(dateTo)}`
    : dateFrom
      ? `From ${formatDateLabel(dateFrom)}`
      : dateTo
        ? `Up to ${formatDateLabel(dateTo)}`
        : "All available dates";
  return `${dates}. Export will include up to ${Number(limit) || 50} matching records.`;
};

const formatDateLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-AU");

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
