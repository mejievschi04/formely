import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import PricingCompare from '../components/pricing/PricingCompare';
import { FaqJsonLd } from '../components/JsonLd';
import {
  pricingMeta,
  pricingPlans,
  pricingSteps,
  pricingIncludedAll,
  pricingExtras,
  pricingFaq,
} from '../data/site';
import '../styles/pricing.css';

export default function PricingPage() {
  useEffect(() => {
    document.body.classList.add('is-pricing-page');
    return () => document.body.classList.remove('is-pricing-page');
  }, []);

  return (
    <div className="page-pricing">
      <Seo
        title="Prețuri Formely — planuri Echipă, Academy, Enterprise"
        description="Prețuri la cerere, în funcție de cursanți activi și module. Pilot disponibil după demo. Compară planurile Formely."
        path="/preturi"
      />
      <FaqJsonLd items={pricingFaq} />

      <section className="prc-hero">
        <div className="prc-wrap">
          <p className="prc-kicker">Prețuri</p>
          <h1>{pricingMeta.title}</h1>
          <p className="prc-lead">{pricingMeta.lead}</p>
          <p className="prc-note">{pricingMeta.subline}</p>
        </div>
      </section>

      <section className="prc-section prc-section--surface">
        <div className="prc-wrap">
          <header className="prc-section-head prc-section-head--center">
            <h2>Cum obții o ofertă</h2>
            <p>Fără checkout online — discutăm nevoile tale și îți trimitem propunerea clară.</p>
          </header>
          <div className="prc-steps">
            {pricingSteps.map((step) => (
              <article key={step.num} className="prc-step">
                <span className="prc-step__num">{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="prc-section" id="planuri">
        <div className="prc-wrap">
          <header className="prc-section-head prc-section-head--center">
            <h2>Planuri</h2>
            <p>{pricingMeta.headline}</p>
          </header>
          <div className="prc-plans">
            {pricingPlans.map((plan) => (
              <article
                key={plan.id}
                className={`prc-plan${plan.highlighted ? ' prc-plan--featured' : ''}`}
              >
                {plan.highlighted && (
                  <span className="prc-plan__badge">Cel mai ales</span>
                )}
                <p className="prc-plan__audience">{plan.audience}</p>
                <h3>{plan.name}</h3>
                <p className="prc-plan__price">{plan.price}</p>
                {plan.priceDetail && (
                  <p className="prc-plan__detail">{plan.priceDetail}</p>
                )}
                <p className="prc-plan__desc">{plan.description}</p>
                <p className="prc-plan__best">
                  <strong>Potrivit pentru:</strong> {plan.bestFor}
                </p>
                <p className="prc-plan__solution">
                  <Link to={`/solutii#${plan.solutionSlug}`}>Vezi soluția →</Link>
                </p>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link to="/contact" className="btn btn--primary">
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="prc-section prc-section--surface">
        <div className="prc-wrap">
          <header className="prc-section-head prc-section-head--center">
            <h2>Compară planurile</h2>
            <p>Volumele sunt orientative — oferta finală se stabilește la demo.</p>
          </header>
          <PricingCompare />
        </div>
      </section>

      <section className="prc-section">
        <div className="prc-wrap">
          <div className="prc-pilot">
            <div>
              <h2>{pricingMeta.pilotTitle}</h2>
              <p>{pricingMeta.pilotText}</p>
            </div>
            <Link to="/contact" className="btn btn--primary">
              Solicită pilot
            </Link>
          </div>
        </div>
      </section>

      <section className="prc-section prc-section--surface">
        <div className="prc-wrap">
          <header className="prc-section-head prc-section-head--center">
            <h2>Ce e inclus vs. opțional</h2>
          </header>
          <div className="prc-included-grid">
            <div>
              <h3 className="prc-box-title">Inclus în orice plan</h3>
              <ul className="prc-included-list">
                {pricingIncludedAll.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="prc-box-title">Opțional / la cerere</h3>
              <ul className="prc-extras-list">
                {pricingExtras.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="prc-section">
        <div className="prc-wrap">
          <header className="prc-section-head prc-section-head--center">
            <h2>Întrebări despre prețuri</h2>
          </header>
          <div className="prc-faq">
            {pricingFaq.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="prc-cta">
        <div className="prc-wrap">
          <div className="prc-cta__card">
            <h2>Primești ofertă scrisă după demo</h2>
            <p>
              Îți spunem clar ce include, ce costă extra și cum arată un pilot — înainte să semnezi
              ceva.
            </p>
            <div className="prc-cta__actions">
              <Link to="/contact" className="btn btn--primary btn--lg">
                Programează demo
              </Link>
              <Link to="/solutii" className="btn btn--secondary btn--lg">
                Vezi soluții
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
