import { trustLabels } from '../data/site';

export default function LogoStrip() {
  return (
    <section className="logo-strip" aria-label="Pentru cine este Formely">
      <div className="container">
        <p className="logo-strip__label">Folosit de echipe care livrează formare la scară</p>
        <ul className="logo-strip__list">
          {trustLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
