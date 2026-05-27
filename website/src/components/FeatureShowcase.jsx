import { Link } from 'react-router-dom';
import Icon from './Icons';

/** Primele 3 capabilități — layout editorial, nu grid generic */
export default function FeatureShowcase({ items }) {
  return (
    <div className="feature-showcase">
      {items.map((f, i) => (
        <article key={f.slug} className={`feature-showcase__item feature-showcase__item--${i + 1}`}>
          <div className="feature-showcase__meta">
            <span className="label-mono">{String(i + 1).padStart(2, '0')}</span>
            <Icon name={f.icon} />
          </div>
          <h3>{f.title}</h3>
          <p>{f.summary}</p>
          <ul>
            {f.bullets.slice(0, 2).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <Link to={`/platforma#${f.slug}`} className="text-link">
            Detalii
            <span aria-hidden>↗</span>
          </Link>
        </article>
      ))}
    </div>
  );
}
