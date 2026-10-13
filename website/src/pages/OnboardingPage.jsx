import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import Contact from '../components/landing/Contact';
import ProductUiFrame from '../components/landing/ProductUiFrame';
import { useI18n } from '../i18n/I18nContext';

function useReveal(lang) {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal:not(.is-in)');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-in');
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    els.forEach((el) => io.observe(el));
    requestAnimationFrame(() => {
      document.querySelectorAll('.uc-hero .reveal').forEach((el) => el.classList.add('is-in'));
    });
    return () => io.disconnect();
  }, [lang]);
}

export default function OnboardingPage() {
  const { t, lang } = useI18n();
  useReveal(lang);

  const pains = t('onboardingPage.pains');
  const steps = t('onboardingPage.steps');
  const outcomes = t('onboardingPage.outcomes');

  return (
    <>
      <Seo
        title={t('onboardingPage.seo.title')}
        description={t('onboardingPage.seo.description')}
        path="/onboarding"
      />
      <div className="landing-ambient" aria-hidden />

      <section className="hero uc-hero">
        <div className="container hero-grid">
          <div className="hero-copy reveal">
            <p className="eyebrow">{t('onboardingPage.eyebrow')}</p>
            <h1 className="hero-title">{t('onboardingPage.title')}</h1>
            <p className="hero-sub">{t('onboardingPage.sub')}</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#contact">
                {t('onboardingPage.cta')}
              </a>
              <Link className="btn btn-secondary" to="/">
                {t('onboardingPage.back')}
              </Link>
            </div>
            <p className="hero-micro">{t('onboardingPage.note')}</p>
          </div>
          <div className="hero-visual-wrap reveal">
            <figure className="hero-product">
              <ProductUiFrame variant="aiSetup" priority interactive />
              <figcaption className="hero-product-caption">{t('onboardingPage.caption')}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="uc-pains-title">
        <div className="container">
          <h2 id="uc-pains-title" className="section-title reveal">
            {t('onboardingPage.painsTitle')}
          </h2>
          <div className="problem-grid">
            {pains.map((item) => (
              <article key={item.title} className="problem-card reveal">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="uc-steps-title">
        <div className="container">
          <h2 id="uc-steps-title" className="section-title reveal">
            {t('onboardingPage.stepsTitle')}
          </h2>
          <p className="section-sub reveal">{t('onboardingPage.stepsSub')}</p>
          <ol className="uc-steps">
            {steps.map((step, i) => (
              <li key={step.title} className="uc-step reveal">
                <span className="uc-step-num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="uc-visual reveal">
            <ProductUiFrame variant="track" />
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="uc-outcomes-title">
        <div className="container">
          <h2 id="uc-outcomes-title" className="section-title reveal">
            {t('onboardingPage.outcomesTitle')}
          </h2>
          <ul className="uc-outcomes">
            {outcomes.map((item) => (
              <li key={item} className="reveal">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Contact leadSource="website-onboarding" />
    </>
  );
}
