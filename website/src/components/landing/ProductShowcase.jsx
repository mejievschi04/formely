import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import ProductUiFrame from './ProductUiFrame';
import SectionTitle from './SectionTitle';

const SCREEN_BY_ID = {
  courses: 'aiSetup',
  tests: 'tests',
  progress: 'track',
  library: 'library',
};

export default function ProductShowcase() {
  const { t, lang } = useI18n();
  const items = t('showcase.items');
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [lang]);

  const current = items[active] || items[0];
  const screen = SCREEN_BY_ID[current?.id] || 'create';

  return (
    <section className="section" id="produs" aria-labelledby="showcase-title">
      <div className="container">
        <p className="eyebrow reveal">{t('showcase.eyebrow')}</p>
        <SectionTitle id="showcase-title" lines={t('showcase.lines')} />

        <div className="showcase-panel reveal">
          <div className="showcase-tabs" role="tablist" aria-label={t('showcase.eyebrow')}>
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`showcase-tab-${item.id}`}
                aria-selected={i === active}
                aria-controls="showcase-panel"
                className={`showcase-tab${i === active ? ' is-active' : ''}`}
                onClick={() => setActive(i)}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>

          <div
            className="showcase-stage"
            id="showcase-panel"
            role="tabpanel"
            aria-labelledby={current ? `showcase-tab-${current.id}` : undefined}
          >
            <div className="showcase-stage-copy">
              <h3>{current?.title}</h3>
              <p>{current?.text}</p>
            </div>
            <div className="showcase-stage-visual">
              <ProductUiFrame variant={screen} interactive resetKey={active} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
