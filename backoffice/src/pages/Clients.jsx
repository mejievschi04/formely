import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { platform } from '../api';
import {
  PLAN_LABELS,
  STATUS_LABELS,
  TRIAL_DAYS,
  emptyFeatures,
  errMessage,
  featureSummary,
  planSeatLabel,
  slugify,
} from '../lib';
import { SeatMeter, copyText } from '../ui';
import { useToast } from '../toast';
import { usePoll } from '../usePoll';

const EMPTY = {
  name: '',
  slug: '',
  plan: 'academie',
  status: 'trial',
  owner_email: '',
  owner_name: '',
  notes: '',
  leadId: null,
};

export default function ClientsPage() {
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [inviteUrl, setInviteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [deleteSlug, setDeleteSlug] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState(params.get('q') || '');
  const [planFilter, setPlanFilter] = useState(params.get('plan') || '');
  const [statusFilter, setStatusFilter] = useState(params.get('status') || '');
  const hydratedLeadId = useRef(null);

  const planOptions = useMemo(
    () => (plans.length
      ? plans
      : [
        { id: 'instructor', label: 'Instructor', max_active_learners: 50, max_staff: 2 },
        { id: 'academie', label: 'Academie', max_active_learners: 150, max_staff: 10 },
        { id: 'business', label: 'Business', max_active_learners: null, max_staff: 50 },
      ]),
    [plans],
  );

  const load = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    try {
      if (!silent) setLoading(true);
      const [companiesRes, plansRes, leadsRes] = await Promise.all([
        platform.companies({ per_page: 100 }),
        platform.plans(),
        platform.leads({ per_page: 50 }),
      ]);
      setCompanies(companiesRes?.data || companiesRes || []);
      setPlans(plansRes?.plans || []);
      setLeads(leadsRes?.data || []);
    } catch (err) {
      if (!silent) push(errMessage(err, 'Nu am putut încărca clienții.'), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  usePoll(() => load({ silent: true }), 12000);

  useEffect(() => {
    if (params.has('q')) setQuery(params.get('q') || '');
    if (params.has('plan')) setPlanFilter(params.get('plan') || '');
    if (params.has('status')) setStatusFilter(params.get('status') || '');
    if (params.get('new') === '1') setCreateOpen(true);
  }, [params]);

  const newLeads = useMemo(
    () => leads.filter((l) => l.status === 'new' || l.status === 'contacted' || l.status === 'qualified'),
    [leads],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (planFilter && c.plan !== planFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q) || (c.slug || '').toLowerCase().includes(q);
    });
  }, [companies, planFilter, query, statusFilter]);

  const syncParams = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next, { replace: true });
  };

  const update = (key) => (e) => {
    const value = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !prev.slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const fillFromLead = useCallback((lead) => {
    const name = lead.company_name || lead.name || '';
    setForm({
      ...EMPTY,
      name,
      slug: slugify(name),
      plan: ['instructor', 'academie', 'business'].includes(lead.plan_interest)
        ? lead.plan_interest
        : 'academie',
      owner_email: lead.email || '',
      owner_name: lead.name || '',
      notes: [lead.reason, lead.message].filter(Boolean).join('\n'),
      leadId: lead.id,
    });
    setInviteUrl('');
    setCreateOpen(true);
  }, []);

  useEffect(() => {
    const leadId = params.get('lead');
    if (!leadId || leads.length === 0) return;
    if (hydratedLeadId.current === String(leadId)) return;
    const lead = leads.find((l) => String(l.id) === String(leadId));
    if (!lead) return;
    hydratedLeadId.current = String(leadId);
    fillFromLead(lead);
  }, [leads, params, fillFromLead]);

  const closeCreate = () => {
    setCreateOpen(false);
    setInviteUrl('');
    setForm(EMPTY);
    hydratedLeadId.current = null;
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('lead');
    setParams(next, { replace: true });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim() || !form.owner_email.trim()) {
      push('Numele academiei, slug-ul și emailul owner-ului sunt obligatorii.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        plan: form.plan,
        status: form.status,
        owner_email: form.owner_email.trim(),
        owner_name: form.owner_name.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (form.status === 'trial') {
        const ends = new Date();
        ends.setDate(ends.getDate() + TRIAL_DAYS);
        payload.trial_ends_at = ends.toISOString();
      }
      const created = await platform.createCompany(payload);
      if (form.leadId) {
        try {
          await platform.updateLead(form.leadId, { status: 'won' });
        } catch {
          /* lead update is optional */
        }
      }
      setInviteUrl(created?.invite_url || '');
      push('Academia a fost creată. Copiază linkul dacă emailul nu ajunge.', 'success');
      await load();
    } catch (err) {
      push(errMessage(err, 'Crearea a eșuat.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (company, status) => {
    if (status === 'suspended' && !window.confirm(`Suspendezi „${company.name}”? Utilizatorii nu se mai pot autentifica.`)) {
      return;
    }
    try {
      await platform.updateCompany(company.id, { status });
      push(status === 'active' ? 'Academia este activă.' : 'Status actualizat.', 'success');
      await load();
    } catch (err) {
      push(errMessage(err, 'Actualizarea a eșuat.'), 'error');
    }
  };

  const openEdit = async (company) => {
    const planDefaults = planOptions.find((p) => p.id === company.plan)?.features || {};
    let detail = company;
    try {
      const res = await platform.company(company.id);
      detail = res?.company || company;
    } catch {
      /* list payload is enough */
    }
    setEditing(detail);
    setInviteEmail('');
    setDeleteSlug('');
    setEditDraft({
      plan: detail.plan || 'instructor',
      status: detail.status || 'active',
      max_active_learners: detail.max_active_learners ?? '',
      max_staff: detail.max_staff ?? '',
      notes: detail.notes || '',
      features: {
        ...emptyFeatures(),
        ...planDefaults,
        ...(detail.features || detail.entitlements?.features || {}),
      },
    });
  };

  const applyPlanDefaults = (planId) => {
    const plan = planOptions.find((p) => p.id === planId);
    setEditDraft((prev) => ({
      ...prev,
      plan: planId,
      max_active_learners: plan?.max_active_learners ?? '',
      max_staff: plan?.max_staff ?? '',
      features: {
        ...emptyFeatures(),
        ...(plan?.features || {}),
      },
    }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editing || !editDraft) return;
    setEditSaving(true);
    try {
      await platform.updateCompany(editing.id, {
        plan: editDraft.plan,
        status: editDraft.status,
        notes: editDraft.notes || null,
        max_active_learners: editDraft.max_active_learners === '' || editDraft.max_active_learners === null
          ? null
          : Number(editDraft.max_active_learners),
        max_staff: editDraft.max_staff === '' || editDraft.max_staff === null
          ? null
          : Number(editDraft.max_staff),
      });
      push('Planul academiei a fost actualizat.', 'success');
      setEditing(null);
      setEditDraft(null);
      await load();
    } catch (err) {
      push(errMessage(err, 'Actualizarea a eșuat.'), 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const handleResendInvite = async (e) => {
    e.preventDefault();
    if (!editing || !inviteEmail.trim()) return;
    try {
      const res = await platform.inviteOwner(editing.id, { owner_email: inviteEmail.trim() });
      push('Invitația pentru owner a fost trimisă.', 'success');
      if (res?.invite_url) {
        const copied = await copyText(res.invite_url);
        if (copied) push('Linkul de invitație a fost copiat.', 'success');
      }
      setInviteEmail('');
    } catch (err) {
      push(errMessage(err, 'Invitația a eșuat.'), 'error');
    }
  };

  const handleDeleteCompany = async () => {
    if (!editing) return;
    if (deleteSlug.trim() !== editing.slug) {
      push(`Scrie exact slug-ul „${editing.slug}” pentru a confirma.`, 'error');
      return;
    }
    if (!window.confirm(
      `Ștergi DEFINITIV academia „${editing.name}”?\n\nSe șterg utilizatori, cursuri, teste și tot conținutul. Acțiunea nu poate fi anulată.`,
    )) {
      return;
    }
    setDeleting(true);
    try {
      await platform.deleteCompany(editing.id, editing.slug);
      push('Academia a fost ștearsă definitiv.', 'success');
      setEditing(null);
      setEditDraft(null);
      setDeleteSlug('');
      await load();
    } catch (err) {
      push(errMessage(err, 'Ștergerea a eșuat.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const selectedPlan = planOptions.find((p) => p.id === form.plan);

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Clienți</h1>
          <p>Provisionare după contract. Funcțiile se activează strict după plan.</p>
        </div>
        <button
          type="button"
          className="bo-btn bo-btn--primary"
          onClick={() => {
            setCreateOpen(true);
            setInviteUrl('');
          }}
        >
          Client nou
        </button>
      </header>

      {newLeads.length > 0 && (
        <section className="bo-leads-strip">
          <strong>Cereri</strong>
          {newLeads.slice(0, 5).map((lead) => (
            <button key={lead.id} type="button" onClick={() => fillFromLead(lead)}>
              {lead.company_name || lead.name}
              <span>{PLAN_LABELS[lead.plan_interest] || lead.plan_interest || '—'}</span>
            </button>
          ))}
        </section>
      )}

      <div className="bo-toolbar">
        <input
          type="search"
          placeholder="Caută nume sau slug…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            syncParams({ q: e.target.value });
          }}
        />
        <select
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            syncParams({ plan: e.target.value });
          }}
        >
          <option value="">Toate planurile</option>
          {planOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            syncParams({ status: e.target.value });
          }}
        >
          <option value="">Toate statusurile</option>
          <option value="active">Activ</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspendat</option>
        </select>
      </div>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>{loading ? '…' : `${filtered.length} din ${companies.length}`}</h2>
        </div>
        {loading ? (
          <p className="bo-muted">Se încarcă…</p>
        ) : filtered.length === 0 ? (
          <p className="bo-muted">Niciun client pe filtrul curent.</p>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Cursanți</th>
                <th>Staff</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} data-severity={c.health?.severity || 'ok'}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="bo-muted">{c.slug}</div>
                  </td>
                  <td>{c.plan_label || PLAN_LABELS[c.plan] || c.plan}</td>
                  <td>
                    <span className={`bo-pill is-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span>
                    {c.health?.trial_days_left != null && c.status === 'trial' && (
                      <div className="bo-muted">
                        {c.health.trial_days_left < 0 ? 'Trial expirat' : `${c.health.trial_days_left} zile rămase`}
                      </div>
                    )}
                  </td>
                  <td>
                    <SeatMeter
                      used={c.entitlements?.seats?.learners?.used}
                      max={c.entitlements?.seats?.learners?.max}
                      pending={c.entitlements?.seats?.learners?.pending_invites}
                    />
                  </td>
                  <td>
                    <SeatMeter
                      used={c.entitlements?.seats?.staff?.used}
                      max={c.entitlements?.seats?.staff?.max}
                      pending={c.entitlements?.seats?.staff?.pending_invites}
                    />
                  </td>
                  <td className="bo-row-actions">
                    <button type="button" className="bo-btn bo-btn--sm" onClick={() => openEdit(c)}>
                      Plan
                    </button>
                    {c.status !== 'active' && (
                      <button type="button" className="bo-btn bo-btn--sm" onClick={() => handleStatus(c, 'active')}>
                        Activează
                      </button>
                    )}
                    {c.status !== 'suspended' && (
                      <button type="button" className="bo-btn bo-btn--sm bo-btn--ghost" onClick={() => handleStatus(c, 'suspended')}>
                        Suspendă
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {createOpen ? (
        <div className="bo-overlay" onClick={closeCreate}>
          <form className="bo-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <header>
              <h2>Client nou</h2>
              <button type="button" className="bo-btn bo-btn--sm bo-btn--ghost" onClick={closeCreate}>
                Închide
              </button>
            </header>
            {inviteUrl ? (
              <div className="bo-invite">
                <p>Academia există. Trimite owner-ului acest link (emailul poate întârzia):</p>
                <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="bo-btn bo-btn--primary"
                  onClick={async () => {
                    const ok = await copyText(inviteUrl);
                    push(ok ? 'Link copiat.' : 'Copiază linkul din câmp.', ok ? 'success' : 'info');
                  }}
                >
                  Copiază invitația
                </button>
              </div>
            ) : null}
            <p className="bo-muted">Owner-ul primește invitația. Modulele urmează planul, nu se bifează separat.</p>
            <label>
              Nume academie
              <input required autoFocus value={form.name} onChange={update('name')} />
            </label>
            <label>
              Slug
              <input
                required
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value, slugTouched: true }))}
              />
            </label>
            <label>
              Abonament
              <select value={form.plan} onChange={update('plan')}>
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <div className="bo-plan-preview">
              <strong>{selectedPlan?.label || form.plan}</strong>
              <p>
                {planSeatLabel(selectedPlan)}
                {selectedPlan?.max_staff ? ` · până la ${selectedPlan.max_staff} staff` : ''}
              </p>
              <p>{featureSummary(selectedPlan?.features)}</p>
            </div>
            <label>
              Start
              <select value={form.status} onChange={update('status')}>
                <option value="trial">Trial {TRIAL_DAYS} zile</option>
                <option value="active">Activ (contract)</option>
              </select>
            </label>
            <label>
              Email owner
              <input required type="email" value={form.owner_email} onChange={update('owner_email')} />
            </label>
            <label>
              Nume owner
              <input value={form.owner_name} onChange={update('owner_name')} />
            </label>
            <label>
              Note interne
              <textarea rows={3} value={form.notes} onChange={update('notes')} />
            </label>
            <button type="submit" className="bo-btn bo-btn--primary" disabled={saving}>
              {saving ? 'Se creează…' : 'Creează și trimite invitația'}
            </button>
          </form>
        </div>
      ) : null}

      {editing && editDraft ? (
        <div className="bo-overlay" onClick={() => { setEditing(null); setEditDraft(null); }}>
          <form className="bo-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEdit}>
            <header>
              <h2>{editing.name}</h2>
              <button type="button" className="bo-btn bo-btn--sm bo-btn--ghost" onClick={() => { setEditing(null); setEditDraft(null); }}>
                Închide
              </button>
            </header>
            <label>
              Plan
              <select value={editDraft.plan} onChange={(e) => applyPlanDefaults(e.target.value)}>
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={editDraft.status} onChange={(e) => setEditDraft((p) => ({ ...p, status: e.target.value }))}>
                <option value="trial">Trial</option>
                <option value="active">Activ</option>
                <option value="suspended">Suspendat</option>
              </select>
            </label>
            <label>
              Cap cursanți (max. plan)
              <input
                type="number"
                min={1}
                max={planOptions.find((p) => p.id === editDraft.plan)?.max_active_learners || undefined}
                value={editDraft.max_active_learners ?? ''}
                onChange={(e) => setEditDraft((p) => ({ ...p, max_active_learners: e.target.value }))}
                placeholder={editDraft.plan === 'business' ? 'nelimitat' : 'limita planului'}
              />
            </label>
            <label>
              Cap staff (max. plan)
              <input
                type="number"
                min={1}
                max={planOptions.find((p) => p.id === editDraft.plan)?.max_staff || undefined}
                value={editDraft.max_staff ?? ''}
                onChange={(e) => setEditDraft((p) => ({ ...p, max_staff: e.target.value }))}
              />
            </label>
            <label>
              Note interne
              <textarea rows={3} value={editDraft.notes} onChange={(e) => setEditDraft((p) => ({ ...p, notes: e.target.value }))} />
            </label>
            <div className="bo-plan-preview">
              <strong>Inclus în {planOptions.find((p) => p.id === editDraft.plan)?.label || editDraft.plan}</strong>
              <p>{featureSummary(editDraft.features)}</p>
            </div>
            <button type="submit" className="bo-btn bo-btn--primary" disabled={editSaving}>
              {editSaving ? 'Se salvează…' : 'Salvează'}
            </button>

            <div className="bo-invite">
              <h3>Invitație owner</h3>
              <p className="bo-muted">
                {editing.pending_owner_invites
                  ? `${editing.pending_owner_invites} invitație deschisă.`
                  : 'Trimite din nou dacă owner-ul nu a primit mailul.'}
              </p>
              <div className="bo-invite-row">
                <input
                  type="email"
                  placeholder="owner@firma.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <button type="button" className="bo-btn bo-btn--sm" onClick={handleResendInvite}>
                  Trimite
                </button>
              </div>
            </div>

            <div className="bo-danger-zone">
              <h3>Zonă periculoasă</h3>
              <p className="bo-muted">
                Ștergere definitivă: utilizatori, cursuri, teste și tot conținutul academiei.
                Scrie slug-ul <code>{editing.slug}</code> pentru confirmare.
              </p>
              <div className="bo-invite-row">
                <input
                  type="text"
                  placeholder={editing.slug}
                  value={deleteSlug}
                  onChange={(e) => setDeleteSlug(e.target.value)}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="bo-btn bo-btn--sm bo-btn--danger"
                  disabled={deleting || deleteSlug.trim() !== editing.slug}
                  onClick={handleDeleteCompany}
                >
                  {deleting ? 'Se șterge…' : 'Șterge academia'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
