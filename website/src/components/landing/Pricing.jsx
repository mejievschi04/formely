import { useI18n } from '../../i18n/I18nContext';
import { planOrder, saasPlanCatalog } from '../../data/plans';

export default function Pricing() {
  const { t } = useI18n();

  return (
    <section className="section" id="preturi" aria-labelledby="pricing-title">
      <div className="container">
        <p className="eyebrow reveal">{t('pricing.eyebrow')}</p>
        <h2 id="pricing-title" className="section-title reveal">
          {t('pricing.title')}
        </h2>
        <p className="section-sub reveal">{t('pricing.subtitle')}</p>
        <div className="pricing-grid">
          {planOrder.map((id) => {
            const plan = saasPlanCatalog[id];
            const copy = t(`pricing.plans.${id}`);
            const featured = Boolean(plan.recommended);
            const learners =
              plan.max_active_learners == null
                ? t('pricing.learnersUnlimited')
                : t('pricing.learners', { n: plan.max_active_learners });

            return (
              <article key={id} className={`price-card${featured ? ' is-featured' : ''} reveal`}>
                {featured && <span className="price-badge">{t('pricing.recommended')}</span>}
                <h3>{copy.name}</h3>
                <div className="price-amount">
                  {plan.pricePrefix === 'from' && <span>{t('pricing.from')}</span>}
                  <strong>€{plan.price}</strong>
                  <span>{t('pricing.perMonth')}</span>
                </div>
                <p className="price-meta">{learners}</p>
                <ul className="price-features">
                  {copy.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <a className="btn btn-primary btn-full" href={`/?plan=${id}#contact`}>
                  {t('pricing.cta')}
                </a>
              </article>
            );
          })}
        </div>
        <p className="pricing-note reveal">{t('pricing.note')}</p>
      </div>
    </section>
  );
}
