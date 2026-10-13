import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';
import { submitLead } from '../../lib/leads';
import { track } from '../../lib/track';
import { planOrder } from '../../data/plans';

export default function Contact({ leadSource = 'website-landing' }) {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const planFromUrl = searchParams.get('plan') || '';
  const sourceFromUrl = searchParams.get('source') || '';
  const resolvedSource = sourceFromUrl || leadSource;
  const [form, setForm] = useState({
    name: '',
    email: '',
    org: '',
    plan_interest: planOrder.includes(planFromUrl) ? planFromUrl : '',
    privacy_accepted: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (planOrder.includes(planFromUrl)) {
      setForm((prev) => ({ ...prev, plan_interest: planFromUrl }));
    }
  }, [planFromUrl]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const updateChecked = (field) => (e) => setForm({ ...form, [field]: e.target.checked });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.privacy_accepted) {
      setError(t('contact.consentRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitLead({
        name: form.name,
        email: form.email,
        company_name: form.org,
        plan_interest: form.plan_interest || null,
        source: resolvedSource,
        privacy_accepted: true,
      });
      setDone(true);
      track('lead', lang);
    } catch (err) {
      setError(err.message || t('contact.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section" id="contact" aria-labelledby="contact-title">
      <div className="container contact-grid">
        <div className="reveal">
          <h2 id="contact-title" className="section-title">
            {t('contact.title')}
          </h2>
          <p className="section-sub">{t('contact.subtitle')}</p>
        </div>

        {done ? (
          <p className="form-msg is-ok reveal" role="status">{t('contact.success')}</p>
        ) : (
          <form
            className="contact-form reveal"
            onSubmit={handleSubmit}
            onFocus={() => {
              if (started) return;
              setStarted(true);
              track('form_start', lang);
            }}
          >
            <div className="contact-form-row">
              <div className="field">
                <label htmlFor="lead-name">{t('contact.name')}</label>
                <input
                  id="lead-name"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={update('name')}
                />
              </div>
              <div className="field">
                <label htmlFor="lead-email">{t('contact.email')}</label>
                <input
                  id="lead-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={update('email')}
                />
              </div>
            </div>
            <div className="contact-form-row contact-form-optional">
              <div className="field">
                <label htmlFor="lead-org">{t('contact.org')}</label>
                <input id="lead-org" autoComplete="organization" value={form.org} onChange={update('org')} />
              </div>
              <div className="field">
                <label htmlFor="lead-plan">{t('contact.plan')}</label>
                <select id="lead-plan" value={form.plan_interest} onChange={update('plan_interest')}>
                  <option value="">—</option>
                  {planOrder.map((id) => (
                    <option key={id} value={id}>
                      {t(`pricing.plans.${id}.name`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field field-consent">
              <label htmlFor="lead-consent" className="consent-label">
                <input
                  id="lead-consent"
                  type="checkbox"
                  checked={form.privacy_accepted}
                  onChange={updateChecked('privacy_accepted')}
                  required
                />
                <span>
                  {t('contact.consentBefore')}{' '}
                  <Link to="/legal/confidentialitate" onClick={(e) => e.stopPropagation()}>
                    {t('contact.consentLink')}
                  </Link>
                  {t('contact.consentAfter')}
                </span>
              </label>
            </div>
            {error && <p className="form-msg is-err" role="alert">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={submitting || !form.privacy_accepted}>
              {submitting ? t('contact.sending') : t('contact.submit')}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
