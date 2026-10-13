export const site = {
  name: 'Formely',
  email: 'contact@formely.org',
  phone: '+37376907298',
  phoneDisplay: '+373 769 07 298',
  /** Denumire juridică + sediu — completează înainte de launch (ex. din env la build). */
  legalName: import.meta.env.VITE_LEGAL_NAME || '',
  address: import.meta.env.VITE_LEGAL_ADDRESS || '',
  privacyUpdated: '2026-10-12',
};

export const appUrl = import.meta.env.VITE_APP_URL || 'http://localhost:5173';
/** Academia demo live — one-click login pe LMS (`/demo`). */
export const demoUrl = import.meta.env.VITE_DEMO_URL || `${appUrl.replace(/\/$/, '')}/demo`;
export const siteUrl = import.meta.env.VITE_SITE_URL || 'https://formely.org';

export const LOCALE_META = {
  ro: { label: 'RO', htmlLang: 'ro', ogLocale: 'ro_RO' },
  en: { label: 'EN', htmlLang: 'en', ogLocale: 'en_US' },
  ru: { label: 'RU', htmlLang: 'ru', ogLocale: 'ru_RU' },
  it: { label: 'IT', htmlLang: 'it', ogLocale: 'it_IT' },
};
