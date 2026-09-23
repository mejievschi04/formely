import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';

const FALLBACK = [
  { emoji: '📚', label: 'Cursuri clare' },
  { emoji: '👥', label: 'Echipe organizate' },
  { emoji: '📈', label: 'Progres vizibil' },
  { emoji: '✅', label: 'Teste integrate' },
  { emoji: '🎓', label: 'Rezultate clare' },
  { emoji: '📝', label: 'Lecții la loc' },
];

const STEP_MS = 1800;

export default function Hero() {
  const { t } = useI18n();
  const lines = t('hero.lines');
  const orbit = t('hero.orbit');
  const items = Array.isArray(orbit) ? orbit : FALLBACK;
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (hovering || open != null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    const id = window.setInterval(() => setStep((current) => current + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, [hovering, open]);

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
            <a className="btn btn-secondary" href="/#cum-functioneaza">
              {t('hero.ctaSecondary')}
            </a>
          </div>
        </div>

        <div className="hero-visual-wrap reveal">
          <svg className="hero-emoji-filter" aria-hidden="true" width="0" height="0">
            <filter id="hero-emoji-brand" colorInterpolationFilters="sRGB">
              <feColorMatrix
                in="SourceGraphic"
                type="matrix"
                values="0.2126 0.7152 0.0722 0 0
                        0.2126 0.7152 0.0722 0 0
                        0.2126 0.7152 0.0722 0 0
                        0 0 0 1 0"
                result="gray"
              />
              <feComponentTransfer in="gray">
                <feFuncR type="table" tableValues="0.035 0.647" />
                <feFuncG type="table" tableValues="0.455 0.953" />
                <feFuncB type="table" tableValues="0.565 0.988" />
              </feComponentTransfer>
            </filter>
          </svg>
          <div className="hero-orbit">
            <div className="hero-logo-card">
              <img src="/logo.png" alt="" width={160} height={160} />
            </div>
            {items.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={`hero-emoji-card${open === index ? ' is-open' : ''}`}
                style={{ '--i': index, '--spin': `${step * 60}deg` }}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                onFocus={() => setHovering(true)}
                onBlur={() => setHovering(false)}
                onClick={() => {
                  if (window.matchMedia('(hover: hover)').matches) return;
                  setOpen((current) => (current === index ? null : index));
                }}
              >
                <span className="hero-emoji-glyph" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="hero-emoji-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
