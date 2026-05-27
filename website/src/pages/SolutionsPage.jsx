import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import Icon from '../components/Icons';
import SolutionVisual from '../components/solutions/SolutionVisual';
import { solutionsMeta, solutions, solutionsShared } from '../data/site';
import '../styles/solutions.css';

export default function SolutionsPage() {
  useEffect(() => {
    document.body.classList.add('is-solutions-page');
    return () => document.body.classList.remove('is-solutions-page');
  }, []);

  return (
    <div className="page-solutions">
      <Seo
        title="Soluții Formely — academii, corporate, instructori"
        description="Formely pentru academii online, training corporate și instructori independenți. Același LMS, obiective diferite."
        path="/solutii"
      />

      <section className="sol-hero">
        <div className="sol-wrap sol-hero__inner">
          <p className="sol-kicker">Soluții</p>
          <h1>{solutionsMeta.title}</h1>
          <p className="sol-lead">{solutionsMeta.lead}</p>
          <nav className="sol-nav" aria-label="Sari la soluție">
            {solutions.map((s) => (
              <a key={s.slug} href={`#${s.slug}`}>
                {s.navLabel}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section className="sol-section">
        <div className="sol-wrap">
          <header className="sol-section-head sol-section-head--center">
            <h2>Ce au în comun toate scenariile</h2>
            <p>Indiferent de mărimea organizației, fluxul de bază rămâne același.</p>
          </header>
          <ul className="sol-shared">
            {solutionsShared.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sol-section sol-section--surface">
        <div className="sol-wrap">
          {solutions.map((sol, index) => (
            <article
              key={sol.slug}
              id={sol.slug}
              className={`sol-profile${index % 2 === 1 ? ' sol-profile--reverse' : ''}`}
            >
              <div className="sol-profile__main">
                <div className="sol-profile__icon">
                  <Icon name={sol.icon} />
                </div>
                <span className="sol-profile__plan">{sol.planName}</span>
                <h2>{sol.title}</h2>
                <p className="sol-profile__headline">{sol.headline}</p>
                <p className="sol-profile__detail">{sol.detail}</p>

                <div className="sol-profile__grid">
                  <div className="sol-profile__box sol-profile__box--challenges">
                    <h3>Provocări frecvente</h3>
                    <ul>
                      {sol.challenges.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="sol-profile__box sol-profile__box--outcomes">
                    <h3>Cu Formely</h3>
                    <ul>
                      {sol.outcomes.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="sol-profile__features" aria-label="Funcții folosite">
                  {sol.featuresUsed.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </div>

                <div className="sol-profile__links">
                  <Link to="/platforma">Vezi platforma →</Link>
                  <Link to="/preturi">Planuri și prețuri →</Link>
                </div>
              </div>

              <aside className="sol-profile__aside">
                <div className="sol-profile__visual">
                  <SolutionVisual type={sol.mock} />
                </div>
                <ul className="sol-profile__bullets">
                  {sol.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </aside>
            </article>
          ))}
        </div>
      </section>

      <section className="sol-section">
        <div className="sol-wrap">
          <header className="sol-section-head sol-section-head--center">
            <h2>Care plan ți se potrivește?</h2>
            <p>O orientare rapidă — oferta finală se stabilește la demo.</p>
          </header>
          <div className="sol-plans">
            {solutions.map((sol) => (
              <div key={sol.slug} className="sol-plan-card">
                <h3>{sol.navLabel}</h3>
                <p>{sol.metric}</p>
                <Link to="/preturi">Detalii prețuri</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sol-cta">
        <div className="sol-wrap">
          <div className="sol-cta__card">
            <h2>Nu ești sigur unde te încadrezi?</h2>
            <p>
              În 15–30 minute discutăm volumul de cursanți, tipul de programe și ce module îți
              trebuie — apoi îți propunem planul potrivit.
            </p>
            <div className="sol-cta__actions">
              <Link to="/contact" className="btn btn--primary btn--lg">
                Solicită consultanță
              </Link>
              <Link to="/preturi" className="btn btn--secondary btn--lg">
                Compară planurile
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
