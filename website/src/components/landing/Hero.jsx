import { useEffect, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  ClipboardCheck,
  FileText,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { demoUrl } from '../../data/site';

const ORBIT_ICONS = [BookOpen, Users, TrendingUp, ClipboardCheck, FileText, Award, Sparkles];

const FALLBACK = [
  { label: 'Traseu de onboarding' },
  { label: 'Invitații pe email' },
  { label: 'Raport pe fiecare angajat' },
  { label: 'Test la final de modul' },
  { label: 'Din PDF în curs' },
  { label: 'Notă minimă de trecere' },
  { label: 'Formely AI' },
];

function OrbitIcon({ index }) {
  const Icon = ORBIT_ICONS[index] || BookOpen;
  return <Icon aria-hidden="true" strokeWidth={1.75} />;
}

const STEP_MS = 1800;
const SPIN_MS = 560;

function cardAtNine(step, count) {
  return (count - (step % count)) % count;
}

export default function Hero() {
  const { t } = useI18n();
  const lines = t('hero.lines');
  const orbit = t('hero.orbit');
  const items = Array.isArray(orbit) && orbit.length ? orbit : FALLBACK;
  const count = items.length;
  const stepDeg = 360 / count;
  const [step, setStep] = useState(0);
  const [docked, setDocked] = useState(0);
  const [open, setOpen] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const hovering = hoverIndex != null;
  const shownIndex = hoverIndex ?? (open ?? (docked == null ? null : cardAtNine(docked, count)));
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
    <section className="hero" data-analytics="hero">
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
            <a className="btn btn-secondary" href={demoUrl} target="_blank" rel="noopener noreferrer">
              {t('hero.ctaSecondary')}
            </a>
          </div>
          <p className="hero-micro">{t('hero.note')}</p>
        </div>

        <div className="hero-visual-wrap reveal">
          <div className="hero-orbit" style={{ '--orbit-step': `${stepDeg}deg` }}>
            <div className="hero-logo-card">
              <img src="/logo.png" alt="" width={160} height={160} />
            </div>
            {items.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={`hero-emoji-card${shownIndex === index ? ' is-open' : ''}`}
                style={{ '--i': index, '--spin': `${step * stepDeg}deg` }}
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
