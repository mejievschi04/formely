import { useI18n } from '../../i18n/I18nContext';
import { planFeatureIncluded, planFeatureOrder, planOrder, saasPlanCatalog } from '../../data/plans';

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
      <span>{t('pricing.aiCredits', { n: plan.ai_credits })}</span>
    </p>
  );
}

/** Arată doar ce include planul; planurile mai mari pornesc de la „Tot din <planul anterior>, plus:”. */
export function PlanFeatureList({ planId }) {
  const { t } = useI18n();
  const previousId = planOrder[planOrder.indexOf(planId) - 1];
  const features = planFeatureOrder.filter(
    (featureId) =>
      planFeatureIncluded[featureId].includes(planId) &&
      !(previousId && planFeatureIncluded[featureId].includes(previousId)),
  );

  return (
    <>
      {previousId && (
        <p className="price-features-base">
          {t('pricing.everythingIn', { plan: t(`pricing.plans.${previousId}`).name })}
        </p>
      )}
      <ul className="price-features">
        {features.map((featureId) => (
          <li key={featureId} className="is-on">
            <span className="price-mark" aria-hidden="true">+</span>
            <span>{t(`pricing.features.${featureId}`)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
