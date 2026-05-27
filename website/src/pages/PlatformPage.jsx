import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import Icon from '../components/Icons';
import PlatformFeatureVisual from '../components/platform/PlatformFeatureVisual';
import {
  platformMeta,
  platformPillars,
  platformModules,
  platformRoles,
  platformIncluded,
} from '../data/site';
import '../styles/platform.css';

export default function PlatformPage() {
  useEffect(() => {
    document.body.classList.add('is-platform-page');
    return () => document.body.classList.remove('is-platform-page');
  }, []);

  return (
    <div className="page-platform">
      <Seo
        title="Platformă LMS — cursuri, teste, progres, echipe și AI"
        description="Descoperă modulele Formely: builder cursuri, evaluări automate, progres, echipe, bibliotecă și tutor AI contextual."
        path="/platforma"
      />

      {/* Hero */}
      <section className="plat-hero">
        <div className="plat-wrap plat-hero__inner">
          <p className="plat-kicker">Platformă</p>
          <h1>{platformMeta.title}</h1>
          <p className="plat-lead">{platformMeta.lead}</p>
          <div className="plat-hero__actions">
            <Link to="/contact" className="btn btn--primary btn--lg">
              Programează demo
            </Link>
            <Link to="/preturi" className="btn btn--secondary btn--lg">
              Vezi prețuri
            </Link>
          </div>
          <nav className="plat-nav" aria-label="Sari la module">
            {platformModules.map((m) => (
              <a key={m.slug} href={`#${m.slug}`}>
                {m.navLabel}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* 4 piloni */}
      <section className="plat-section">
        <div className="plat-wrap">
          <header className="plat-section-head plat-section-head--center">
            <h2>Ce acoperă Formely</h2>
            <p>Patru zone care se leagă între ele — fără exporturi manuale între unelte.</p>
          </header>
          <div className="plat-pillars">
            {platformPillars.map((p) => (
              <article key={p.title} className="plat-pillar">
                <div className="plat-pillar__icon">
                  <Icon name={p.icon} />
                </div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Module detaliate */}
      <section className="plat-section plat-section--surface">
        <div className="plat-wrap">
          <header className="plat-section-head">
            <h2>Module în detaliu</h2>
            <p>
              Fiecare secțiune corespunde unei părți reale din platformă — click pe linkurile de
              sus pentru salt rapid.
            </p>
          </header>

          {platformModules.map((mod, index) => (
            <article
              key={mod.slug}
              id={mod.slug}
              className={`plat-feature${index % 2 === 1 ? ' plat-feature--reverse' : ''}`}
            >
              <div className="plat-feature__copy">
                <span className="plat-feature__tag">
                  {String(index + 1).padStart(2, '0')} · {mod.slug}
                </span>
                <h2>{mod.title}</h2>
                <p className="plat-feature__summary">{mod.summary}</p>
                <p className="plat-feature__detail">{mod.detail}</p>
                <ul className="plat-feature__list">
                  {mod.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="plat-feature__visual">
                <PlatformFeatureVisual type={mod.mock} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Roluri */}
      <section className="plat-section">
        <div className="plat-wrap">
          <header className="plat-section-head plat-section-head--center">
            <h2>Roluri și permisiuni</h2>
            <p>
              Fiecare utilizator vede doar ce are nevoie — admin configurează, instructor predă,
              analist raportează, cursant învață.
            </p>
          </header>
          <div className="plat-roles">
            {platformRoles.map((role) => (
              <article key={role.id} className="plat-role">
                <h3>{role.title}</h3>
                <p>{role.description}</p>
                <ul>
                  {role.access.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Inclus */}
      <section className="plat-section plat-section--surface plat-section--tight">
        <div className="plat-wrap">
          <header className="plat-section-head plat-section-head--center">
            <h2>Și la nivel de platformă</h2>
          </header>
          <div className="plat-included">
            {platformIncluded.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="plat-cta">
        <div className="plat-wrap">
          <div className="plat-cta__card">
            <h2>Vrei să vezi platforma pe cazul tău?</h2>
            <p>
              Îți arătăm un curs, un test și raportul de progres — configurate după scenariul tău,
              nu un demo generic.
            </p>
            <div className="plat-cta__actions">
              <Link to="/contact" className="btn btn--primary btn--lg">
                Solicită demo
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
