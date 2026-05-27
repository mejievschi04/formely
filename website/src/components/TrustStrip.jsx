import { trustLabels } from '../data/site';

export default function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="Pentru cine este Formely">
      <div className="container trust-strip__inner">
        <p className="trust-strip__label">Potrivit pentru</p>
        <ul className="trust-strip__tags">
          {trustLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
