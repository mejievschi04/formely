import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { platform } from '../api';
import {
  PLAN_LABELS,
  STATUS_LABELS,
  getTrialDays,
  errMessage,
  featureSummary,
  planSeatLabel,
  slugify,
} from '../lib';
import { Overlay, Pagination, SeatMeter, copyText, ClientTabs } from '../ui';
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
};

const PER_PAGE = 25;

export default function ClientsPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [plans, setPlans] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [inviteUrl, setInviteUrl] = useState('');
  const [createdId, setCreatedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState(params.get('q') || '');
  const [planFilter, setPlanFilter] = useState(params.get('plan') || '');
  const [statusFilter, setStatusFilter] = useState(params.get('status') || '');
  const [page, setPage] = useState(Number(params.get('page') || 1) || 1);
  const redirectedLead = useRef(null);
  const queryRef = useRef(query);
  const planRef = useRef(planFilter);
  const statusRef = useRef(statusFilter);
  const pageRef = useRef(page);
  queryRef.current = query;
  planRef.current = planFilter;
  statusRef.current = statusFilter;
  pageRef.current = page;

  const planOptions = useMemo(
    () => (plans.length
      ? plans
      : [
        { id: 'instructor', label: 'Instructor', max_active_learners: 50, max_staff: 2 },
        { id: 'academie', label: 'Academie', max_active_learners: 250, max_staff: 6 },
        { id: 'business', label: 'Business', max_active_learners: null, max_staff: 20 },
      ]),
    [plans],
  );

  const load = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    try {
      if (!silent) setLoading(true);
      const [companiesRes, plansRes, leadsRes] = await Promise.all([
        platform.companies({
          per_page: PER_PAGE,
          page: opts.page ?? pageRef.current,
          q: (opts.q ?? queryRef.current) || undefined,
          plan: (opts.plan ?? planRef.current) || undefined,
          status: (opts.status ?? statusRef.current) || undefined,
        }),
        platform.plans(),
        platform.leads({ per_page: 50, status: 'new' }),
      ]);
      setCompanies(companiesRes?.data || []);
      setMeta({
        current_page: companiesRes?.current_page || 1,
        last_page: companiesRes?.last_page || 1,
        total: companiesRes?.total || 0,
      });
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
    if (params.has('page')) setPage(Number(params.get('page') || 1) || 1);
    if (params.get('new') === '1') setCreateOpen(true);
  }, [params]);

  useEffect(() => {
    const leadId = params.get('lead');
    if (!leadId) return;
    if (redirectedLead.current === String(leadId)) return;
    redirectedLead.current = String(leadId);
    navigate(`/leads?convert=${leadId}`, { replace: true });
  }, [params, navigate]);

  const newLeads = useMemo(
    () => leads.filter((l) => !l.company_id && (l.status === 'new' || l.status === 'contacted' || l.status === 'qualified')),
    [leads],
  );

  const syncParams = (patch, reload = true) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    setParams(next, { replace: true });
    if (reload) {
      const nextPage = patch.page != null ? Number(patch.page) || 1 : pageRef.current;
      if (patch.page != null) setPage(nextPage);
      if (patch.q != null) setQuery(patch.q);
      if (patch.plan != null) setPlanFilter(patch.plan);
      if (patch.status != null) setStatusFilter(patch.status);
      load({
        page: patch.page != null ? nextPage : undefined,
        q: patch.q !== undefined ? patch.q : undefined,
        plan: patch.plan !== undefined ? patch.plan : undefined,
        status: patch.status !== undefined ? patch.status : undefined,
      });
    }
  };

  const update = (key) => (e) => {
    const value = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !prev.slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setInviteUrl('');
    setCreatedId(null);
    setForm(EMPTY);
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
      const created = await platform.createCompany(payload);
      setInviteUrl(created?.invite_url || '');
      setCreatedId(created?.company?.id || null);
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
            setCreatedId(null);
          }}
        >
          Client nou
        </button>
      </header>

      <ClientTabs />

      {newLeads.length > 0 && (
        <section className="bo-leads-strip">
          <strong>Cereri</strong>
          {newLeads.slice(0, 5).map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => navigate(`/leads?convert=${lead.id}`)}
            >
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') syncParams({ q: e.currentTarget.value, page: 1 });
          }}
        />
        <select
          aria-label="Filtru plan"
          value={planFilter}
          onChange={(e) => syncParams({ plan: e.target.value, page: 1 })}
        >
          <option value="">Toate planurile</option>
          {planOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select
          aria-label="Filtru status"
          value={statusFilter}
          onChange={(e) => syncParams({ status: e.target.value, page: 1 })}
        >
          <option value="">Toate statusurile</option>
          <option value="active">Activ</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspendat</option>
        </select>
        <button type="button" className="bo-btn bo-btn--sm" onClick={() => syncParams({ q: query, page: 1 })}>
          Caută
        </button>
      </div>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>{loading ? '…' : `${meta.total} clienți`}</h2>
          <Pagination
            page={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            onPage={(p) => syncParams({ page: p })}
          />
        </div>
        <div className="bo-table-wrap">
          {loading ? (
            <p className="bo-muted">Se încarcă…</p>
          ) : companies.length === 0 ? (
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
                {companies.map((c) => (
                  <tr key={c.id} data-severity={c.health?.severity || 'ok'}>
                    <td>
                      <Link to={`/clients/${c.id}`} className="bo-link-strong">{c.name}</Link>
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
                      <Link to={`/clients/${c.id}`} className="bo-btn bo-btn--sm">Deschide</Link>
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
        </div>
        {meta.last_page > 1 && (
          <div className="bo-card__foot">
            <Pagination
              page={meta.current_page}
              lastPage={meta.last_page}
              total={meta.total}
              onPage={(p) => syncParams({ page: p })}
            />
          </div>
        )}
      </section>

      <Overlay open={createOpen} onClose={closeCreate} title="Client nou">
        {inviteUrl ? (
          <div className="bo-invite">
            <p>Academia există. Trimite owner-ului acest link:</p>
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
            {createdId ? (
              <Link to={`/clients/${createdId}`} className="bo-btn" onClick={closeCreate}>
                Deschide academia
              </Link>
            ) : null}
          </div>
        ) : (
          <form className="bo-stack-form" onSubmit={handleCreate}>
            <p className="bo-muted">Owner-ul primește invitația. Modulele urmează planul.</p>
            <label>
              Nume academie
              <input required value={form.name} onChange={update('name')} />
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
                <option value="trial">Trial {getTrialDays()} zile</option>
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
        )}
      </Overlay>
    </>
  );
}
