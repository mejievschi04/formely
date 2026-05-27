import { Link } from 'react-router-dom';
import Icon from './Icons';

export default function AudienceRows({ items }) {
  return (
    <div className="audience-rows">
      {items.map((s, i) => (
        <article key={s.slug} className="audience-row">
          <div className="audience-row__index label-mono">{String(i + 1).padStart(2, '0')}</div>
          <div className="audience-row__icon">
            <Icon name={s.icon} />
          </div>
          <div className="audience-row__body">
            <h3>{s.title}</h3>
            <p className="audience-row__headline">{s.headline}</p>
            <p>{s.description}</p>
          </div>
          <div className="audience-row__aside">
            <span className="audience-row__metric">{s.metric}</span>
            <Link to="/solutii" className="text-link">
              Soluție <span aria-hidden>→</span>
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
