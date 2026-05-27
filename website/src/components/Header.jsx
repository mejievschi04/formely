import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { nav, appUrl } from '../data/site';
import useFormelyTheme from '../hooks/useFormelyTheme';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isDark, toggleTheme } = useFormelyTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container site-header__inner">
        <Link to="/" className="logo" aria-label="Formely — pagina principală">
          <span className="logo__mark" aria-hidden="true">
            F
          </span>
          <span>Formely</span>
        </Link>

        <nav className="nav-desktop" aria-label="Navigare principală">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.end}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? 'Comută la tema deschisă' : 'Comută la tema închisă'}
          >
            {isDark ? '☀' : '☾'}
          </button>
          <div className="header-cta-group">
            <Link to="/contact" className="btn btn--secondary">
              Demo
            </Link>
            <a href={appUrl} className="btn btn--primary">
              Intră în platformă
            </a>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={mobileOpen}
            aria-controls="nav-mobile"
            onClick={() => setMobileOpen((o) => !o)}
          >
            ☰
          </button>
        </div>
      </div>

      <nav id="nav-mobile" className={`nav-mobile${mobileOpen ? ' is-open' : ''}`} aria-label="Meniu mobil">
        {nav.map((item) => (
          <NavLink key={item.href} to={item.href} end={item.end} onClick={() => setMobileOpen(false)}>
            {item.label}
          </NavLink>
        ))}
        <Link to="/contact" className="btn btn--secondary" onClick={() => setMobileOpen(false)}>
          Demo
        </Link>
        <a href={appUrl} className="btn btn--primary">
          Intră în platformă
        </a>
      </nav>
    </header>
  );
}
