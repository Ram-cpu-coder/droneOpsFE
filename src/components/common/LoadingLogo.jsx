import DroneLogo from "./DroneLogo";

const LoadingLogo = ({ label = "Loading", size = "md", compact = false }) => {
  return (
    <span className={`loading-logo ${compact ? "compact" : ""}`.trim()} role="status" aria-live="polite">
      <DroneLogo className={`loading-drone-logo ${size}`} label={label} />
      {!compact && <span>{label}</span>}
    </span>
  );
};

export default LoadingLogo;
