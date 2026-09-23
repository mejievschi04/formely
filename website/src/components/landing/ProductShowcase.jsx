import { useI18n } from '../../i18n/I18nContext';
import SectionTitle from './SectionTitle';

export default function ProductShowcase() {
  const { t } = useI18n();
  const items = t('showcase.items');

  return (
    <section className="section" id="produs" aria-labelledby="showcase-title">
      <div className="container">
        <p className="eyebrow reveal">{t('showcase.eyebrow')}</p>
        <SectionTitle id="showcase-title" lines={t('showcase.lines')} />
        <div className="showcase-grid">
          {items.map((item) => (
            <article key={item.id} className="showcase-card reveal">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
