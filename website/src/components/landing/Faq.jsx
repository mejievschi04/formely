import { useI18n } from '../../i18n/I18nContext';

export default function Faq() {
  const { t } = useI18n();
  const items = t('faq.items');

  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="container">
        <h2 id="faq-title" className="section-title reveal">
          {t('faq.title')}
        </h2>
        <div className="faq-list">
          {items.map((item) => (
            <details key={item.q} className="faq-item reveal">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
