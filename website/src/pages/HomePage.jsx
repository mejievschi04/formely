import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import Icon from '../components/Icons';
import HomeHeroMock from '../components/home/HomeHeroMock';
import { FaqJsonLd } from '../components/JsonLd';
import { site, features, faq, steps, solutions, testimonials, trustLabels } from '../data/site';
import '../styles/home.css';

export default function HomePage() {
  const bentoFeatures = features.slice(0, 6);

  useEffect(() => {
    document.body.classList.add('is-home-page');
    return () => document.body.classList.remove('is-home-page');
  }, []);

  return (
    <div className="page-home">
      <Seo
        title="Formely — Platformă LMS pentru academii și training corporate"
        description={site.description}
        path="/"
      />
      <FaqJsonLd items={faq} />

      {/* Hero */}
      <section className="home-hero">
        <div className="home-wrap home-hero__grid">
          <div>
            <p className="home-kicker">Platformă LMS · România</p>
            <h1 className="home-title">
              Formare online cu <em>structură</em> și evaluări în care poți avea încredere
            </h1>
            <p className="home-lead">{site.tagline}</p>
            <div className="home-actions">
              <Link to="/contact" className="btn btn--primary btn--lg">
                Programează demo gratuit
              </Link>
              <Link to="/platforma" className="btn btn--secondary btn--lg">
                Explorează platforma
              </Link>
            </div>
            <p className="home-note">30–45 min · scenariul tău · fără card bancar</p>
            <ul className="home-hero__checks">
              <li>Cursuri modulare</li>
              <li>Teste cu feedback corect</li>
              <li>Progres pe echipe</li>
            </ul>
          </div>
          <HomeHeroMock />
        </div>
      </section>

      {/* Trust */}
      <section className="home-trust" aria-label="Pentru cine este Formely">
        <div className="home-wrap home-trust__inner">
          <span className="home-trust__label">Construit pentru</span>
          <div className="home-trust__tags">
            {trustLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </section>

      {/* De ce Formely — 3 outcome cards */}
      <section className="home-section">
        <div className="home-wrap">
          <header className="home-section-head home-section-head--center">
            <h2>De ce echipele aleg Formely</h2>
            <p>
              Nu înlocuiești doar un folder de PDF-uri — obții un flux complet de la structură la
              certificat.
            </p>
          </header>
          <div className="home-outcomes">
            <article className="home-outcome">
              <span className="home-outcome__num">01</span>
              <h3>Un singur loc pentru tot</h3>
              <p>
                Cursuri, lecții, teste, echipe și rapoarte — fără să sari între drive, email și
                alte unelte.
              </p>
            </article>
            <article className="home-outcome">
              <span className="home-outcome__num">02</span>
              <h3>Evaluări care au sens</h3>
              <p>
                Cursantul vede exact ce a răspuns; instructorul vede același lucru la notare — fără
                discrepanțe.
              </p>
            </article>
            <article className="home-outcome">
              <span className="home-outcome__num">03</span>
              <h3>Progres vizibil</h3>
              <p>
                Știi cine a terminat modulul, cine e în întârziere și cine primește certificatul la
                final.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Capabilități — bento */}
      <section className="home-section home-section--surface" id="capabilitati">
        <div className="home-wrap">
          <header className="home-section-head">
            <h2>Tot ce ai nevoie pentru programe serioase</h2>
            <p>
              De la builder de cursuri la tutor AI pe materialele tale — fiecare piesă lucrează
              împreună.
            </p>
          </header>
          <div className="home-bento">
            {bentoFeatures.map((f, i) => (
              <article
                key={f.slug}
                className={`home-bento__card${i === 5 ? ' home-bento__card--wide' : ''}`}
              >
                <div>
                  <div className="home-bento__icon">
                    <Icon name={f.icon} />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.summary}</p>
                </div>
                {i === 5 && (
                  <Link to="/platforma" className="home-link">
                    Vezi toate funcțiile
                    <Icon name="arrow" />
                  </Link>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Cum funcționează */}
      <section className="home-section">
        <div className="home-wrap">
          <header className="home-section-head home-section-head--center">
            <h2>Cum arată un program pe Formely</h2>
            <p>Trei pași — de la structură la rezultate pe care le poți raporta.</p>
          </header>
          <div className="home-flow">
            {steps.map((step) => (
              <article key={step.num} className="home-flow__step">
                <div className="home-flow__num">{step.num}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="home-section home-section--surface">
        <div className="home-wrap">
          <header className="home-section-head home-section-head--center">
            <h2>Pentru cine este</h2>
            <p>Același LMS — obiective diferite, de la academie la training corporate.</p>
          </header>
          <div className="home-audiences">
            {solutions.map((s) => (
              <Link key={s.slug} to={`/solutii#${s.slug}`} className="home-audience">
                <div className="home-audience__icon">
                  <Icon name={s.icon} />
                </div>
                <h3>{s.title}</h3>
                <p>{s.headline}</p>
                <span className="home-audience__cta">Află mai mult →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Testimoniale */}
      <section className="home-section home-section--tight">
        <div className="home-wrap">
          <header className="home-section-head home-section-head--center">
            <h2>Ce spun echipele care folosesc Formely</h2>
          </header>
          <div className="home-quotes">
            {testimonials.map((t) => (
              <figure key={t.name} className="home-quote">
                <blockquote>„{t.quote}"</blockquote>
                <footer>
                  <strong>{t.name}</strong>
                  {t.role}
                </footer>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="home-section home-section--surface">
        <div className="home-wrap">
          <header className="home-section-head home-section-head--center">
            <h2>Întrebări frecvente</h2>
          </header>
          <div className="home-faq">
            {faq.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="home-cta">
        <div className="home-wrap">
          <div className="home-cta__card">
            <h2>Gata să vezi Formely pe scenariul tău?</h2>
            <p>
              Îți arătăm cum arată un curs, un test și raportul de progres — apoi discutăm dacă vrei
              pilot sau ofertă.
            </p>
            <div className="home-cta__actions">
              <Link to="/contact" className="btn btn--primary btn--lg">
                Programează demo
              </Link>
              <Link to="/preturi" className="btn btn--secondary btn--lg">
                Vezi prețuri
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
