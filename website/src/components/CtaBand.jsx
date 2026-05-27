import { Link } from 'react-router-dom';
import { appUrl } from '../data/site';

export default function CtaBand({
  title = 'Începe cu un demo personalizat',
  text = 'Îți arătăm cursuri, teste și rapoarte pe scenariul tău — în circa 30 de minute.',
  primaryLabel = 'Programează demo',
  primaryTo = '/contact',
  secondaryLabel = 'Intră în platformă',
  secondaryHref = appUrl,
}) {
  const primary =
    primaryTo.startsWith('http') ? (
      <a href={primaryTo} className="btn btn--primary btn--lg">{primaryLabel}</a>
    ) : (
      <Link to={primaryTo} className="btn btn--primary btn--lg">{primaryLabel}</Link>
    );

  return (
    <section className="section section--tight">
      <div className="container">
        <div className="cta-card">
          <h2>{title}</h2>
          <p>{text}</p>
          <div className="cta-card__actions">
            {primary}
            <a href={secondaryHref} className="btn btn--secondary btn--lg">{secondaryLabel}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
