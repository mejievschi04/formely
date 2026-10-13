/**
 * Statistici proprii, anonime (fără cookie-uri): vizite, secțiuni, butoane, formular, cerere.
 * Ajung în backoffice → Statistici. Erorile sunt ignorate, ca site-ul să nu depindă de ele.
 */
import { readAttribution } from './attribution';
import { apiOrigin } from './leads';

export function track(type, lang, label) {
  if (typeof window === 'undefined') return;
  const referrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null;
  const clean = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  try {
    fetch(`${apiOrigin()}/api/track`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        type,
        path: window.location.pathname,
        referrer,
        lang,
        label: clean || null,
        attribution: readAttribution(),
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
