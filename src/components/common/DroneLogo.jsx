const DroneLogo = ({ className = "", label }) => {
  return (
    <div className={`drone-logo ${className}`.trim()} aria-hidden={label ? undefined : "true"} aria-label={label}>
      <span className="drone-rotor rotor-left-top" />
      <span className="drone-rotor rotor-right-top" />
      <span className="drone-rotor rotor-left-bottom" />
      <span className="drone-rotor rotor-right-bottom" />
      <span className="drone-body" />
    </div>
  );
};

export default DroneLogo;
