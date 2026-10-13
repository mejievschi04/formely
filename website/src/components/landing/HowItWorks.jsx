import { useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { demoUrl } from '../../data/site';
import ProductUiFrame from './ProductUiFrame';
import SectionTitle from './SectionTitle';

const STEP_VARIANTS = ['create', 'assign', 'track'];

export default function HowItWorks() {
  const { t } = useI18n();
  const steps = t('how.steps');
  const [active, setActive] = useState(0);
  const variant = STEP_VARIANTS[active] || 'create';

  return (
    <section className="section how" id="cum-functioneaza" aria-labelledby="how-title">
      <div className="container">
        <p className="eyebrow reveal">{t('how.eyebrow')}</p>
        <SectionTitle id="how-title" lines={t('how.lines')} />
        <p className="section-sub reveal">{t('how.subtitle')}</p>

        <ol className="how-steps-row reveal">
          {steps.map((step, index) => (
            <li key={step.num}>
              <button
                type="button"
                className={`how-step-btn${active === index ? ' is-active' : ''}`}
                onClick={() => setActive(index)}
                aria-pressed={active === index}
              >
                <span className="how-steps-num">{step.num}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </button>
            </li>
          ))}
        </ol>

        <div className="how-demo reveal">
          <p className="how-demo-caption">{t('how.shotCaption')}</p>
          <ProductUiFrame variant={variant} interactive={false} priority={active === 0} />
        </div>

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
