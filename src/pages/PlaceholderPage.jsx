const PlaceholderPage = ({ route }) => (
  <section className="page-stack">
    <div className="panel placeholder-page">
      <p className="eyebrow">Selected Page</p>
      <h3>{route.label}</h3>
      <p>{route.label} page</p>
    </div>
  </section>
);

export default PlaceholderPage;
