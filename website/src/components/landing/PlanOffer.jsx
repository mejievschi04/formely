import { useI18n } from '../../i18n/I18nContext';
import { planFeatureIncluded, planFeatureOrder, saasPlanCatalog } from '../../data/plans';

export function PlanLimits({ planId }) {
  const { t } = useI18n();
  const plan = saasPlanCatalog[planId];
  const learners =
    plan.max_active_learners == null
      ? t('pricing.learnersUnlimited')
      : t('pricing.learners', { n: plan.max_active_learners });

  return (
    <p className="price-limits">
      <span>{learners}</span>
      <span>{t('pricing.staff', { n: plan.max_staff })}</span>
    </p>
  );
}

export function PlanFeatureList({ planId }) {
  const { t } = useI18n();

  return (
    <ul className="price-features">
      {planFeatureOrder.map((featureId) => {
        const included = planFeatureIncluded[featureId].includes(planId);
        return (
          <li key={featureId} className={included ? 'is-on' : 'is-off'}>
            <span className="price-mark" aria-hidden="true">{included ? '+' : '−'}</span>
            <span>
              <span className="price-sr">{included ? t('pricing.included') : t('pricing.excluded')}. </span>
              {t(`pricing.features.${featureId}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
