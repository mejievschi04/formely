import { useI18n } from '../../i18n/I18nContext';

export default function TrustStrip() {
  const { t } = useI18n();
  const items = t('trust.items');

  return (
    <section className="section trust" data-analytics="trust" aria-labelledby="trust-title">
      <div className="container">
        <div className="trust-head reveal">
          <div className="trust-brand">
            <img src="/logo.png" alt="Formely" width={40} height={40} />
            <div>
              <p className="eyebrow">{t('trust.eyebrow')}</p>
              <h2 id="trust-title" className="section-title">
                {t('trust.title')}
              </h2>
            </div>
          </div>
          <p className="section-sub">{t('trust.subtitle')}</p>
        </div>
        <ul className="trust-grid">
          {items.map((item) => (
            <li key={item.title} className="trust-card reveal">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
        <p className="trust-note reveal">{t('trust.note')}</p>
      </div>
    </section>
  );
}
