import { BarChart3, Download, FileSpreadsheet, FileText, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ActionButton from "../../../components/common/ActionButton";
import StatusBadge from "../../../components/common/StatusBadge";
import { exportSingleReport } from "../../../utils/reportExport";

const ReportProfileDialog = ({ report, canDelete = false, onDeleted, onClose }) => {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleDelete = () => {
    const confirmed = window.confirm(`Delete ${report.name}?`);
    if (!confirmed) return;

    try {
      onDeleted?.(report);
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
            <h2 id="report-profile-title">{report.name}</h2>
            <p>{report.type ?? "Operational snapshot"}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close report profile">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {exportError && <div className="auth-alert">{exportError}</div>}
          <div className="profile-hero">
            <div className="profile-aircraft-icon">
              <BarChart3 size={42} />
            </div>
            <div>
              <h3>{report.name}</h3>
              <p>{report.owner}</p>
            </div>
            <StatusBadge>{report.status}</StatusBadge>
          </div>

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
              <ProfileRow label="Owner" value={report.owner} />
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
              <ProfileRow label="Source" value="Backend report record" />
              <ProfileRow label="Format" value={report.fileUrl ? "Linked file" : "In-app snapshot"} />
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
        </div>

        <div className="modal-footer profile-footer">
          {canDelete && (
            <div className="form-actions">
              <ActionButton icon={Trash2} variant="danger" onClick={handleDelete}>Delete Report</ActionButton>
            </div>
          )}
          <div className="dashboard-filter-wrap">
            <ActionButton icon={Download} variant="primary" onClick={() => setIsExportOpen((current) => !current)}>
              Export Report
            </ActionButton>
            {isExportOpen && (
              <div className="dashboard-filter-menu export-menu" role="menu" aria-label="Export report">
                <button type="button" onClick={async () => {
                  try {
                    await exportSingleReport(report, "excel");
                    setExportError("");
                    setIsExportOpen(false);
                  } catch (requestError) {
                    setExportError(requestError.message);
                  }
                }}>
                  <span>Excel</span>
                  <FileSpreadsheet size={15} />
                </button>
                <button type="button" onClick={async () => {
                  try {
                    await exportSingleReport(report, "pdf");
                    setExportError("");
                    setIsExportOpen(false);
                  } catch (requestError) {
                    setExportError(requestError.message);
                  }
                }}>
                  <span>PDF</span>
                  <FileText size={15} />
                </button>
                <button type="button" onClick={async () => {
                  try {
                    await exportSingleReport(report, "word");
                    setExportError("");
                    setIsExportOpen(false);
                  } catch (requestError) {
                    setExportError(requestError.message);
                  }
                }}>
                  <span>Word</span>
                  <Download size={15} />
                </button>
              </div>
            )}
          </div>
          <div className="form-actions">
            <ActionButton onClick={onClose}>Close</ActionButton>
          </div>
        </div>
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

  const items = [
    { label: "Current Value", value: report.value ?? summary.value ?? "Snapshot ready" },
    { label: "Change", value: report.change ?? summary.change ?? "No comparison available" },
    { label: "Prepared By", value: report.owner ?? summary.owner ?? "DroneOps" }
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

const buildOperatorNarrative = (report) => {
  const summary = report.dataSnapshot?.summary ?? {};
  const headline = report.value ?? summary.value ?? "This report is ready.";
  const change = report.change ?? summary.change ?? "No previous comparison was stored.";
  return `${report.name} captures a stored operational snapshot for ${report.type?.toString().toLowerCase().replaceAll("_", " ") ?? "current operations"}. The main outcome is ${headline}. Compared with the previous reporting window: ${change}. Operators can use this record for routine review, supervisor handover, and audit evidence.`;
};

export default ReportProfileDialog;
