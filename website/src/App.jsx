import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import SiteLayout from './layouts/SiteLayout';
import HomePage from './pages/HomePage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import NotFoundPage from './pages/NotFoundPage';
import { useI18n } from './i18n/I18nContext';
import { track } from './lib/track';

function ContactToHome() {
  const [params] = useSearchParams();
  const qs = params.toString();
  return <Navigate to={`/${qs ? `?${qs}` : ''}#contact`} replace />;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Tracker() {
  const { pathname } = useLocation();
  const { lang } = useI18n();

  useEffect(() => {
    track('pageview', lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onClick = (event) => {
      if (event.target.closest?.('a[href*="#contact"]')) track('cta_click', lang);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [lang]);

  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Tracker />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="platforma" element={<Navigate to="/#produs" replace />} />
          <Route path="solutii" element={<Navigate to="/" replace />} />
          <Route path="preturi" element={<Navigate to="/#preturi" replace />} />
          <Route path="despre" element={<Navigate to="/" replace />} />
          <Route path="contact" element={<ContactToHome />} />
          <Route path="blog/*" element={<Navigate to="/" replace />} />
          <Route path="legal/confidentialitate" element={<PrivacyPage />} />
          <Route path="legal/termeni" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
