const BatteryMeter = ({ value }) => {
  const tone = value < 50 ? "warn" : "ok";

  return (
    <div className="battery-cell">
      <div className="battery-track">
        <span className={tone} style={{ width: `${value}%` }} />
      </div>
      <span>{value}%</span>
    </div>
  );
};

export default BatteryMeter;
