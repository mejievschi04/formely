import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { platform } from '../api';
import {
  PLAN_LABELS,
  REASON_LABELS,
  STATUS_LABELS,
  TRIAL_DAYS,
  dateInputToIso,
  emptyFeatures,
  errMessage,
  featureSummary,
  formatDate,
  toDateInput,
} from '../lib';
import { SeatMeter, copyText } from '../ui';
import { useToast } from '../toast';

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [company, setCompany] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [deleteSlug, setDeleteSlug] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState(null);

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [companyRes, plansRes] = await Promise.all([
        platform.company(id),
        platform.plans(),
      ]);
      const detail = companyRes?.company;
      if (!detail) {
        push('Academia nu a fost găsită.', 'error');
        navigate('/clients');
        return;
      }
      setCompany(detail);
      setPlans(plansRes?.plans || []);
      const planDefaults = (plansRes?.plans || []).find((p) => p.id === detail.plan)?.features || {};
      setDraft({
        name: detail.name || '',
        slug: detail.slug || '',
        plan: detail.plan || 'instructor',
        status: detail.status || 'active',
        max_active_learners: detail.max_active_learners ?? '',
        max_staff: detail.max_staff ?? '',
        notes: detail.notes || '',
        trial_ends_at: toDateInput(detail.trial_ends_at),
        contract_ends_at: toDateInput(detail.contract_ends_at),
        features: {
          ...emptyFeatures(),
          ...planDefaults,
          ...(detail.features || detail.entitlements?.features || {}),
        },
      });
    } catch (err) {
      push(errMessage(err, 'Nu am putut încărca academia.'), 'error');
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, push]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPlanDefaults = (planId) => {
    const plan = planOptions.find((p) => p.id === planId);
    setDraft((prev) => ({
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

  const handleSave = async (e) => {
    e.preventDefault();
    if (!draft || !company) return;
    setSaving(true);
    try {
      const res = await platform.updateCompany(company.id, {
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        plan: draft.plan,
        status: draft.status,
        notes: draft.notes.trim() || null,
        max_active_learners: draft.max_active_learners === '' || draft.max_active_learners === null
          ? null
          : Number(draft.max_active_learners),
        max_staff: draft.max_staff === '' || draft.max_staff === null
          ? null
          : Number(draft.max_staff),
        trial_ends_at: draft.status === 'trial' ? dateInputToIso(draft.trial_ends_at) : null,
        contract_ends_at: dateInputToIso(draft.contract_ends_at),
      });
      const updated = res?.company || company;
      setCompany(updated);
      push('Academia a fost actualizată.', 'success');
      await load();
    } catch (err) {
      push(errMessage(err, 'Salvarea a eșuat.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!company || !inviteEmail.trim()) return;
    try {
      const res = await platform.inviteOwner(company.id, {
        owner_email: inviteEmail.trim(),
        owner_name: inviteName.trim() || undefined,
      });
      push('Invitația pentru owner a fost trimisă.', 'success');
      if (res?.invite_url) {
        setInviteUrl(res.invite_url);
        const copied = await copyText(res.invite_url);
        if (copied) push('Linkul de invitație a fost copiat.', 'success');
      }
      setInviteEmail('');
      setInviteName('');
      await load();
    } catch (err) {
      push(errMessage(err, 'Invitația a eșuat.'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!company) return;
    if (deleteSlug.trim() !== company.slug) {
      push(`Scrie exact slug-ul „${company.slug}” pentru a confirma.`, 'error');
      return;
    }
    if (!window.confirm(
      `Ștergi DEFINITIV academia „${company.name}”?\n\nSe șterg utilizatori, cursuri, teste și tot conținutul. Acțiunea nu poate fi anulată.`,
    )) {
      return;
    }
    setDeleting(true);
    try {
      await platform.deleteCompany(company.id, company.slug);
      push('Academia a fost ștearsă definitiv.', 'success');
      navigate('/clients');
    } catch (err) {
      push(errMessage(err, 'Ștergerea a eșuat.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !company || !draft) {
    return <p className="bo-muted">Se încarcă academia…</p>;
  }

  const healthReasons = (company.health?.reasons || []).map((r) => REASON_LABELS[r] || r);

  return (
    <>
      <header className="bo-page-head">
        <div>
          <p className="bo-crumb">
            <Link to="/clients">Clienți</Link>
            <span>/</span>
            <span>{company.slug}</span>
          </p>
          <h1>{company.name}</h1>
          <p>
            <span className={`bo-pill is-${company.status}`}>{STATUS_LABELS[company.status] || company.status}</span>
            {' · '}
            {company.plan_label || PLAN_LABELS[company.plan] || company.plan}
            {company.users_count != null ? ` · ${company.users_count} utilizatori` : ''}
          </p>
        </div>
        <div className="bo-page-head__actions">
          <button type="button" className="bo-btn bo-btn--ghost" onClick={() => navigate('/clients')}>
            Înapoi
          </button>
        </div>
      </header>

      <div className="bo-detail-grid">
        <section className="bo-card">
          <div className="bo-card__head">
            <h2>Stare</h2>
          </div>
          <dl className="bo-dl">
            <div>
              <dt>Sănătate</dt>
              <dd data-severity={company.health?.severity || 'ok'}>
                {company.health?.severity === 'ok' ? 'OK' : healthReasons.join(' · ') || company.health?.severity}
              </dd>
            </div>
            <div>
              <dt>Trial</dt>
              <dd>
                {formatDate(company.trial_ends_at)}
                {company.health?.trial_days_left != null && company.status === 'trial' && (
                  <span className="bo-muted">
                    {' '}
                    (
                    {company.health.trial_days_left < 0
                      ? 'expirat'
                      : `${company.health.trial_days_left} zile`}
                    )
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd>{formatDate(company.contract_ends_at)}</dd>
            </div>
            <div>
              <dt>Creat</dt>
              <dd>{formatDate(company.created_at)}</dd>
            </div>
            <div>
              <dt>Invitații owner deschise</dt>
              <dd>{company.pending_owner_invites ?? 0}</dd>
            </div>
          </dl>
          <div className="bo-detail-seats">
            <div>
              <span className="bo-muted">Cursanți</span>
              <SeatMeter
                used={company.entitlements?.seats?.learners?.used}
                max={company.entitlements?.seats?.learners?.max}
                pending={company.entitlements?.seats?.learners?.pending_invites}
              />
            </div>
            <div>
              <span className="bo-muted">Staff</span>
              <SeatMeter
                used={company.entitlements?.seats?.staff?.used}
                max={company.entitlements?.seats?.staff?.max}
                pending={company.entitlements?.seats?.staff?.pending_invites}
              />
            </div>
          </div>
        </section>

        <section className="bo-card">
          <div className="bo-card__head">
            <h2>Plan & date</h2>
          </div>
          <form className="bo-stack-form" onSubmit={handleSave}>
            <label>
              Nume
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <label>
              Slug
              <input
                required
                value={draft.slug}
                onChange={(e) => setDraft((p) => ({ ...p, slug: e.target.value }))}
              />
            </label>
            <label>
              Plan
              <select value={draft.plan} onChange={(e) => applyPlanDefaults(e.target.value)}>
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={draft.status}
                onChange={(e) => {
                  const status = e.target.value;
                  setDraft((p) => ({
                    ...p,
                    status,
                    trial_ends_at: status === 'trial' && !p.trial_ends_at
                      ? toDateInput(new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString())
                      : p.trial_ends_at,
                  }));
                }}
              >
                <option value="trial">Trial</option>
                <option value="active">Activ</option>
                <option value="suspended">Suspendat</option>
              </select>
            </label>
            {draft.status === 'trial' && (
              <label>
                Trial până la
                <input
                  type="date"
                  value={draft.trial_ends_at}
                  onChange={(e) => setDraft((p) => ({ ...p, trial_ends_at: e.target.value }))}
                />
              </label>
            )}
            <label>
              Contract până la
              <input
                type="date"
                value={draft.contract_ends_at}
                onChange={(e) => setDraft((p) => ({ ...p, contract_ends_at: e.target.value }))}
              />
            </label>
            <label>
              Cap cursanți
              <input
                type="number"
                min={1}
                value={draft.max_active_learners ?? ''}
                onChange={(e) => setDraft((p) => ({ ...p, max_active_learners: e.target.value }))}
                placeholder={draft.plan === 'business' ? 'nelimitat' : ''}
              />
            </label>
            <label>
              Cap staff
              <input
                type="number"
                min={1}
                value={draft.max_staff ?? ''}
                onChange={(e) => setDraft((p) => ({ ...p, max_staff: e.target.value }))}
              />
            </label>
            <label>
              Note interne
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </label>
            <div className="bo-plan-preview">
              <strong>Inclus în {planOptions.find((p) => p.id === draft.plan)?.label || draft.plan}</strong>
              <p>{featureSummary(draft.features)}</p>
            </div>
            <button type="submit" className="bo-btn bo-btn--primary" disabled={saving}>
              {saving ? 'Se salvează…' : 'Salvează'}
            </button>
          </form>
        </section>

        <section className="bo-card">
          <div className="bo-card__head">
            <h2>Invitație owner</h2>
          </div>
          <p className="bo-muted">
            {company.pending_owner_invites
              ? `${company.pending_owner_invites} invitație deschisă.`
              : 'Trimite din nou dacă owner-ul nu a primit mailul.'}
          </p>
          <form className="bo-stack-form" onSubmit={handleInvite}>
            <label>
              Email
              <input
                type="email"
                required
                placeholder="owner@firma.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <label>
              Nume
              <input
                placeholder="opțional"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </label>
            <button type="submit" className="bo-btn bo-btn--primary">
              Trimite invitația
            </button>
          </form>
          {inviteUrl ? (
            <div className="bo-invite" style={{ marginTop: '0.75rem' }}>
              <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="bo-btn bo-btn--sm"
                onClick={async () => {
                  const ok = await copyText(inviteUrl);
                  push(ok ? 'Link copiat.' : 'Copiază din câmp.', ok ? 'success' : 'info');
                }}
              >
                Copiază linkul
              </button>
            </div>
          ) : null}
        </section>

        <section className="bo-card bo-card--danger">
          <div className="bo-card__head">
            <h2>Zonă periculoasă</h2>
          </div>
          <p className="bo-muted">
            Ștergere definitivă: utilizatori, cursuri, teste și tot conținutul.
            Scrie slug-ul <code>{company.slug}</code>.
          </p>
          <div className="bo-invite-row">
            <input
              type="text"
              placeholder={company.slug}
              value={deleteSlug}
              onChange={(e) => setDeleteSlug(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className="bo-btn bo-btn--sm bo-btn--danger"
              disabled={deleting || deleteSlug.trim() !== company.slug}
              onClick={handleDelete}
            >
              {deleting ? 'Se șterge…' : 'Șterge academia'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
