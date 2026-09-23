import { useI18n } from '../../i18n/I18nContext';
import SectionTitle from './SectionTitle';

export default function WhyFormely() {
  const { t } = useI18n();
  const items = t('why.items');

  return (
    <section className="section" aria-labelledby="why-title">
      <div className="container">
        <SectionTitle id="why-title" lines={t('why.lines')} />
        <p className="section-sub reveal">{t('why.subtitle')}</p>
        <div className="why-board reveal">
          {items.map((item, index) => (
            <article key={item.title} className="why-item">
              <p className="why-index">{String(index + 1).padStart(2, '0')}</p>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
