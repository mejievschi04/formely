import { steps } from '../data/site';

export default function Pipeline() {
  return (
    <section className="section pipeline" aria-labelledby="pipeline-heading">
      <div className="container">
        <div className="pipeline__header">
          <p className="label-mono">Flux</p>
          <h2 id="pipeline-heading">Trei etape. Un singur sistem.</h2>
        </div>
        <ol className="pipeline__list">
          {steps.map((step, i) => (
            <li key={step.num} className="pipeline__step">
              <div className="pipeline__line" aria-hidden>
                {i < steps.length - 1 && <span />}
              </div>
              <div className="pipeline__content">
                <span className="pipeline__num">{step.num}</span>
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
