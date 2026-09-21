import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import ProductUiFrame from './ProductUiFrame';

const FRAME_BY_TAB = {
  corporate: 'people',
  academy: 'courses',
  instructor: 'progress',
};

export default function UseCases() {
  const { t, lang } = useI18n();
  const tabs = t('useCases.tabs');
  const [active, setActive] = useState('corporate');

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === active) && tabs[0]) {
      setActive(tabs[0].id);
    }
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = tabs.find((tab) => tab.id === active) || tabs[0];

  return (
    <section className="section" id="solutii" aria-labelledby="uc-title">
      <div className="container">
        <h2 id="uc-title" className="section-title reveal">
          {t('useCases.title')}
        </h2>
        <p className="section-sub reveal">{t('useCases.subtitle')}</p>
        <div className="uc-tabs reveal" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === active}
              className={`uc-tab${tab.id === active ? ' is-active' : ''}`}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {current && (
          <div className="uc-panel reveal" role="tabpanel">
            <div>
              <h3>{current.title}</h3>
              <p>{current.text}</p>
              <ul className="uc-points">
                {current.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <ProductUiFrame variant={FRAME_BY_TAB[current.id] || 'dashboard'} />
          </div>
        )}
      </div>
    </section>
  );
}
