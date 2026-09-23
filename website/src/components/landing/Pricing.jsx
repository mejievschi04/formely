import { useI18n } from '../../i18n/I18nContext';
import { launchPrice, planOrder, saasPlanCatalog } from '../../data/plans';
import { PlanFeatureList, PlanLimits } from './PlanOffer';
import SectionTitle from './SectionTitle';

export default function Pricing() {
  const { t } = useI18n();

  return (
    <section className="section" id="preturi" aria-labelledby="pricing-title">
      <div className="container">
        <p className="eyebrow reveal">{t('pricing.eyebrow')}</p>
        <SectionTitle id="pricing-title" lines={t('pricing.lines')} />
        <div className="price-lead reveal">
          <p className="section-sub">{t('pricing.subtitle')}</p>
          <p className="price-offer">{t('pricing.launch')}</p>
        </div>
        <div className="pricing-grid">
          {planOrder.map((id) => {
            const plan = saasPlanCatalog[id];
            const copy = t(`pricing.plans.${id}`);
            const featured = Boolean(plan.recommended);

            return (
              <article key={id} className={`price-card${featured ? ' is-featured' : ''} reveal`}>
                {featured && <span className="price-badge">{t('pricing.recommended')}</span>}
                <h3>{copy.name}</h3>
                <div className="price-amount">
                  <s className="price-was">
                    <span className="price-sr">{t('pricing.listPrice')} </span>
                    {plan.pricePrefix === 'from' ? `${t('pricing.from')} ` : ''}€{plan.price}
                  </s>
                  <p className="price-now">
                    {plan.pricePrefix === 'from' && <span>{t('pricing.from')}</span>}
                    <strong>€{launchPrice(plan.price)}</strong>
                    <span>{t('pricing.perMonth')}</span>
                  </p>
                  <p className="price-demo">{t('pricing.demo')}</p>
                </div>
                <PlanLimits planId={id} />
                <PlanFeatureList planId={id} />
                <a className={`btn btn-full ${featured ? 'btn-primary' : 'btn-secondary'}`} href={`/?plan=${id}#contact`}>
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
