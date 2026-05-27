import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import {
  site,
  aboutMeta,
  aboutMission,
  aboutDifferentiators,
  aboutValues,
  aboutTimeline,
} from '../data/site';
import '../styles/about.css';

const valueIcons = ['◎', '✓', '◇'];

export default function AboutPage() {
  useEffect(() => {
    document.body.classList.add('is-about-page');
    return () => document.body.classList.remove('is-about-page');
  }, []);

  return (
    <div className="page-about">
      <Seo
        title="Despre Formely — LMS pentru formare serioasă"
        description={aboutMeta.lead}
        path="/despre"
      />

      <section className="abt-hero">
        <div className="abt-wrap abt-hero__inner">
          <p className="abt-kicker">Despre Formely</p>
          <h1>{aboutMeta.title}</h1>
          <p className="abt-lead">{aboutMeta.lead}</p>
        </div>
      </section>

      <section className="abt-section">
        <div className="abt-wrap abt-intro">
          <article className="abt-mission">
            <h2>{aboutMission.title}</h2>
            <p>{aboutMission.text}</p>
          </article>
          <div className="abt-flow" aria-label="Fluxul Formely">
            {aboutTimeline.map((step) => (
              <div key={step.label} className="abt-flow__step">
                <span className="abt-flow__label">{step.label}</span>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="abt-section abt-section--surface">
        <div className="abt-wrap">
          <header className="abt-section-head abt-section-head--center">
            <h2>Ce ne diferențiază</h2>
            <p>Decizii de produs luate pentru programe reale — nu pentru demo-uri de marketing.</p>
          </header>
          <div className="abt-diff-grid">
            {aboutDifferentiators.map((item) => (
              <article key={item.title} className="abt-diff">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="abt-section">
        <div className="abt-wrap">
          <header className="abt-section-head abt-section-head--center">
            <h2>Valorile produsului</h2>
            <p>Principii după care construim și îmbunătățim {site.name}.</p>
          </header>
          <div className="abt-values">
            {aboutValues.map((v, i) => (
              <article key={v.title} className="abt-value">
                <div className="abt-value__icon" aria-hidden>
                  {valueIcons[i]}
                </div>
                <h3>{v.title}</h3>
                <p>{v.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="abt-cta">
        <div className="abt-wrap">
          <div className="abt-cta__card">
            <h2>Vrei să vezi cum arată în practică?</h2>
            <p>
              Programează un demo pe scenariul tău — cursuri, teste și progres, nu un tur generic.
            </p>
            <div className="abt-cta__actions">
              <Link to="/contact" className="btn btn--primary btn--lg">
                Programează demo
              </Link>
              <Link to="/platforma" className="btn btn--secondary btn--lg">
                Explorează platforma
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
