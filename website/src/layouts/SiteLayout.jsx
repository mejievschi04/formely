import { Outlet } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import CookieNotice from '../components/landing/CookieNotice';
import { useI18n } from '../i18n/I18nContext';
import { OrganizationJsonLd, SoftwareJsonLd } from '../components/JsonLd';

export default function SiteLayout() {
  const { t } = useI18n();

  return (
    <>
      <OrganizationJsonLd />
      <SoftwareJsonLd />
      <a href="#main" className="skip-link">
        {t('nav.skip')}
      </a>
      <Navbar />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <CookieNotice />
    </>
  );
}
