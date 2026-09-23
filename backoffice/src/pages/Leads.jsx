import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { Overlay, copyText } from '../ui';
import { useToast } from '../toast';
import { usePoll } from '../usePoll';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://formely.org';

function LeadDrawer({ lead, open, onClose, onConvert, onStatus }) {
  if (!open || !lead) return null;

  return (
    <div className="bo-drawer-root" role="presentation" onClick={onClose}>
      <aside
        className="bo-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Cerere ${lead.company_name || lead.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bo-drawer__head">
          <div>
            <p className="bo-kicker">Cerere #{lead.id}</p>
            <h2>{lead.company_name || lead.name}</h2>
          </div>
          <button type="button" className="bo-btn bo-btn--sm bo-btn--ghost" onClick={onClose}>
            Închide
          </button>
        </header>

        <dl className="bo-drawer__fields">
          <div>
            <dt>Contact</dt>
            <dd>
              {lead.name}
              <br />
              <a href={`mailto:${lead.email}`}>{lead.email}</a>
              {lead.phone ? (
                <>
                  <br />
                  <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Organizație</dt>
            <dd>{lead.company_name || '—'}</dd>
          </div>
          <div>
            <dt>Plan interes</dt>
            <dd>{PLAN_LABELS[lead.plan_interest] || lead.plan_interest || '—'}</dd>
          </div>
          <div>
            <dt>Motiv</dt>
            <dd>{leadReason(lead) || '—'}</dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : '—'}</dd>
          </div>
          {lead.message ? (
            <div>
              <dt>Mesaj</dt>
              <dd className="bo-drawer__message">{lead.message}</dd>
            </div>
          ) : null}
          <div>
            <dt>Sursă</dt>
            <dd>{leadSource(lead)}</dd>
          </div>
          <div>
            <dt>Creată</dt>
            <dd>{formatDate(lead.created_at)}</dd>
          </div>
          <div>
            <dt>Contactată</dt>
            <dd>{lead.contacted_at ? formatDate(lead.contacted_at) : '—'}</dd>
          </div>
          <div>
            <dt>Consimțământ</dt>
            <dd>{lead.privacy_accepted_at ? formatDate(lead.privacy_accepted_at) : '—'}</dd>
          </div>
          {lead.company_id ? (
            <div>
              <dt>Academie</dt>
              <dd>
                <Link to={`/clients/${lead.company_id}`}>#{lead.company_id}</Link>
              </dd>
            </div>
          ) : null}
        </dl>

        <label className="bo-drawer__status">
          Status
          <select
            value={lead.status}
            onChange={(e) => onStatus(lead, e.target.value)}
          >
            {Object.entries(LEAD_STATUS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <div className="bo-drawer__actions">
          {!lead.company_id && lead.status !== 'lost' && (
            <button type="button" className="bo-btn bo-btn--primary" onClick={() => onConvert(lead)}>
              Convertește în academie
            </button>
          )}
          <a className="bo-btn" href={`mailto:${lead.email}?subject=${encodeURIComponent(`Formely — ${lead.company_name || lead.name}`)}`}>
            Scrie email
          </a>
        </div>
      </aside>
    </div>
  );
}

export default function LeadsPage() {
  const [params, setParams] = useSearchParams();
  const { push } = useToast();
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [converting, setConverting] = useState(null);
  const [convertForm, setConvertForm] = useState(null);
  const [convertSaving, setConvertSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [createdCompanyId, setCreatedCompanyId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
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
      const rows = res?.data || [];
      setLeads(rows);
      setChecked((prev) => {
        const ids = new Set(rows.map((l) => l.id));
        const next = new Set();
        prev.forEach((id) => {
          if (ids.has(id)) next.add(id);
        });
        return next;
      });
      setSelected((prev) => {
        if (!prev) return null;
        return rows.find((l) => l.id === prev.id) || null;
      });
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
    setSelected(null);
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
      notes: [lead.reason, lead.phone ? `Telefon: ${lead.phone}` : null, lead.message].filter(Boolean).join('\n'),
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

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !converting) setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, converting]);

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

  const allChecked = leads.length > 0 && checked.size === leads.length;
  const toggleAll = () => {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(leads.map((l) => l.id)));
  };
  const toggleOne = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkStatus = async (nextStatus) => {
    const ids = [...checked];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => platform.updateLead(id, { status: nextStatus })));
      push(`${ids.length} cereri → ${LEAD_STATUS[nextStatus] || nextStatus}.`, 'success');
      setChecked(new Set());
      await load();
    } catch (err) {
      push(errMessage(err, 'Actualizarea în masă a eșuat.'), 'error');
    } finally {
      setBulkBusy(false);
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

      {checked.size > 0 && (
        <div className="bo-bulk">
          <span>{checked.size} selectate</span>
          <button type="button" className="bo-btn bo-btn--sm" disabled={bulkBusy} onClick={() => bulkStatus('contacted')}>
            Contactate
          </button>
          <button type="button" className="bo-btn bo-btn--sm" disabled={bulkBusy} onClick={() => bulkStatus('qualified')}>
            Calificate
          </button>
          <button type="button" className="bo-btn bo-btn--sm" disabled={bulkBusy} onClick={() => bulkStatus('lost')}>
            Pierdute
          </button>
          <button type="button" className="bo-btn bo-btn--sm bo-btn--ghost" onClick={() => setChecked(new Set())}>
            Anulează
          </button>
        </div>
      )}

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
                  <th className="bo-check-col">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      aria-label="Selectează toate"
                    />
                  </th>
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
                  <tr
                    key={lead.id}
                    className={selected?.id === lead.id ? 'is-selected' : undefined}
                    onClick={() => setSelected(lead)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="bo-check-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked.has(lead.id)}
                        onChange={() => toggleOne(lead.id)}
                        aria-label={`Selectează ${lead.company_name || lead.name}`}
                      />
                    </td>
                    <td>
                      <strong>{lead.company_name || lead.name}</strong>
                      <div className="bo-muted">{lead.phone || lead.message || leadReason(lead) || '—'}</div>
                      {lead.company_id ? (
                        <div className="bo-muted">
                          <Link to={`/clients/${lead.company_id}`} onClick={(e) => e.stopPropagation()}>
                            Academie #{lead.company_id}
                          </Link>
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
                    <td onClick={(e) => e.stopPropagation()}>
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
                    <td className="bo-row-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="bo-btn bo-btn--sm" onClick={() => setSelected(lead)}>
                        Detalii
                      </button>
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

      <LeadDrawer
        lead={selected}
        open={Boolean(selected) && !converting}
        onClose={() => setSelected(null)}
        onConvert={openConvert}
        onStatus={setLeadStatus}
      />

      <Overlay
        open={Boolean(converting && convertForm)}
        onClose={closeConvert}
        title="Convertește în academie"
      >
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
          <form className="bo-stack-form" onSubmit={handleConvert}>
            <p className="bo-muted">
              Creează academia, marchează lead-ul câștigat și trimite invitația owner — într-un singur pas.
            </p>
            <label>
              Nume academie
              <input
                required
                value={convertForm?.name || ''}
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
                value={convertForm?.slug || ''}
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
                value={convertForm?.plan || 'academie'}
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
                value={convertForm?.status || 'trial'}
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
                value={convertForm?.owner_email || ''}
                onChange={(e) => setConvertForm((p) => ({ ...p, owner_email: e.target.value }))}
              />
            </label>
            <label>
              Nume owner
              <input
                value={convertForm?.owner_name || ''}
                onChange={(e) => setConvertForm((p) => ({ ...p, owner_name: e.target.value }))}
              />
            </label>
            <label>
              Note
              <textarea
                rows={3}
                value={convertForm?.notes || ''}
                onChange={(e) => setConvertForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </label>
            <button type="submit" className="bo-btn bo-btn--primary" disabled={convertSaving}>
              {convertSaving ? 'Se convertește…' : 'Convertește'}
            </button>
          </form>
        )}
      </Overlay>
    </>
  );
}
