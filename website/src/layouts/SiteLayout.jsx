import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { OrganizationJsonLd, SoftwareJsonLd } from '../components/JsonLd';

export default function SiteLayout() {
  return (
    <>
      <OrganizationJsonLd />
      <SoftwareJsonLd />
      <a href="#main" className="skip-link">Sari la conținut</a>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
