export const PLAN_LABELS = {
  instructor: 'Instructor',
  academie: 'Academie',
  business: 'Business',
};

export const STATUS_LABELS = {
  active: 'Activ',
  trial: 'Trial',
  suspended: 'Suspendat',
};

export const LEAD_STATUS = {
  new: 'Nouă',
  contacted: 'Contactată',
  qualified: 'Calificată',
  won: 'Câștigată',
  lost: 'Pierdută',
};

export const CONTACT_REASON_LABELS = {
  oferta: 'Ofertă / acces',
  plan: 'Ajutor la alegerea planului',
  altceva: 'Altceva',
  demo: 'Demo',
};

export const SOURCE_LABELS = {
  website: 'Site',
  'website-landing': 'Site',
  'website-contact': 'Site',
};

export function leadSource(lead) {
  return lead?.source_label
    || SOURCE_LABELS[lead?.source]
    || (lead?.source ? lead.source : 'Site');
}

export function leadReason(lead) {
  return CONTACT_REASON_LABELS[lead?.reason] || lead?.reason || '';
}

export const TRIAL_DAYS = 15;

export const REASON_LABELS = {
  trial_expired: 'Trial expirat',
  trial_ending: 'Trial se încheie în 7 zile',
  seats_full: 'Locuri cursanți ocupate',
  seats_high: 'Peste 85% locuri cursanți',
  staff_full: 'Locuri staff ocupate',
  suspended: 'Suspendată',
  watch: 'De urmărit',
};

/** Module live pe plan. Formely AI e în dezvoltare — nu se vinde aici. */
export const FEATURE_LABELS = {
  library: 'Bibliotecă',
  events: 'Evenimente',
  analyst_role: 'Rol analist',
};

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function seats(used, max) {
  if (max == null) return `${used ?? 0} / ∞`;
  return `${used ?? 0} / ${max}`;
}

export function seatPercent(used, max) {
  if (max == null || max <= 0) return null;
  return Math.min(100, Math.round(((used ?? 0) / max) * 100));
}

export function emptyFeatures() {
  return Object.keys(FEATURE_LABELS).reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
}

export function liveFeatures(features) {
  return Object.entries(FEATURE_LABELS)
    .filter(([key]) => features?.[key])
    .map(([, label]) => label);
}

export function hasUpcomingAi(features) {
  return Object.keys(features || {}).some((key) => key.startsWith('ai_') && features[key]);
}

export function featureSummary(features) {
  const live = liveFeatures(features);
  if (hasUpcomingAi(features)) live.push('Formely AI — în curând');
  return live.length ? live.join(' · ') : 'Cursuri, teste, progres și certificări.';
}

export function planSeatLabel(plan) {
  if (!plan) return '';
  if (plan.max_active_learners == null) return 'Cursanți nelimitați';
  return `Până la ${plan.max_active_learners} cursanți`;
}

export function errMessage(err, fallback) {
  return err?.response?.data?.message
    || err?.response?.data?.errors?.email?.[0]
    || Object.values(err?.response?.data?.errors || {})[0]?.[0]
    || err?.message
    || fallback;
}

/** YYYY-MM-DD for <input type="date"> from ISO string */
export function toDateInput(iso) {
  if (!iso) return '';
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ro-RO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(iso);
  }
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

/** Local midnight ISO for API date fields (nullable). */
export function dateInputToIso(value) {
  if (!value) return null;
  return `${value}T12:00:00.000Z`;
}
