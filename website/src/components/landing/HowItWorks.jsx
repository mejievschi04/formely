import { useI18n } from '../../i18n/I18nContext';
import ProductUiFrame from './ProductUiFrame';

const VARIANTS = ['courses', 'people', 'progress'];

export default function HowItWorks() {
  const { t } = useI18n();
  const steps = t('how.steps');

  return (
    <section className="section" id="cum-functioneaza" aria-labelledby="how-title">
      <div className="container">
        <p className="eyebrow reveal">{t('how.eyebrow')}</p>
        <h2 id="how-title" className="section-title reveal">
          {t('how.title')}
        </h2>
        <div className="how-grid">
          {steps.map((step, i) => (
            <article key={step.num} className="how-step reveal">
              <div>
                <div className="how-step-num">{step.num}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
              <ProductUiFrame variant={VARIANTS[i] || 'dashboard'} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
