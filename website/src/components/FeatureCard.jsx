import { Link } from 'react-router-dom';
import Icon from './Icons';

export default function FeatureCard({ feature, showLink = true }) {
  return (
    <article className="feature-card">
      <div className="feature-card__icon">
        <Icon name={feature.icon} />
      </div>
      <h3>{feature.title}</h3>
      <p className="feature-card__summary">{feature.summary}</p>
      {feature.bullets && (
        <ul className="feature-card__bullets">
          {feature.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {showLink && (
        <Link to={`/platforma#${feature.slug}`} className="feature-card__link">
          Află mai multe <Icon name="arrow" />
        </Link>
      )}
    </article>
  );
}
