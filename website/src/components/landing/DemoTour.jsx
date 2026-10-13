import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import ProductUiFrame from './ProductUiFrame';
import SectionTitle from './SectionTitle';

const STEP_MS = 4500;

export default function DemoTour() {
  const { t, lang } = useI18n();
  const steps = t('demoTour.steps');
  const [active, setActive] = useState(0);
  const pauseRef = useRef(false);

  useEffect(() => {
    setActive(0);
  }, [lang]);

  useEffect(() => {
    if (!Array.isArray(steps) || steps.length < 2) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const id = window.setInterval(() => {
      if (pauseRef.current) return;
      setActive((current) => (current + 1) % steps.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [steps]);

  const current = steps[active] || steps[0];

  return (
    <section className="section demo-tour" id="demo" aria-labelledby="demo-title">
      <div className="container">
        <p className="eyebrow reveal">{t('demoTour.eyebrow')}</p>
        <SectionTitle id="demo-title" lines={t('demoTour.lines')} />
        <p className="section-sub reveal">{t('demoTour.subtitle')}</p>

        <div
          className="demo-panel reveal"
          onMouseEnter={() => {
            pauseRef.current = true;
          }}
          onMouseLeave={() => {
            pauseRef.current = false;
          }}
        >
          <div className="demo-stage">
            <ProductUiFrame
              variant={current?.screen || 'create'}
              priority={active === 0}
              interactive
              resetKey={active}
            />
          </div>
          <div className="demo-rail">
            <ol className="demo-steps">
              {steps.map((step, i) => (
                <li key={step.title}>
                  <button
                    type="button"
                    className={`demo-step${i === active ? ' is-active' : ''}`}
                    aria-current={i === active ? 'step' : undefined}
                    onClick={() => setActive(i)}
                  >
                    <span className="demo-step-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="demo-step-body">
                      <strong>{step.title}</strong>
                      <span>{step.text}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <a className="btn btn-primary demo-cta" href="/#contact">
              {t('demoTour.cta')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
