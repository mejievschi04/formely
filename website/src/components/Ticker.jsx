import { trustLabels } from '../data/site';

export default function Ticker() {
  const items = [...trustLabels, ...trustLabels];

  return (
    <div className="ticker" aria-hidden>
      <div className="ticker__track">
        {items.map((label, i) => (
          <span key={`${label}-${i}`} className="ticker__item">
            {label}
            <span className="ticker__dot" />
          </span>
        ))}
      </div>
    </div>
  );
}
