import { Link } from 'react-router-dom';
import { site, appUrl } from '../data/site';

const footerNav = {
  produs: [
    { to: '/', label: 'Acasă' },
    { to: '/platforma', label: 'Platformă' },
    { to: '/solutii', label: 'Soluții' },
    { to: '/preturi', label: 'Prețuri' },
    { to: appUrl, label: 'Aplicație LMS', external: true },
  ],
  companie: [
    { to: '/despre', label: 'Despre' },
    { to: '/blog', label: 'Resurse' },
    { to: '/contact', label: 'Contact' },
  ],
  legal: [
    { to: '/legal/confidentialitate', label: 'Confidențialitate' },
    { to: '/legal/termeni', label: 'Termeni' },
  ],
};

function FooterLink({ to, label, external }) {
  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  return <Link to={to}>{label}</Link>;
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" className="logo site-footer__logo">
            <span className="logo__mark" aria-hidden="true">
              F
            </span>
            <span>Formely</span>
          </Link>
          <p className="site-footer__tagline">{site.tagline}</p>
          <Link to="/contact" className="btn btn--primary site-footer__cta">
            Programează demo
          </Link>
          <a href={`mailto:${site.email}`} className="site-footer__email">
            {site.email}
          </a>
        </div>

        <div className="site-footer__columns">
          <div className="site-footer__col">
            <h3>Produs</h3>
            <ul>
              {footerNav.produs.map((item) => (
                <li key={item.label}>
                  <FooterLink {...item} />
                </li>
              ))}
            </ul>
          </div>
          <div className="site-footer__col">
            <h3>Companie</h3>
            <ul>
              {footerNav.companie.map((item) => (
                <li key={item.label}>
                  <FooterLink {...item} />
                </li>
              ))}
            </ul>
          </div>
          <div className="site-footer__col">
            <h3>Legal</h3>
            <ul>
              {footerNav.legal.map((item) => (
                <li key={item.label}>
                  <FooterLink {...item} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="site-footer__bar">
        <div className="container site-footer__bar-inner">
          <span>
            © {year} {site.name}. Toate drepturile rezervate.
          </span>
          <span className="site-footer__locale">Română</span>
        </div>
      </div>
    </footer>
  );
}
