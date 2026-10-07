import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ro from '../locales/ro.json';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import it from '../locales/it.json';
import { LOCALE_META } from '../data/site';

const dictionaries = { ro, en, ru, it };
const STORAGE_KEY = 'formely-site-lang';
const SUPPORTED = Object.keys(LOCALE_META);

const I18nContext = createContext(null);

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);
}

/** Limba aleasă manual (din footer) are prioritate; altfel limba sistemului: ro/ru/it, restul în engleză. */
function detectInitialLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  if (typeof window === 'undefined') return 'ro';
  // Roboții de căutare (setați pe engleză) trebuie să indexeze versiunea principală, în română.
  if (/bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent || '')) return 'ro';

  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    const code = String(tag || '').toLowerCase().split('-')[0];
    if (code === 'mo') return 'ro';
    if (['ro', 'ru', 'it'].includes(code)) return code;
  }
  return 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang);

  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('lang', LOCALE_META[lang].htmlLang);
    document.documentElement.setAttribute('data-theme', 'dark');
  }, [lang]);

  const dict = dictionaries[lang] || dictionaries.ro;

  const t = useCallback(
    (path, vars) => {
      let value = resolvePath(dict, path);
      if (value == null) value = resolvePath(dictionaries.ro, path);
      if (value == null) return path;
      if (typeof value !== 'string') return value;
      if (!vars) return value;
      return Object.entries(vars).reduce(
        (str, [k, v]) => str.replaceAll(`{${k}}`, String(v)),
        value,
      );
    },
    [dict],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, meta: LOCALE_META[lang], supported: SUPPORTED }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
