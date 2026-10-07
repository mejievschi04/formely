import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';
import LangSelect from './LangSelect';
import { site } from '../../data/site';

export default function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <img src="/logo.png" alt="" width={28} height={28} />
          <strong>Formely</strong>
          <p>{t('footer.tagline')}</p>
        </div>

        <div className="footer-cols">
          <div className="footer-col">
            <h4>{t('footer.product')}</h4>
            <a href="/#produs">{t('footer.features')}</a>
            <a href="/#preturi">{t('footer.pricing')}</a>
          </div>
          <div className="footer-col">
            <h4>{t('footer.resources')}</h4>
            <a href="/#faq">{t('footer.faq')}</a>
            <a href="/#contact">{t('footer.contact')}</a>
            <a className="footer-phone" href={`tel:${site.phone}`}>{site.phoneDisplay}</a>
            <a className="footer-phone" href={`mailto:${site.email}`}>{site.email}</a>
          </div>
          <div className="footer-col">
            <h4>{t('footer.legal')}</h4>
            <Link to="/legal/confidentialitate">{t('footer.privacy')}</Link>
            <Link to="/legal/termeni">{t('footer.terms')}</Link>
            <Link to="/legal/confidentialitate#cookies">{t('footer.cookies')}</Link>
          </div>
          <div className="footer-col">
            <h4>{t('footer.languages')}</h4>
            <div style={{ marginTop: '0.35rem' }}>
              <LangSelect />
            </div>
          </div>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>{t('footer.rights', { year })}</span>
        <span className="footer-credit">{t('footer.credit')}</span>
      </div>
    </footer>
  );
}
