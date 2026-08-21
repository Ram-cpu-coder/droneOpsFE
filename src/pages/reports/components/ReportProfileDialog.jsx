import { BarChart3, Download, FileSpreadsheet, FileText, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import CopyableId from "../../../components/common/CopyableId";
import StatusBadge from "../../../components/common/StatusBadge";
import { droneOpsApi } from "../../../services/droneOpsApi";
import { exportSingleReport } from "../../../utils/reportExport";

const exportableStatuses = new Set(["READY", "GENERATED"]);
const reviewStatuses = ["REVIEW", "READY"];

const ReportProfileDialog = ({ report, canDelete = false, canManageStatus = false, onStatusChange, onDeleted, onClose }) => {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exportError, setExportError] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const exportAnchorRef = useRef(null);
  const exportMenuRef = useRef(null);
  const isExportable = exportableStatuses.has(String(report.status ?? "").toUpperCase());
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        return;
      }
      onClose?.();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, showDeleteConfirm]);

  useEffect(() => {
    if (!isExportOpen) return undefined;

    const handlePointerDown = (event) => {
      const isInsideAnchor = exportAnchorRef.current?.contains(event.target);
      const isInsideMenu = exportMenuRef.current?.contains(event.target);
      if (!isInsideAnchor && !isInsideMenu) setIsExportOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isExportOpen]);

  const handleDelete = async () => {
    try {
      await droneOpsApi.reports.remove(report.uuid ?? report.id);
      onDeleted?.(report);
      setShowDeleteConfirm(false);
    } catch (requestError) {
      setExportError(requestError.message);
    }
  };

  const handleExport = async (format) => {
    if (!isExportable) {
      setIsExportOpen(false);
      setExportError("This report is under review. Mark it Ready before exporting.");
      return;
    }

    try {
      await exportSingleReport(report, format);
      setExportError("");
      setIsExportOpen(false);
    } catch (requestError) {
      setExportError(requestError.message);
    }
  };

  const dialog = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="report-profile-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Report Profile</p>
            <h2 id="report-profile-title">{report.serialNumber ?? report.name}</h2>
            <p>{report.owner} | {report.name} | {report.type ?? "Operational snapshot"}</p>
            <ProfileIdentity id={report.uuid ?? report.systemId ?? report.id} />
          </div>
          <div className="profile-header-actions">
            <div className="profile-header-buttons">
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close report profile">
                <X size={18} />
              </button>
            </div>
            <StatusBadge>{report.status}</StatusBadge>
          </div>
        </div>

        <div className="modal-body">
          {exportError && <div className="auth-alert">{exportError}</div>}

          <div className="profile-metrics">
            <ProfileMetric icon={FileText} label="Value" value={report.value} />
            <ProfileMetric icon={Download} label="Change" value={report.change} />
            <ProfileMetric icon={BarChart3} label="Type" value={report.type ?? "Snapshot"} />
          </div>

          <div className="profile-grid">
            <ProfileSection icon={FileText} title="Report Summary">
              <ProfileRow label="Report" value={report.name} />
              <ProfileRow label="Type" value={report.type ?? "Snapshot"} />
              <ProfileRow label="Status" value={report.status} />
              <ProfileRow label="Category" value={report.owner} />
            </ProfileSection>

            <ProfileSection icon={BarChart3} title="Snapshot Values">
              <ProfileRow label="Current Value" value={report.value} />
              <ProfileRow label="Change" value={report.change} />
              <ProfileRow label="Generated" value={formatDateTime(report.createdAt)} />
              <ProfileRow label="File URL" value={report.fileUrl ?? "Not attached"} />
            </ProfileSection>

            <ProfileSection icon={Download} title="Export Readiness">
              <ProfileRow label="Availability" value={report.status} />
              <ProfileRow label="Audit Snapshot" value={report.dataSnapshot ? "Stored" : "Not stored"} />
              <ProfileRow label="Source" value={formatScopeSource(report.dataSnapshot?.scope)} />
              <ProfileRow label="Date Range" value={formatScopeRange(report.dataSnapshot?.scope)} />
              <ProfileRow label="Export Rule" value={isExportable ? "Ready for export" : "Export locked until Ready"} />
            </ProfileSection>
          </div>

          <section className="profile-location-card">
            <div className="profile-location-header">
              <div>
                <h3>Operational Brief</h3>
                <p>Plain-language summary prepared from the saved report snapshot.</p>
              </div>
            </div>
            <div className="report-brief-grid">
              {buildBriefItems(report).map((item) => (
                <article className="report-brief-card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  {item.note && <p>{item.note}</p>}
                </article>
              ))}
            </div>
            <div className="dialog-rich-text">
              <p>{buildOperatorNarrative(report)}</p>
            </div>
          </section>

          {canManageStatus && (
            <section className="profile-location-card report-status-panel">
              <div className="profile-location-header">
                <div>
                  <h3>Review Decision</h3>
                  <p>Check the report summary and snapshot evidence before releasing it for export.</p>
                </div>
                <StatusBadge>{report.status}</StatusBadge>
              </div>
              <div className="report-review-list">
                {buildReviewChecklist(report, isExportable).map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <div className="report-status-actions" role="group" aria-label="Report status controls">
                {reviewStatuses.map((status) => (
                  <ActionButton
                    key={status}
                    icon={status === "READY" ? Download : FileText}
                    variant={status === "READY" ? "primary" : "secondary"}
                    onClick={async () => {
                      setIsUpdatingStatus(true);
                      setExportError("");
                      try {
                        await onStatusChange?.(report, status);
                      } catch (requestError) {
                        setExportError(requestError.message);
                      } finally {
                        setIsUpdatingStatus(false);
                      }
                    }}
                    disabled={isUpdatingStatus || status === String(report.status ?? "").toUpperCase()}
                  >
                    {status === "READY" ? "Approve for Export" : "Return to Review"}
                  </ActionButton>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="modal-footer profile-footer">
          {canDelete && (
            <div className="form-actions">
              <ActionButton icon={Trash2} variant="danger" onClick={() => setShowDeleteConfirm(true)}>Delete Report</ActionButton>
            </div>
          )}
          <div className="dashboard-filter-wrap" ref={exportAnchorRef}>
            <ActionButton
              icon={Download}
              variant="primary"
              onClick={() => {
                if (!isExportable) {
                  setExportError("This report is under review. Mark it Ready before exporting.");
                  return;
                }
                setIsExportOpen((current) => !current);
              }}
              disabled={!isExportable}
            >
              Export Report
            </ActionButton>
            {isExportOpen && createPortal(
              <div
                className="dashboard-filter-menu export-menu report-dialog-export-menu floating-report-menu"
                ref={exportMenuRef}
                role="menu"
                aria-label="Export report"
                style={getFloatingMenuStyle(exportAnchorRef.current, "top")}
              >
                <button type="button" onClick={async () => {
                  try {
                    await handleExport("excel");
                  } catch (requestError) {
                    setExportError(requestError.message);
                  }
                }}>
                  <span>Excel</span>
                  <FileSpreadsheet size={15} />
                </button>
                <button type="button" onClick={async () => {
                  try {
                    await handleExport("pdf");
                  } catch (requestError) {
                    setExportError(requestError.message);
                  }
                }}>
                  <span>PDF</span>
                  <FileText size={15} />
                </button>
                <button type="button" onClick={async () => {
                  try {
                    await handleExport("word");
                  } catch (requestError) {
                    setExportError(requestError.message);
                  }
                }}>
                  <span>Word</span>
                  <Download size={15} />
                </button>
                <button type="button" onClick={async () => {
                  try {
                    await handleExport("json");
                  } catch (requestError) {
                    setExportError(requestError.message);
                  }
                }}>
                  <span>JSON</span>
                  <FileText size={15} />
                </button>
              </div>,
              document.body
            )}
          </div>
          <div className="form-actions">
            <ActionButton onClick={onClose}>Close</ActionButton>
          </div>
        </div>
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowDeleteConfirm(false)}>
            <div className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-report-title" aria-describedby="delete-report-description">
              <div className="delete-confirm-icon">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 id="delete-report-title">Delete {report.name}?</h3>
                <p id="delete-report-description">
                  This removes the report from the reports list. Exported files already downloaded to your device will not be affected.
                </p>
              </div>
              <div className="delete-confirm-actions">
                <ActionButton type="button" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </ActionButton>
                <ActionButton icon={Trash2} variant="danger" type="button" onClick={handleDelete}>
                  Delete Report
                </ActionButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
};

const ProfileMetric = ({ icon: Icon, label, value }) => (
  <div className="profile-metric">
    <Icon size={18} />
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ProfileIdentity = ({ id }) => (
  <div className="profile-identity-list" aria-label="Record identity">
    <span><strong>ID</strong><CopyableId value={id} /></span>
  </div>
);

const ProfileSection = ({ icon: Icon, title, children }) => (
  <section className="profile-section">
    <div className="profile-section-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
    <dl>{children}</dl>
  </section>
);

const ProfileRow = ({ label, value }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value || "Not provided"}</dd>
  </div>
);

const formatDateTime = (value) => {
  if (!value) return "Not provided";
  return new Date(value).toLocaleString();
};

const buildBriefItems = (report) => {
  const snapshot = report.dataSnapshot ?? {};
  const summary = snapshot.summary ?? {};
  const utilization = snapshot.utilization ?? {};
  const compliance = snapshot.compliance ?? {};
  const scope = snapshot.scope ?? {};

  const items = [
    { label: "Current Value", value: report.value ?? summary.value ?? "Snapshot ready" },
    { label: "Change", value: report.change ?? summary.change ?? "No comparison available" },
    { label: "Category", value: report.owner ?? summary.owner ?? "DroneOps" },
    { label: "Export Scope", value: formatScopeRange(scope), note: scope.limit ? `Maximum ${scope.limit} records included.` : null }
  ];

  if (utilization.totalDrones !== undefined) {
    items.push({ label: "Fleet in Scope", value: `${utilization.totalDrones} drones`, note: `${utilization.activeMissions ?? 0} active missions in this snapshot.` });
  }

  if (compliance.openIncidents !== undefined) {
    items.push({ label: "Open Issues", value: `${compliance.openIncidents} items`, note: `${compliance.pendingMaintenance ?? 0} maintenance items still pending review.` });
  }

  if (Array.isArray(snapshot.missions)) {
    items.push({ label: "Mission Records", value: `${snapshot.missions.length} included`, note: "Latest mission activity captured at generation time." });
  }

  if (Array.isArray(snapshot.incidents)) {
    items.push({ label: "Incident Records", value: `${snapshot.incidents.length} included`, note: "Used for operational and safety review." });
  }

  if (Array.isArray(snapshot.maintenance)) {
    items.push({ label: "Maintenance Records", value: `${snapshot.maintenance.length} included`, note: "Used for maintenance and airworthiness review." });
  }

  return items;
};

const buildReviewChecklist = (report, isExportable) => {
  const snapshot = report.dataSnapshot ?? {};
  const recordCounts = [
    Array.isArray(snapshot.missions) ? `${snapshot.missions.length} missions` : null,
    Array.isArray(snapshot.incidents) ? `${snapshot.incidents.length} incidents` : null,
    Array.isArray(snapshot.maintenance) ? `${snapshot.maintenance.length} maintenance records` : null
  ].filter(Boolean).join(", ");

  return [
    { label: "Decision", value: isExportable ? "Approved for export" : "Awaiting review" },
    { label: "Snapshot Evidence", value: report.dataSnapshot ? "Stored" : "Summary only" },
    { label: "Included Records", value: recordCounts || "Summary values only" },
    { label: "Release Rule", value: "Only Ready reports can be exported" }
  ];
};

const buildOperatorNarrative = (report) => {
  const summary = report.dataSnapshot?.summary ?? {};
  const scopeText = formatScopeRange(report.dataSnapshot?.scope);
  const headline = report.value ?? summary.value ?? "This report is ready.";
  const change = report.change ?? summary.change ?? "No previous comparison was stored.";
  return `${report.name} captures a stored operational snapshot for ${report.type?.toString().toLowerCase().replaceAll("_", " ") ?? "current operations"} using ${scopeText.toLowerCase()}. The main outcome is ${headline}. Compared with the previous reporting window: ${change}. Operators can use this record for routine review, supervisor handover, and audit evidence.`;
};

const formatScopeSource = (scope) => scope?.dateField ? `Backend report record | ${scope.dateField}` : "Backend report record";

const formatScopeRange = (scope) => {
  if (!scope) return "All available dates";
  const from = scope.dateFrom ? formatDate(scope.dateFrom) : null;
  const to = scope.dateTo ? formatDate(scope.dateTo) : null;
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;
  return "All available dates";
};

const formatDate = (value) => new Date(value).toLocaleDateString("en-AU");

const getFloatingMenuStyle = (anchor, placement = "bottom") => {
  if (!anchor) return undefined;

  const rect = anchor.getBoundingClientRect();
  const menuWidth = 220;
  const estimatedHeight = 224;
  const viewportPadding = 12;
  const left = Math.min(
    Math.max(viewportPadding, rect.right - menuWidth),
    window.innerWidth - menuWidth - viewportPadding
  );
  const top = placement === "top"
    ? Math.max(viewportPadding, rect.top - estimatedHeight - 8)
    : rect.bottom + 8;

  return {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    right: "auto",
    width: `${menuWidth}px`,
    zIndex: 10080
  };
};

export default ReportProfileDialog;
