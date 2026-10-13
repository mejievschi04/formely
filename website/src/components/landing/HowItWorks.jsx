import { useI18n } from '../../i18n/I18nContext';
import { demoUrl } from '../../data/site';
import SectionTitle from './SectionTitle';

export default function HowItWorks() {
  const { t } = useI18n();
  const steps = t('how.steps');

  return (
    <section className="section how" id="cum-functioneaza" aria-labelledby="how-title">
      <div className="container">
        <p className="eyebrow reveal">{t('how.eyebrow')}</p>
        <SectionTitle id="how-title" lines={t('how.lines')} />
        <p className="section-sub reveal">{t('how.subtitle')}</p>

        <ol className="how-steps-row reveal">
          {steps.map((step) => (
            <li key={step.num}>
              <div className="how-step-btn how-step-static">
                <span className="how-steps-num">{step.num}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="how-cta reveal">
          <a className="btn btn-secondary" href={demoUrl} target="_blank" rel="noopener noreferrer">
            {t('how.ctaDemo')}
          </a>
          <a className="btn btn-primary" href="/#contact">
            {t('how.cta')}
          </a>
        </div>
      </div>
    </section>
  );
}
