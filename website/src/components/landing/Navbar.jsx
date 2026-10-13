import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';
import { appUrl, demoUrl } from '../../data/site';

const LINKS = [
  { href: '/#produs', key: 'nav.product' },
  { href: demoUrl, key: 'nav.how', external: true },
  { href: '/#preturi', key: 'nav.pricing' },
  { href: '/#faq', key: 'nav.faq' },
];

export default function Navbar() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const drawer = drawerRef.current;
    const elements = () => [...drawer.querySelectorAll('a[href], button:not([disabled])')];
    elements()[0]?.focus();
    function keydown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key !== 'Tab') return;
      const focusable = elements();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    drawer.addEventListener('keydown', keydown);
    return () => { drawer.removeEventListener('keydown', keydown); triggerRef.current?.focus(); };
  }, [open]);

  return (
    <>
      <header className="nav">
        <Link to="/" className="nav-brand" aria-label="Formely">
          <img src="/logo.png" alt="" width={28} height={28} />
          <span>Formely</span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {t(item.key)}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <a className="nav-login" href={appUrl}>
            {t('nav.login')}
          </a>
          <a className="btn btn-primary nav-cta" href="/#contact">
            {t('nav.cta')}
          </a>
          <button
            type="button"
            className="nav-burger"
            ref={triggerRef}
            aria-label={open ? t('nav.close') : t('nav.menu')}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
          </button>
        </div>
      </header>

      {open ? (
        <div ref={drawerRef} className="nav-drawer is-open" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <div className="nav-drawer-top">
            <Link to="/" className="nav-brand" onClick={() => setOpen(false)}>
              <img src="/logo.png" alt="" width={28} height={28} />
              <span>Formely</span>
            </Link>
            <button type="button" className="nav-burger" aria-label={t('nav.close')} onClick={() => setOpen(false)}>
              <span />
            </button>
          </div>
          {LINKS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              onClick={() => setOpen(false)}
              {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {t(item.key)}
            </a>
          ))}
          <a className="nav-drawer-login" href={appUrl} onClick={() => setOpen(false)}>
            {t('nav.login')}
          </a>
          <a className="btn btn-primary" href="/#contact" onClick={() => setOpen(false)}>
            {t('nav.cta')}
          </a>
        </div>
      ) : null}
    </>
  );
}
