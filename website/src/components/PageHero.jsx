export default function PageHero({ eyebrow, title, lead, children, compact = false }) {
  return (
    <section className={`page-hero${compact ? ' page-hero--compact' : ''}`}>
      <div className="page-hero__bg" aria-hidden />
      <div className="container page-hero__inner">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-hero__title">{title}</h1>
        {lead && <p className="lead page-hero__lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}
