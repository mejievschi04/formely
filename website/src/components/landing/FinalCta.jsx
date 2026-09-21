import { useI18n } from '../../i18n/I18nContext';

export default function FinalCta() {
  const { t } = useI18n();

  return (
    <section className="section">
      <div className="container">
        <div className="final-cta reveal">
          <h2>{t('finalCta.title')}</h2>
          <p className="final-cta-sub">{t('finalCta.description')}</p>
          <a className="btn btn-primary" href="/#contact">
            {t('finalCta.cta')}
          </a>
        </div>
      </div>
    </section>
  );
}
