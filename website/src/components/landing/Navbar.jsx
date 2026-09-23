import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';
import { appUrl } from '../../data/site';
import LangSelect from './LangSelect';

const LINKS = [
  { href: '/#produs', key: 'nav.product' },
  { href: '/#cum-functioneaza', key: 'nav.how' },
  { href: '/#preturi', key: 'nav.pricing' },
  { href: '/#faq', key: 'nav.faq' },
];

export default function Navbar() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
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
            <a key={item.href} href={item.href}>
              {t(item.key)}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <LangSelect />
          <a className="nav-login" href={appUrl}>
            {t('nav.login')}
          </a>
          <a className="btn btn-primary nav-cta" href="/#contact">
            {t('nav.cta')}
          </a>
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? t('nav.close') : t('nav.menu')}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
          </button>
        </div>
      </header>

      {open ? (
        <div className="nav-drawer is-open" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
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
            <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {t(item.key)}
            </a>
          ))}
          <a className="nav-drawer-login" href={appUrl} onClick={() => setOpen(false)}>
            {t('nav.login')}
          </a>
          <a className="btn btn-primary" href="/#contact" onClick={() => setOpen(false)}>
            {t('nav.cta')}
          </a>
          <div style={{ marginTop: '1rem' }}>
            <LangSelect />
          </div>
        </div>
      ) : null}
    </>
  );
}
