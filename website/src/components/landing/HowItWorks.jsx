import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import HowScheme from './HowScheme';
import SectionTitle from './SectionTitle';

export default function HowItWorks() {
  const { t, lang } = useI18n();
  const steps = t('how.steps');
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [lang]);

  const current = steps[active] || steps[0];

  return (
    <section className="section how" id="cum-functioneaza" aria-labelledby="how-title">
      <div className="container">
        <p className="eyebrow reveal">{t('how.eyebrow')}</p>
        <SectionTitle id="how-title" lines={t('how.lines')} />
        <p className="section-sub reveal">{t('how.subtitle')}</p>

        <div className="how-panel reveal">
          <div className="how-tabs" role="tablist" aria-label={t('how.eyebrow')}>
            {steps.map((step, i) => (
              <button
                key={step.num}
                type="button"
                role="tab"
                id={`how-tab-${step.num}`}
                aria-selected={i === active}
                aria-controls="how-panel"
                className={`how-tab${i === active ? ' is-active' : ''}`}
                onClick={() => setActive(i)}
              >
                <span className="how-tab-num">{step.num}</span>
                <span className="how-tab-body">
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </span>
              </button>
            ))}
          </div>

          <div
            className="how-stage"
            id="how-panel"
            role="tabpanel"
            aria-labelledby={current ? `how-tab-${current.num}` : undefined}
          >
            <div className="how-stage-copy">
              <h3>{current?.title}</h3>
              <p>{current?.text}</p>
            </div>
            <div className="how-stage-visual">
              <HowScheme step={active} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
