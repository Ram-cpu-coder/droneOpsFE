const ProgressBar = ({ value, tone = "blue" }) => {
  return (
    <div className="progress-track" aria-label={`${value}% complete`}>
      <span className={tone} style={{ width: `${value}%` }} />
    </div>
  );
};

export default ProgressBar;
