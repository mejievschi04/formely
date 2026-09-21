import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import ProductUiFrame from './ProductUiFrame';

export default function Hero() {
  const { t } = useI18n();
  const visualRef = useRef(null);
  const [flat, setFlat] = useState(false);
  const lines = t('hero.lines');

  useEffect(() => {
    const el = visualRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.55) setFlat(true);
      },
      { threshold: [0.35, 0.55, 0.75] },
    );
    io.observe(el);
    const onScroll = () => {
      if (window.scrollY > 80) setFlat(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy reveal">
          <p className="eyebrow">{t('hero.eyebrow')}</p>
          <h1 className="hero-title">
            {Array.isArray(lines)
              ? lines.map((line) => (
                  <span key={line} className="hero-title-line">
                    {line}
                  </span>
                ))
              : lines}
          </h1>
          <p className="hero-sub">{t('hero.sub')}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="/#contact">
              {t('hero.ctaPrimary')}
            </a>
            <a className="btn btn-secondary" href="/#produs">
              {t('hero.ctaSecondary')}
            </a>
          </div>
        </div>
        <div className="hero-visual-wrap reveal" ref={visualRef}>
          <div className={`hero-visual${flat ? ' is-flat' : ''}`}>
            <ProductUiFrame variant="dashboard" />
          </div>
        </div>
      </div>
    </section>
  );
}
