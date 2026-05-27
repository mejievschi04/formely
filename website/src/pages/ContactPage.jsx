import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import {
  site,
  contactMeta,
  contactReasons,
  contactPerks,
  contactResponse,
} from '../data/site';
import '../styles/contact.css';

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    org: '',
    reason: 'demo',
    msg: '',
  });

  useEffect(() => {
    document.body.classList.add('is-contact-page');
    return () => document.body.classList.remove('is-contact-page');
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const reasonLabel =
      contactReasons.find((r) => r.value === form.reason)?.label ?? form.reason;
    const subject = `Formely — ${reasonLabel}`;
    const body = [
      `Nume: ${form.name}`,
      `Email: ${form.email}`,
      `Organizație: ${form.org || '—'}`,
      `Motiv: ${reasonLabel}`,
      '',
      form.msg,
    ].join('\n');
    window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="page-contact">
      <Seo
        title="Contact Formely — demo, ofertă, pilot"
        description="Programează un demo Formely sau solicită o ofertă. Răspundem în 24–48h lucrătoare."
        path="/contact"
      />

      <section className="ctc-hero">
        <div className="ctc-wrap">
          <p className="ctc-kicker">Contact</p>
          <h1>{contactMeta.title}</h1>
          <p className="ctc-lead">{contactMeta.lead}</p>
        </div>
      </section>

      <section className="ctc-main">
        <div className="ctc-wrap ctc-grid">
          <div className="ctc-form-card">
            <h2>Solicită demo sau ofertă</h2>
            <p>30–45 minute online, pe scenariul tău — cursuri, teste, echipe sau bibliotecă.</p>

            <form onSubmit={handleSubmit}>
              <div className="ctc-field-row">
                <div className="ctc-field">
                  <label htmlFor="name">Nume complet</label>
                  <input
                    id="name"
                    name="name"
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={update('name')}
                    placeholder="Maria Popescu"
                  />
                </div>
                <div className="ctc-field">
                  <label htmlFor="email">Email profesional</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={update('email')}
                    placeholder="maria@academie.ro"
                  />
                </div>
              </div>

              <div className="ctc-field">
                <label htmlFor="org">Organizație</label>
                <input
                  id="org"
                  name="organization"
                  autoComplete="organization"
                  value={form.org}
                  onChange={update('org')}
                  placeholder="Academie, companie, independent"
                />
              </div>

              <div className="ctc-field">
                <label htmlFor="reason">Ce cauți?</label>
                <select
                  id="reason"
                  name="reason"
                  value={form.reason}
                  onChange={update('reason')}
                >
                  {contactReasons.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ctc-field">
                <label htmlFor="msg">Spune-ne pe scurt</label>
                <textarea
                  id="msg"
                  name="message"
                  required
                  value={form.msg}
                  onChange={update('msg')}
                  placeholder="Nr. cursanți estimat, tip programe, termene, module dorite (AI, bibliotecă)..."
                />
              </div>

              <button type="submit" className="btn btn--primary btn--lg">
                Trimite solicitarea
              </button>
              <p className="ctc-form-note">
                Prin trimitere, deschizi clientul de email cu mesajul precompletat către{' '}
                {site.email}. Poți edita înainte de send.
              </p>
            </form>
          </div>

          <aside className="ctc-aside">
            <div className="ctc-card ctc-card--email">
              <h3>Contact direct</h3>
              <a href={`mailto:${site.email}`} className="ctc-email">
                {site.email}
              </a>
            </div>

            <div className="ctc-card">
              {contactPerks.map((perk) => (
                <div key={perk.title} className="ctc-perk">
                  <strong>{perk.title}</strong>
                  <p>{perk.text}</p>
                </div>
              ))}
            </div>

            <div className="ctc-card">
              <h3>{contactResponse.title}</h3>
              <ul className="ctc-response">
                {contactResponse.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="ctc-links">
                <Link to="/preturi">Prețuri</Link>
                <Link to="/platforma">Platformă</Link>
                <Link to="/solutii">Soluții</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
