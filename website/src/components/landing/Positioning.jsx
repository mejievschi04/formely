import { useI18n } from '../../i18n/I18nContext';

export default function Positioning() {
  const { t } = useI18n();
  const items = t('positioning.items');

  return (
    <section className="section" aria-labelledby="pos-title">
      <div className="container">
        <h2 id="pos-title" className="section-title reveal">
          {t('positioning.title')}
        </h2>
        <div className="pos-grid">
          {items.map((item) => (
            <article key={item.title} className="pos-card reveal">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
