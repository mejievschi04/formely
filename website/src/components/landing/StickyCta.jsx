import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';

const COOKIE_KEY = 'formely-cookie-notice';
const MARKETING_PATHS = new Set(['/', '/onboarding']);

function cookieStillOpen() {
  try {
    return localStorage.getItem(COOKIE_KEY) !== '1';
  } catch {
    return true;
  }
}

export default function StickyCta() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const href = pathname === '/' ? '/#contact' : '#contact';

  useEffect(() => {
    if (!MARKETING_PATHS.has(pathname)) {
      setVisible(false);
      return undefined;
    }

    const hero = document.querySelector('.hero');
    const contact = document.getElementById('contact');
    if (!hero || !contact) return undefined;

    let pastHero = false;
    let nearContact = false;

    const sync = () => {
      setVisible(pastHero && !nearContact && !cookieStillOpen());
    };

    const heroIo = new IntersectionObserver(
      ([entry]) => {
        pastHero = !entry.isIntersecting;
        sync();
      },
      { threshold: 0.15 },
    );
    const contactIo = new IntersectionObserver(
      ([entry]) => {
        nearContact = entry.isIntersecting;
        sync();
      },
      { threshold: 0.2, rootMargin: '0px 0px 20% 0px' },
    );

    heroIo.observe(hero);
    contactIo.observe(contact);

    window.addEventListener('formely-cookie-dismissed', sync);
    window.addEventListener('storage', sync);
    sync();

    return () => {
      heroIo.disconnect();
      contactIo.disconnect();
      window.removeEventListener('formely-cookie-dismissed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="sticky-cta" role="region" aria-label={t('sticky.cta')}>
      <a className="btn btn-primary sticky-cta-btn" href={href}>
        {t('sticky.cta')}
      </a>
    </div>
  );
}
