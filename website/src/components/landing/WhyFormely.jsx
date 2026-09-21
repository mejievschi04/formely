import { useI18n } from '../../i18n/I18nContext';

export default function WhyFormely() {
  const { t } = useI18n();
  const items = t('why.items');

  return (
    <section className="section" aria-labelledby="why-title">
      <div className="container">
        <h2 id="why-title" className="section-title reveal">
          {t('why.title')}
        </h2>
        <p className="section-sub reveal">{t('why.subtitle')}</p>
        <div className="why-grid">
          {items.map((item) => (
            <article key={item.title} className="why-card reveal">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
