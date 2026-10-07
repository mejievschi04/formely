/**
 * Statistici proprii, anonime (fără cookie-uri): vizite, click-uri pe CTA, formular început, cerere trimisă.
 * Ajung în backoffice → Statistici. Erorile sunt ignorate, ca site-ul să nu depindă de ele.
 */
import { readAttribution } from './attribution';
import { apiOrigin } from './leads';

export function track(type, lang) {
  if (typeof window === 'undefined') return;
  const referrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null;
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
        attribution: readAttribution(),
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
