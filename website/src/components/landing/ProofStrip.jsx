import { useI18n } from '../../i18n/I18nContext';

export default function ProofStrip() {
  const { t } = useI18n();
  const items = t('proof.items');
  const lines = t('proof.lines');

  return (
    <section className="section proof" aria-labelledby="proof-title">
      <div className="container">
        <div className="proof-head reveal">
          <p className="eyebrow">{t('proof.eyebrow')}</p>
          <h2 id="proof-title" className="section-title proof-title">
            {Array.isArray(lines)
              ? lines.map((line) => (
                  <span key={line} className="proof-title-line">
                    {line}{' '}
                  </span>
                ))
              : lines}
          </h2>
        </div>
        <div className="proof-grid">
          {items.map((item) => (
            <article key={item.label} className="proof-card reveal">
              <p className="proof-value">{item.value}</p>
              <h3 className="proof-label">{item.label}</h3>
              <p className="proof-text">{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
