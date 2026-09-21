import { useI18n } from '../../i18n/I18nContext';
import ProductUiFrame from './ProductUiFrame';

export default function Analytics() {
  const { t } = useI18n();
  const metrics = t('analytics.metrics');

  return (
    <section className="section" aria-labelledby="analytics-title">
      <div className="container">
        <h2 id="analytics-title" className="section-title reveal">
          {t('analytics.title')}
        </h2>
        <p className="section-sub reveal">{t('analytics.subtitle')}</p>
        <div className="analytics-grid">
          <ul className="metrics-list reveal">
            {metrics.map((m) => (
              <li key={m.label} className="metric-chip">
                {m.label}
              </li>
            ))}
          </ul>
          <div className="reveal">
            <ProductUiFrame variant="analytics" />
          </div>
        </div>
      </div>
    </section>
  );
}
