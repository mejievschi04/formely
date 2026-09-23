import { useI18n } from '../../i18n/I18nContext';

export default function FinalCta() {
  const { t } = useI18n();

  return (
    <section className="section" aria-labelledby="final-cta-title">
      <div className="container">
        <div className="final-cta reveal">
          <div className="final-cta-glow" aria-hidden="true" />
          <div className="final-cta-grid" aria-hidden="true" />
          <h2 id="final-cta-title">{t('finalCta.title')}</h2>
          <p className="final-cta-sub">{t('finalCta.description')}</p>
          <a className="btn btn-primary" href="/#contact">
            {t('finalCta.cta')}
          </a>
        </div>
      </div>
    </section>
  );
}
