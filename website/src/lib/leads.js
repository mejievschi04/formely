/**
 * Trimite o cerere de acces către API-ul Formely (apoi apare în backoffice).
 * VITE_API_URL: gol (dev, proxy Vite) sau origin fără /api (ex. http://localhost:8000).
 */
function apiOrigin() {
  const raw = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  return raw.replace(/\/api$/i, '');
}

export async function submitLead(payload) {
  const res = await fetch(`${apiOrigin()}/api/leads`, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      company_name: payload.company_name || null,
      reason: payload.reason || 'oferta',
      plan_interest: payload.plan_interest || null,
      message: payload.message || null,
      source: payload.source || 'website',
      privacy_accepted: payload.privacy_accepted === true || payload.privacy_accepted === 1 || payload.privacy_accepted === '1' || payload.privacy_accepted === 'true' || payload.privacy_accepted === 'on',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fromFields = Object.values(data.errors || {})[0]?.[0];
    throw new Error(fromFields || data.message || 'Nu am putut trimite solicitarea.');
  }
  return data;
}
