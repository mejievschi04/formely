import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { platform } from '../api';
import {
  LEAD_STATUS,
  PLAN_LABELS,
  TRIAL_DAYS,
  errMessage,
  formatDate,
  leadReason,
  leadSource,
  slugify,
} from '../lib';
import { copyText } from '../ui';
import { useToast } from '../toast';
import { usePoll } from '../usePoll';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://formely.org';

export default function LeadsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { push } = useToast();
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(null);
  const [convertForm, setConvertForm] = useState(null);
  const [convertSaving, setConvertSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [createdCompanyId, setCreatedCompanyId] = useState(null);
  const statusRef = useRef(status);
  const queryRef = useRef(query);
  statusRef.current = status;
  queryRef.current = query;

  const load = useCallback(async (filters = {}, opts = {}) => {
    const silent = opts.silent === true;
    try {
      if (!silent) setLoading(true);
      const res = await platform.leads({
        per_page: 100,
        status: (filters.status ?? statusRef.current) || undefined,
        q: (filters.q ?? queryRef.current) || undefined,
      });
      setLeads(res?.data || []);
    } catch (err) {
      if (!silent) push(errMessage(err, 'Nu am putut încărca cererile.'), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  usePoll(() => load({}, { silent: true }), 8000);

  const openConvert = useCallback((lead) => {
    const name = lead.company_name || lead.name || '';
    setConverting(lead);
    setInviteUrl('');
    setCreatedCompanyId(null);
    setConvertForm({
      name,
      slug: slugify(name),
      plan: ['instructor', 'academie', 'business'].includes(lead.plan_interest)
        ? lead.plan_interest
        : 'academie',
      status: 'trial',
      owner_email: lead.email || '',
      owner_name: lead.name || '',
      notes: [lead.reason, lead.message].filter(Boolean).join('\n'),
    });
  }, []);

  useEffect(() => {
    const convertId = params.get('convert');
    if (!convertId || leads.length === 0) return;
    const lead = leads.find((l) => String(l.id) === String(convertId));
    if (!lead) return;
    openConvert(lead);
    const next = new URLSearchParams(params);
    next.delete('convert');
    setParams(next, { replace: true });
  }, [leads, params, openConvert, setParams]);

  const counts = useMemo(() => {
    const all = { all: leads.length };
    Object.keys(LEAD_STATUS).forEach((key) => {
      all[key] = leads.filter((l) => l.status === key).length;
    });
    return all;
  }, [leads]);

  const setLeadStatus = async (lead, next) => {
    try {
      await platform.updateLead(lead.id, { status: next });
      push('Status actualizat.', 'success');
      await load();
    } catch (err) {
      push(errMessage(err, 'Actualizarea a eșuat.'), 'error');
    }
  };

  const closeConvert = () => {
    setConverting(null);
    setConvertForm(null);
    setInviteUrl('');
    setCreatedCompanyId(null);
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    if (!converting || !convertForm) return;
    if (!convertForm.name.trim() || !convertForm.owner_email.trim()) {
      push('Numele academiei și emailul owner-ului sunt obligatorii.', 'error');
      return;
    }
    setConvertSaving(true);
    try {
      const res = await platform.convertLead(converting.id, {
        name: convertForm.name.trim(),
        slug: convertForm.slug.trim() || undefined,
        plan: convertForm.plan,
        status: convertForm.status,
        owner_email: convertForm.owner_email.trim(),
        owner_name: convertForm.owner_name.trim() || undefined,
        notes: convertForm.notes.trim() || undefined,
      });
      setInviteUrl(res?.invite_url || '');
      setCreatedCompanyId(res?.company?.id || null);
      push(res?.message || 'Lead convertit în academie.', 'success');
      await load();
    } catch (err) {
      push(errMessage(err, 'Conversia a eșuat.'), 'error');
    } finally {
      setConvertSaving(false);
    }
  };

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Cereri de acces</h1>
          <p>Formularul de pe site ajunge aici. Califici, apoi convertești într-un client.</p>
        </div>
      </header>

      <div className="bo-toolbar">
        <input
          type="search"
          placeholder="Caută nume, email, organizație…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') load({ q: e.currentTarget.value });
          }}
        />
        <select
          aria-label="Filtru status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load({ status: e.target.value });
          }}
        >
          <option value="">Toate</option>
          {Object.entries(LEAD_STATUS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="button" className="bo-btn bo-btn--sm" onClick={() => load()}>
          Caută
        </button>
      </div>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>{loading ? '…' : `${leads.length} cereri`}</h2>
          {!status && (
            <span className="bo-muted">
              {counts.new || 0} noi · {counts.contacted || 0} contactate · {counts.qualified || 0} calificate
            </span>
          )}
        </div>
        <div className="bo-table-wrap">
          {loading && leads.length === 0 ? (
            <p className="bo-muted">Se încarcă…</p>
          ) : leads.length === 0 ? (
            <p className="bo-muted">
              Nicio cerere pe filtrul curent. Trimite una de pe site —
              {' '}
              <a href={SITE_URL} target="_blank" rel="noreferrer">{SITE_URL}</a>
            </p>
          ) : (
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Organizație</th>
                  <th>Contact</th>
                  <th>Plan</th>
                  <th>Sursă</th>
                  <th>Creat</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.company_name || lead.name}</strong>
                      <div className="bo-muted">{lead.message || leadReason(lead) || '—'}</div>
                      {lead.company_id ? (
                        <div className="bo-muted">
                          <Link to={`/clients/${lead.company_id}`}>Academie #{lead.company_id}</Link>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {lead.name}
                      <div className="bo-muted">{lead.email}</div>
                    </td>
                    <td>{PLAN_LABELS[lead.plan_interest] || lead.plan_interest || '—'}</td>
                    <td>
                      <span className="bo-pill">{leadSource(lead)}</span>
                    </td>
                    <td className="bo-muted">{formatDate(lead.created_at)}</td>
                    <td>
                      <select
                        aria-label={`Status ${lead.company_name || lead.name}`}
                        value={lead.status}
                        onChange={(e) => setLeadStatus(lead, e.target.value)}
                      >
                        {Object.entries(LEAD_STATUS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="bo-row-actions">
                      {!lead.company_id && lead.status !== 'lost' && (
                        <button type="button" className="bo-btn bo-btn--sm" onClick={() => openConvert(lead)}>
                          Convertește
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {converting && convertForm ? (
        <div
          className="bo-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Convertește lead"
          onClick={closeConvert}
          onKeyDown={(e) => { if (e.key === 'Escape') closeConvert(); }}
        >
          <form className="bo-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleConvert}>
            <header>
              <h2>Convertește în academie</h2>
              <button type="button" className="bo-btn bo-btn--sm bo-btn--ghost" onClick={closeConvert}>
                Închide
              </button>
            </header>
            {inviteUrl || createdCompanyId ? (
              <div className="bo-invite">
                <p>Lead marcat câștigat și legat de academie.</p>
                {inviteUrl ? (
                  <>
                    <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
                    <button
                      type="button"
                      className="bo-btn bo-btn--primary"
                      onClick={async () => {
                        const ok = await copyText(inviteUrl);
                        push(ok ? 'Link copiat.' : 'Copiază din câmp.', ok ? 'success' : 'info');
                      }}
                    >
                      Copiază invitația
                    </button>
                  </>
                ) : null}
                {createdCompanyId ? (
                  <Link
                    to={`/clients/${createdCompanyId}`}
                    className="bo-btn"
                    onClick={closeConvert}
                  >
                    Deschide academia
                  </Link>
                ) : null}
              </div>
            ) : (
              <>
                <p className="bo-muted">
                  Creează academia, marchează lead-ul câștigat și trimite invitația owner — într-un singur pas.
                </p>
                <label>
                  Nume academie
                  <input
                    required
                    autoFocus
                    value={convertForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setConvertForm((p) => ({
                        ...p,
                        name,
                        slug: p.slugTouched ? p.slug : slugify(name),
                      }));
                    }}
                  />
                </label>
                <label>
                  Slug
                  <input
                    value={convertForm.slug}
                    onChange={(e) => setConvertForm((p) => ({
                      ...p,
                      slug: e.target.value,
                      slugTouched: true,
                    }))}
                  />
                </label>
                <label>
                  Plan
                  <select
                    value={convertForm.plan}
                    onChange={(e) => setConvertForm((p) => ({ ...p, plan: e.target.value }))}
                  >
                    {Object.entries(PLAN_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Start
                  <select
                    value={convertForm.status}
                    onChange={(e) => setConvertForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="trial">Trial {TRIAL_DAYS} zile</option>
                    <option value="active">Activ (contract)</option>
                  </select>
                </label>
                <label>
                  Email owner
                  <input
                    required
                    type="email"
                    value={convertForm.owner_email}
                    onChange={(e) => setConvertForm((p) => ({ ...p, owner_email: e.target.value }))}
                  />
                </label>
                <label>
                  Nume owner
                  <input
                    value={convertForm.owner_name}
                    onChange={(e) => setConvertForm((p) => ({ ...p, owner_name: e.target.value }))}
                  />
                </label>
                <label>
                  Note
                  <textarea
                    rows={3}
                    value={convertForm.notes}
                    onChange={(e) => setConvertForm((p) => ({ ...p, notes: e.target.value }))}
                  />
                </label>
                <button type="submit" className="bo-btn bo-btn--primary" disabled={convertSaving}>
                  {convertSaving ? 'Se convertește…' : 'Convertește'}
                </button>
              </>
            )}
          </form>
        </div>
      ) : null}
    </>
  );
}
