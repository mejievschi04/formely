/**
 * Parametrii de campanie (UTM, fbclid) din link-ul reclamei, păstrați pe durata sesiunii
 * ca să ajungă la lead chiar dacă vizitatorul navighează prin pagină înainte de formular.
 */
const STORAGE_KEY = 'formely-attribution';
const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];

export function captureAttribution() {
  const params = new URLSearchParams(window.location.search);
  const found = {};
  KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) found[key] = value;
  });
  if (!Object.keys(found).length) return;
  found.landing = window.location.pathname;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
  } catch {
    /* ignore */
  }
}

export function readAttribution() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
