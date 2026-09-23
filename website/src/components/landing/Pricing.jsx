import { useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { annualPrice, annualSavings, launchPrice, planOrder, saasPlanCatalog } from '../../data/plans';
import { PlanFeatureList, PlanLimits } from './PlanOffer';
import SectionTitle from './SectionTitle';

function PriceFace({ side, plan, name, featured, hidden, t }) {
  const monthly = launchPrice(plan.price);
  const yearly = annualPrice(monthly);
  const save = annualSavings(monthly);
  const yearlySide = side === 'year';
  const from = plan.pricePrefix === 'from';

  return (
    <div
      className={`price-face price-face-${side}${featured ? ' is-featured' : ''}`}
      aria-hidden={hidden}
      inert={hidden ? '' : undefined}
    >
      {featured && <span className="price-badge">{t('pricing.recommended')}</span>}
      <h3>{name}</h3>
      <div className="price-amount">
        <s className="price-was">
          <span className="price-sr">{t(yearlySide ? 'pricing.yearAtMonthly' : 'pricing.listPrice')} </span>
          {from ? `${t('pricing.from')} ` : ''}€{yearlySide ? monthly * 12 : plan.price}
        </s>
        <p className="price-now">
          {from && <span>{t('pricing.from')}</span>}
          <strong>€{yearlySide ? yearly : monthly}</strong>
          <span>{t(yearlySide ? 'pricing.perYear' : 'pricing.perMonth')}</span>
        </p>
        <p className={`price-save${yearlySide ? '' : ' is-spacer'}`} aria-hidden={!yearlySide}>
          {t('pricing.save', { n: save })}
        </p>
        <p className="price-demo">{t('pricing.demo')}</p>
      </div>
      <PlanLimits planId={plan.id} />
      <PlanFeatureList planId={plan.id} />
      <a className={`btn btn-full ${featured ? 'btn-primary' : 'btn-secondary'}`} href={`/?plan=${plan.id}#contact`} tabIndex={hidden ? -1 : undefined}>
        {t('pricing.cta')}
      </a>
    </div>
  );
}

export default function Pricing() {
  const { t } = useI18n();
  const [annual, setAnnual] = useState(false);

  return (
    <section className="section" id="preturi" aria-labelledby="pricing-title">
      <div className="container">
        <p className="eyebrow reveal">{t('pricing.eyebrow')}</p>
        <SectionTitle id="pricing-title" lines={t('pricing.lines')} />
        <div className="price-lead reveal">
          <p className="section-sub">{t('pricing.subtitle')}</p>
          <p className="price-offer">{t('pricing.launch')}</p>
        </div>
        <div className="bill-switch reveal" role="group" aria-label={t('pricing.billing')}>
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>
            {t('pricing.monthly')}
          </button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>
            {t('pricing.yearly')}
            <span>−10%</span>
          </button>
        </div>
        <div className={`pricing-grid${annual ? ' is-annual' : ''}`}>
          {planOrder.map((id) => {
            const plan = saasPlanCatalog[id];
            const name = t(`pricing.plans.${id}`).name;
            const featured = Boolean(plan.recommended);

            return (
              <article key={id} className="price-card reveal">
                <div className="price-flip">
                  <PriceFace side="month" plan={plan} name={name} featured={featured} hidden={annual} t={t} />
                  <PriceFace side="year" plan={plan} name={name} featured={featured} hidden={!annual} t={t} />
                </div>
              </article>
            );
          })}
        </div>
        <p className="pricing-note reveal">{t('pricing.note')}</p>
      </div>
    </section>
  );
}
