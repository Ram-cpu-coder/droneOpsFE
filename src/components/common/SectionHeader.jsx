const SectionHeader = ({ title, description, action }) => {
  return (
    <div className="panel-heading">
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
};

export default SectionHeader;
