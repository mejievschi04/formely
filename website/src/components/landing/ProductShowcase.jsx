import { useI18n } from '../../i18n/I18nContext';
import ProductUiFrame from './ProductUiFrame';

const FRAME_BY_ID = {
  courses: 'courses',
  tests: 'tests',
  progress: 'progress',
  library: 'library',
};

export default function ProductShowcase() {
  const { t } = useI18n();
  const items = t('showcase.items');

  return (
    <section className="section" id="produs" aria-labelledby="showcase-title">
      <div className="container">
        <p className="eyebrow reveal">{t('showcase.eyebrow')}</p>
        <h2 id="showcase-title" className="section-title reveal">
          {t('showcase.title')}
        </h2>
        <div className="showcase-list">
          {items.map((item, index) => (
            <article
              key={item.id}
              className={`showcase-row${index % 2 === 1 ? ' is-reverse' : ''} reveal`}
            >
              <div className="showcase-copy">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
              <div className="showcase-visual">
                <ProductUiFrame variant={FRAME_BY_ID[item.id] || 'dashboard'} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
