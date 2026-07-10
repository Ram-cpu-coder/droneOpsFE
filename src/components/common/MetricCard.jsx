const MetricCard = ({ label, value, delta, icon: Icon, tone = "blue" }) => {
  return (
    <article className="metric-card">
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {delta && <span>{delta}</span>}
      </div>
      {Icon && (
        <span className={`metric-icon ${tone}`}>
          <Icon size={25} />
        </span>
      )}
    </article>
  );
};

export default MetricCard;
