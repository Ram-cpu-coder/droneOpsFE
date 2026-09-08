const BatteryMeter = ({ value }) => {
  const numericValue = Number(value);
  const hasReading = value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(numericValue);

  if (!hasReading) {
    return (
      <div className="battery-cell is-unknown">
        <span>Unknown</span>
      </div>
    );
  }

  const safeValue = Math.min(100, Math.max(0, numericValue));
  const tone = safeValue < 50 ? "warn" : "ok";

  return (
    <div className="battery-cell">
      <div className="battery-track">
        <span className={tone} style={{ width: `${safeValue}%` }} />
      </div>
      <span>{safeValue}%</span>
    </div>
  );
};

export default BatteryMeter;
