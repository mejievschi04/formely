import { Link } from 'react-router-dom';
import Icon from './Icons';

export default function FeatureGrid({ items }) {
  return (
    <div className="features">
      {items.map((f) => (
        <article key={f.slug} className="feature">
          <div className="feature__icon">
            <Icon name={f.icon} />
          </div>
          <h3>{f.title}</h3>
          <p>{f.summary}</p>
          <Link to={`/platforma#${f.slug}`}>Află mai multe →</Link>
        </article>
      ))}
    </div>
  );
}
