import { steps } from '../data/site';

export default function HowItWorks() {
  return (
    <section className="section section--muted" aria-labelledby="how-heading">
      <div className="container">
        <header className="section-header section-header--center">
          <p className="eyebrow">Cum funcționează</p>
          <h2 id="how-heading">De la structură la rezultate în trei pași</h2>
          <p className="lead">Fără integrări forțate — tot fluxul de formare trăiește în Formely.</p>
        </header>
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.num} className="steps__item">
              <span className="steps__num">{step.num}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
