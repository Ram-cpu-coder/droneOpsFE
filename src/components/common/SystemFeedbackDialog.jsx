import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";
import ActionButton from "./ActionButton";

const SystemFeedbackDialog = ({ feedback, onClose }) => {
  if (!feedback) return null;

  const type = feedback.type ?? "info";
  const Icon = getFeedbackIcon(type);
  const isBlocking = type === "loading" || feedback.blocking;

  return (
    <div className="system-feedback-backdrop" role="presentation" onMouseDown={(event) => {
      if (isBlocking || event.target !== event.currentTarget) return;
      onClose?.();
    }}>
      <section
        className={`system-feedback-dialog ${type}`}
        role={type === "error" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-live={type === "loading" ? "polite" : "assertive"}
        aria-labelledby="system-feedback-title"
      >
        <div className="system-feedback-icon">
          <Icon size={26} />
        </div>
        <div className="system-feedback-content">
          <p className="eyebrow">{getFeedbackEyebrow(type)}</p>
          <h2 id="system-feedback-title">{feedback.title ?? getDefaultTitle(type)}</h2>
          {feedback.message && <p>{feedback.message}</p>}
          {Array.isArray(feedback.details) && feedback.details.length > 0 && (
            <ul>
              {feedback.details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          )}
        </div>
        {!isBlocking && (
          <button className="system-feedback-close" type="button" onClick={onClose} aria-label="Close message">
            <X size={18} />
          </button>
        )}
        {type === "loading" && (
          <div className="system-feedback-progress" aria-hidden="true">
            <span />
          </div>
        )}
        {type !== "loading" && (
          <div className="system-feedback-actions">
            <ActionButton variant={type === "error" ? "danger" : "primary"} onClick={onClose}>
              {feedback.actionLabel ?? "OK"}
            </ActionButton>
          </div>
        )}
      </section>
    </div>
  );
};

const getFeedbackIcon = (type) => {
  if (type === "success") return CheckCircle2;
  if (type === "error") return AlertTriangle;
  if (type === "loading") return LoaderCircle;
  return Info;
};

const getFeedbackEyebrow = (type) => {
  if (type === "success") return "Completed";
  if (type === "error") return "Action needed";
  if (type === "loading") return "Working";
  return "Notice";
};

const getDefaultTitle = (type) => {
  if (type === "success") return "Operation completed";
  if (type === "error") return "Something went wrong";
  if (type === "loading") return "Please wait";
  return "DroneOps message";
};

export default SystemFeedbackDialog;
