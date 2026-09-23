import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';
import { submitLead } from '../../lib/leads';
import { planOrder } from '../../data/plans';

const COUNTRY_CODES = [
  { iso: 'RO', dial: '+40', flag: '🇷🇴' },
  { iso: 'IT', dial: '+39', flag: '🇮🇹' },
  { iso: 'RU', dial: '+7', flag: '🇷🇺' },
  { iso: 'MD', dial: '+373', flag: '🇲🇩' },
  { iso: 'UA', dial: '+380', flag: '🇺🇦' },
  { iso: 'DE', dial: '+49', flag: '🇩🇪' },
  { iso: 'FR', dial: '+33', flag: '🇫🇷' },
  { iso: 'ES', dial: '+34', flag: '🇪🇸' },
  { iso: 'GB', dial: '+44', flag: '🇬🇧' },
  { iso: 'US', dial: '+1', flag: '🇺🇸' },
  { iso: 'AT', dial: '+43', flag: '🇦🇹' },
  { iso: 'BE', dial: '+32', flag: '🇧🇪' },
  { iso: 'CH', dial: '+41', flag: '🇨🇭' },
  { iso: 'NL', dial: '+31', flag: '🇳🇱' },
  { iso: 'PL', dial: '+48', flag: '🇵🇱' },
];

const DIAL_BY_LANG = { ro: 'RO', it: 'IT', ru: 'RU', en: 'RO' };

export default function Contact() {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const planFromUrl = searchParams.get('plan') || '';
  const [dialIso, setDialIso] = useState(DIAL_BY_LANG[lang] || 'RO');
  const [dialTouched, setDialTouched] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    org: '',
    plan_interest: planOrder.includes(planFromUrl) ? planFromUrl : 'academie',
    phone: '',
    privacy_accepted: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (planOrder.includes(planFromUrl)) {
      setForm((prev) => ({ ...prev, plan_interest: planFromUrl }));
    }
  }, [planFromUrl]);

  useEffect(() => {
    if (!dialTouched) setDialIso(DIAL_BY_LANG[lang] || 'RO');
  }, [lang, dialTouched]);

  const dial = COUNTRY_CODES.find((item) => item.iso === dialIso) || COUNTRY_CODES[0];

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
        plan_interest: form.plan_interest,
        phone: `${dial.dial} ${form.phone.trim()}`,
        source: 'website-landing',
        privacy_accepted: true,
      });
      setDone(true);
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
          <p className="form-msg is-ok reveal">{t('contact.success')}</p>
        ) : (
          <form className="contact-form reveal" onSubmit={handleSubmit}>
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
            <div className="contact-form-row">
              <div className="field">
                <label htmlFor="lead-phone">{t('contact.phone')}</label>
                <div className="phone-field">
                  <div className="phone-code">
                    <span className="phone-flag" aria-hidden="true">{dial.flag}</span>
                    <select
                      aria-label={t('contact.countryCode')}
                      value={dial.iso}
                      onChange={(e) => {
                        setDialTouched(true);
                        setDialIso(e.target.value);
                      }}
                    >
                      {COUNTRY_CODES.map((item) => (
                        <option key={item.iso} value={item.iso}>
                          {item.flag} {item.iso} {item.dial}
                        </option>
                      ))}
                    </select>
                    <span className="phone-dial" aria-hidden="true">{dial.dial}</span>
                  </div>
                  <input
                    id="lead-phone"
                    type="tel"
                    required
                    autoComplete="tel-national"
                    inputMode="tel"
                    value={form.phone}
                    onChange={update('phone')}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="lead-plan">{t('contact.plan')}</label>
                <select id="lead-plan" value={form.plan_interest} onChange={update('plan_interest')}>
                  {planOrder.map((id) => (
                    <option key={id} value={id}>
                      {t(`pricing.plans.${id}.name`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="lead-org">{t('contact.org')}</label>
              <input id="lead-org" required value={form.org} onChange={update('org')} />
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
            {error && <p className="form-msg is-err">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={submitting || !form.privacy_accepted}>
              {submitting ? t('contact.sending') : t('contact.submit')}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
