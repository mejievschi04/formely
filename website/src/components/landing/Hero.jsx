import { useEffect, useRef, useState } from 'react';
import { Award, BookOpen, ClipboardCheck, FileText, TrendingUp, Users } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

const ORBIT_ICONS = [BookOpen, Users, TrendingUp, ClipboardCheck, FileText, Award];

const FALLBACK = [
  { label: 'Creează cursuri' },
  { label: 'Gestionează echipa' },
  { label: 'Urmărește progresul' },
  { label: 'Evaluează cunoștințele' },
  { label: 'Organizează conținutul' },
  { label: 'Măsoară rezultatele' },
];

function OrbitIcon({ index }) {
  const Icon = ORBIT_ICONS[index] || BookOpen;
  return <Icon aria-hidden="true" strokeWidth={1.75} />;
}

const STEP_MS = 1800;
const SPIN_MS = 560;

function cardAtNine(step) {
  return (6 - (step % 6)) % 6;
}

export default function Hero() {
  const { t } = useI18n();
  const lines = t('hero.lines');
  const orbit = t('hero.orbit');
  const items = Array.isArray(orbit) ? orbit : FALLBACK;
  const [step, setStep] = useState(0);
  const [docked, setDocked] = useState(0);
  const [open, setOpen] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const hovering = hoverIndex != null;
  const shownIndex = hoverIndex ?? (open ?? (docked == null ? null : cardAtNine(docked)));
  const pauseRef = useRef(false);
  pauseRef.current = hovering || open != null;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = window.setInterval(() => {
      if (pauseRef.current) return;
      setStep((current) => current + 1);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (step === 0) return undefined;
    setDocked(null);
    const id = window.setTimeout(() => setDocked(step), SPIN_MS);
    return () => window.clearTimeout(id);
  }, [step]);

  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy reveal">
          <p className="eyebrow">{t('hero.eyebrow')}</p>
          <h1 className="hero-title">
            {Array.isArray(lines)
              ? lines.map((line) => (
                  <span key={line} className="hero-title-line">
                    {line}{' '}
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
          <p className="hero-micro">{t('hero.note')}</p>
        </div>

        <div className="hero-visual-wrap reveal">
          <div className="hero-orbit">
            <div className="hero-logo-card">
              <img src="/logo.png" alt="" width={160} height={160} />
            </div>
            {items.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={`hero-emoji-card${shownIndex === index ? ' is-open' : ''}`}
                style={{ '--i': index, '--spin': `${step * 60}deg` }}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoverIndex(index)}
                onBlur={() => setHoverIndex((current) => (current === index ? null : current))}
                onClick={() => {
                  if (window.matchMedia('(hover: hover)').matches) return;
                  setOpen((current) => (current === index ? null : index));
                }}
              >
                <span className="hero-emoji-glyph" aria-hidden="true">
                  <OrbitIcon index={index} />
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
