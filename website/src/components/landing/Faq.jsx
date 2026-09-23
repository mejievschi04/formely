import { useI18n } from '../../i18n/I18nContext';

export default function Faq() {
  const { t } = useI18n();
  const items = t('faq.items');

  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="container faq-layout">
        <h2 id="faq-title" className="section-title reveal">
          {t('faq.title')}
        </h2>
        <div className="faq-cols reveal">
          {[items.slice(0, 3), items.slice(3, 6)].map((column) => (
            <div key={column[0].q} className="faq-board">
              {column.map((item) => {
                const number = items.indexOf(item) + 1;
                return (
                  <details key={item.q} name="faq" className="faq-item">
                    <summary>
                      <span className="faq-index">{String(number).padStart(2, '0')}</span>
                      <span>{item.q}</span>
                    </summary>
                    <p>{item.a}</p>
                  </details>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
