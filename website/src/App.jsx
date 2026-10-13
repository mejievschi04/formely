import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import SiteLayout from './layouts/SiteLayout';
import HomePage from './pages/HomePage';
import OnboardingPage from './pages/OnboardingPage';
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

function linkLabel(anchor) {
  return (anchor.getAttribute('data-track') || anchor.textContent || '').replace(/\s+/g, ' ').trim();
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
      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (href.includes('/demo')) track('demo_click', lang, linkLabel(anchor));
      else if (href.includes('#contact')) track('cta_click', lang, linkLabel(anchor));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [lang]);

  useEffect(() => {
    const nodes = document.querySelectorAll('main section[id], main section[data-analytics]');
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio < 0.2) return;
          const label = entry.target.getAttribute('data-analytics') || entry.target.id;
          if (!label || seen.has(label)) return;
          seen.add(label);
          track('section_view', lang, label);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.2 },
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [pathname, lang]);

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
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="platforma" element={<Navigate to="/#cum-functioneaza" replace />} />
          <Route path="solutii" element={<Navigate to="/onboarding" replace />} />
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
