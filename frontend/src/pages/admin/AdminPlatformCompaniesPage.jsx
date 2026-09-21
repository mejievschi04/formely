import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { isPlatformAdmin } from '../../utils/entitlements';
import {
	ACADEMY_TRIAL_DAYS,
	FEATURE_LABELS,
	PLAN_LABELS,
	STATUS_LABELS,
	emptyFeatures,
	featureList,
	planSeatLabel,
	seatPercent,
	seats,
	slugify,
} from './platformConsole';
import './AdminPlatformCompaniesPage.css';

const EMPTY_FORM = {
	name: '',
	slug: '',
	plan: 'instructor',
	status: 'trial',
	owner_email: '',
	owner_name: '',
	notes: '',
	leadId: null,
};

function SeatMeter({ used, max, pending }) {
	const pct = seatPercent(used, max);
	return (
		<div className="admin-platform-seat">
			<span>
				{seats(used, max)}
				{pending ? ` · ${pending} invit.` : ''}
			</span>
			{pct != null && (
				<div className="admin-platform-seat__bar" aria-hidden>
					<span
						className={pct >= 100 ? 'is-full' : pct >= 85 ? 'is-high' : ''}
						style={{ width: `${pct}%` }}
					/>
				</div>
			)}
		</div>
	);
}

const AdminPlatformCompaniesPage = () => {
	const { showToast } = useToast();
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const [companies, setCompanies] = useState([]);
	const [plans, setPlans] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState(EMPTY_FORM);
	const [leads, setLeads] = useState([]);
	const [editing, setEditing] = useState(null);
	const [editDraft, setEditDraft] = useState(null);
	const [editSaving, setEditSaving] = useState(false);
	const [inviteEmail, setInviteEmail] = useState('');
	const [query, setQuery] = useState(searchParams.get('q') || '');
	const [planFilter, setPlanFilter] = useState(searchParams.get('plan') || '');
	const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
	const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
	const [createdInviteUrl, setCreatedInviteUrl] = useState('');
	const hydratedLeadId = React.useRef(null);

	const planOptions = useMemo(
		() => (plans.length
			? plans
			: [
				{ id: 'instructor', label: 'Instructor' },
				{ id: 'academie', label: 'Academie' },
				{ id: 'business', label: 'Business' },
			]),
		[plans]
	);

	const load = useCallback(async () => {
		try {
			setLoading(true);
			const [companiesRes, plansRes, leadsRes] = await Promise.all([
				adminService.listPlatformCompanies({ per_page: 100 }),
				adminService.getPlatformPlans(),
				adminService.listPlatformLeads({ per_page: 20, status: 'new' }),
			]);
			setCompanies(companiesRes?.data || companiesRes || []);
			setPlans(plansRes?.plans || []);
			setLeads(leadsRes?.data || []);
		} catch (e) {
			showToast(e?.response?.data?.message || 'Nu am putut încărca academiile.', 'error');
		} finally {
			setLoading(false);
		}
	}, [showToast]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		if (searchParams.has('q')) setQuery(searchParams.get('q') || '');
		if (searchParams.has('plan')) setPlanFilter(searchParams.get('plan') || '');
		if (searchParams.has('status')) setStatusFilter(searchParams.get('status') || '');
		if (searchParams.get('new') === '1') setCreateOpen(true);
	}, [searchParams]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return companies.filter((c) => {
			if (planFilter && c.plan !== planFilter) return false;
			if (statusFilter && c.status !== statusFilter) return false;
			if (!q) return true;
			return (
				(c.name || '').toLowerCase().includes(q)
				|| (c.slug || '').toLowerCase().includes(q)
			);
		});
	}, [companies, planFilter, query, statusFilter]);

	const updateField = (key) => (e) => {
		const value = e.target.value;
		setForm((prev) => {
			const next = { ...prev, [key]: value };
			if (key === 'name' && !prev.slugTouched) {
				next.slug = slugify(value);
			}
			return next;
		});
	};

	const closeCreate = () => {
		setCreateOpen(false);
		setCreatedInviteUrl('');
		setForm(EMPTY_FORM);
		hydratedLeadId.current = null;
		const next = new URLSearchParams(searchParams);
		next.delete('new');
		next.delete('lead');
		setSearchParams(next, { replace: true });
	};

	const handleCreate = async (e) => {
		e.preventDefault();
		if (!form.name.trim() || !form.slug.trim() || !form.owner_email.trim()) {
			showToast('Numele academiei, slug-ul și emailul owner-ului sunt obligatorii.', 'error');
			return;
		}
		try {
			setSaving(true);
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
				ends.setDate(ends.getDate() + ACADEMY_TRIAL_DAYS);
				payload.trial_ends_at = ends.toISOString();
			}
			const created = await adminService.createPlatformCompany(payload);
			if (form.leadId) {
				try {
					await adminService.updatePlatformLead(form.leadId, { status: 'won' });
				} catch {
					/* lead update is optional */
				}
			}
			setCreatedInviteUrl(created?.invite_url || '');
			showToast('Academia a fost creată. Copiază linkul de invitație dacă emailul nu ajunge.', 'success');
			await load();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Crearea a eșuat.', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleStatus = async (company, status) => {
		if (status === 'suspended' && !window.confirm(`Suspendezi „${company.name}”? Utilizatorii nu se mai pot autentifica.`)) {
			return;
		}
		try {
			await adminService.updatePlatformCompany(company.id, { status });
			showToast(status === 'active' ? 'Academia este activă.' : 'Status actualizat.', 'success');
			await load();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Actualizarea a eșuat.', 'error');
		}
	};

	const openEdit = async (company) => {
		const planDefaults = planOptions.find((p) => p.id === company.plan)?.features || {};
		let detail = company;
		try {
			const res = await adminService.getPlatformCompany(company.id);
			detail = res?.company || company;
		} catch {
			/* list payload is enough to edit */
		}
		setEditing(detail);
		setInviteEmail('');
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

	const fillFromLead = useCallback((lead, scroll = true) => {
		const name = lead.company_name || lead.name || '';
		setForm({
			...EMPTY_FORM,
			name,
			slug: slugify(name),
			plan: ['instructor', 'academie', 'business'].includes(lead.plan_interest)
				? lead.plan_interest
				: 'instructor',
			owner_email: lead.email || '',
			owner_name: lead.name || '',
			leadId: lead.id,
		});
		setCreateOpen(true);
		if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	useEffect(() => {
		const leadId = searchParams.get('lead');
		if (!leadId || leads.length === 0) return;
		if (hydratedLeadId.current === String(leadId)) return;
		const lead = leads.find((l) => String(l.id) === String(leadId));
		if (!lead) return;
		hydratedLeadId.current = String(leadId);
		fillFromLead(lead, false);
	}, [leads, searchParams, fillFromLead]);

	const selectedPlan = planOptions.find((p) => p.id === form.plan);
	const selectedFeatures = featureList(selectedPlan?.features);
	const selectedSeats = planSeatLabel(selectedPlan);

	const handleSaveEdit = async (e) => {
		e.preventDefault();
		if (!editing || !editDraft) return;
		try {
			setEditSaving(true);
			const payload = {
				plan: editDraft.plan,
				status: editDraft.status,
				notes: editDraft.notes || null,
				max_active_learners: editDraft.max_active_learners === '' || editDraft.max_active_learners === null
					? null
					: Number(editDraft.max_active_learners),
				max_staff: editDraft.max_staff === '' || editDraft.max_staff === null
					? null
					: Number(editDraft.max_staff),
			};
			await adminService.updatePlatformCompany(editing.id, payload);
			showToast('Planul academiei a fost actualizat.', 'success');
			setEditing(null);
			setEditDraft(null);
			await load();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Actualizarea a eșuat.', 'error');
		} finally {
			setEditSaving(false);
		}
	};

	const handleResendInvite = async (e) => {
		e.preventDefault();
		if (!editing || !inviteEmail.trim()) return;
		try {
			await adminService.invitePlatformCompanyOwner(editing.id, {
				owner_email: inviteEmail.trim(),
			});
			showToast('Invitația pentru owner a fost retrimisă.', 'success');
			setInviteEmail('');
		} catch (err) {
			showToast(err?.response?.data?.message || 'Invitația a eșuat.', 'error');
		}
	};

	if (!isPlatformAdmin(user)) {
		return (
			<div className="admin-container">
				<p>Nu ai acces la administrarea academiilor.</p>
			</div>
		);
	}

	return (
		<div className="admin-container admin-platform-page">
			<header className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Academii</h1>
					<p className="admin-page-subtitle">
						Provisionare după contract. Funcțiile se activează strict după plan.
					</p>
				</div>
				<button type="button" className="admin-btn admin-btn-primary" onClick={() => setCreateOpen(true)}>
					Academie nouă
				</button>
			</header>

			{leads.length > 0 && (
				<section className="admin-platform-leads-strip">
					<strong>Cereri de acces</strong>
					{leads.slice(0, 4).map((lead) => (
						<button key={lead.id} type="button" onClick={() => fillFromLead(lead)}>
							{lead.company_name || lead.name}
							<span>{lead.plan_interest || '—'}</span>
						</button>
					))}
				</section>
			)}

			<div className="admin-platform-toolbar">
				<input
					type="search"
					placeholder="Caută nume sau slug…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-label="Caută academii"
				/>
				<select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Filtru plan">
					<option value="">Toate planurile</option>
					{planOptions.map((p) => (
						<option key={p.id} value={p.id}>{p.label}</option>
					))}
				</select>
				<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtru status">
					<option value="">Toate statusurile</option>
					<option value="active">Activ</option>
					<option value="trial">Trial</option>
					<option value="suspended">Suspendat</option>
				</select>
			</div>

			{loading ? (
				<div className="admin-platform-skel">Se încarcă…</div>
			) : (
				<section className="admin-platform-card">
					<div className="admin-platform-card__head">
						<h2>{filtered.length} din {companies.length}</h2>
					</div>
					{filtered.length === 0 ? (
						<p className="admin-platform-empty">Nicio academie pe filtrul curent.</p>
					) : (
						<div className="admin-platform-table-wrap">
							<table className="admin-platform-table">
								<thead>
									<tr>
										<th>Nume</th>
										<th>Plan</th>
										<th>Status</th>
										<th>Cursanți</th>
										<th>Staff</th>
										<th>Acțiuni</th>
									</tr>
								</thead>
								<tbody>
									{filtered.map((c) => (
										<tr key={c.id} data-severity={c.health?.severity || 'ok'}>
											<td>
												<strong>{c.name}</strong>
												<div className="admin-platform-muted">{c.slug}</div>
											</td>
											<td>{c.plan_label || PLAN_LABELS[c.plan] || c.plan}</td>
											<td>
												<span className={`admin-platform-pill is-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span>
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
											<td className="admin-platform-actions">
												<button type="button" className="admin-btn admin-btn-sm" onClick={() => openEdit(c)}>
													Plan
												</button>
												{c.status !== 'active' && (
													<button type="button" className="admin-btn admin-btn-sm" onClick={() => handleStatus(c, 'active')}>Activează</button>
												)}
												{c.status !== 'suspended' && (
													<button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={() => handleStatus(c, 'suspended')}>Suspendă</button>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			)}

			{createOpen ? (
				<div className="admin-platform-edit-overlay" onClick={closeCreate}>
					<form
						className="admin-platform-edit-panel"
						onClick={(e) => e.stopPropagation()}
						onSubmit={handleCreate}
					>
						<header>
							<h2>Academie nouă</h2>
							<button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={closeCreate}>
								Închide
							</button>
						</header>
						{createdInviteUrl ? (
							<div className="admin-platform-invite-box">
								<p>Academia există. Trimite owner-ului acest link (emailul poate întârzia sau e dezactivat):</p>
								<input readOnly value={createdInviteUrl} onFocus={(e) => e.target.select()} />
								<button
									type="button"
									className="admin-btn admin-btn-primary"
									onClick={async () => {
										try {
											await navigator.clipboard.writeText(createdInviteUrl);
											showToast('Link copiat.', 'success');
										} catch {
											showToast('Copiază linkul din câmp.', 'info');
										}
									}}
								>
									Copiază invitația
								</button>
							</div>
						) : null}
						<p className="admin-platform-muted">Owner-ul primește invitația. Funcțiile urmează planul, nu se bifează separat.</p>
						<div className="admin-platform-form">
							<label>
								Nume academie
								<input value={form.name} onChange={updateField('name')} required autoFocus />
							</label>
							<label>
								Slug
								<input
									value={form.slug}
									onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value, slugTouched: true }))}
									required
								/>
							</label>
							<label>
								Abonament
								<select value={form.plan} onChange={updateField('plan')}>
									{planOptions.map((p) => (
										<option key={p.id} value={p.id}>{p.label}</option>
									))}
								</select>
							</label>
							<div className="admin-platform-plan-preview">
								<strong>{selectedPlan?.label || form.plan}</strong>
								<p>{selectedSeats}{selectedPlan?.max_staff ? ` · până la ${selectedPlan.max_staff} staff` : ''}</p>
								<p>{selectedFeatures.length > 0 ? selectedFeatures.join(' · ') : 'Cursuri, teste, progres și certificări.'}</p>
							</div>
							<label>
								Start
								<select value={form.status} onChange={updateField('status')}>
									<option value="trial">Demo {ACADEMY_TRIAL_DAYS} zile</option>
									<option value="active">Activ (contract)</option>
								</select>
							</label>
							<label>
								Email owner
								<input type="email" value={form.owner_email} onChange={updateField('owner_email')} placeholder="owner@firma.com" required />
							</label>
							<label>
								Nume owner
								<input value={form.owner_name} onChange={updateField('owner_name')} />
							</label>
							<label>
								Note interne
								<textarea rows={3} value={form.notes} onChange={updateField('notes')} />
							</label>
							<button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
								{saving ? 'Se creează…' : 'Creează și trimite invitația'}
							</button>
						</div>
					</form>
				</div>
			) : null}

			{editing && editDraft ? (
				<div className="admin-platform-edit-overlay" onClick={() => { setEditing(null); setEditDraft(null); }}>
					<form
						className="admin-platform-edit-panel"
						onClick={(e) => e.stopPropagation()}
						onSubmit={handleSaveEdit}
					>
						<header>
							<h2>{editing.name}</h2>
							<button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={() => { setEditing(null); setEditDraft(null); }}>
								Închide
							</button>
						</header>
						<div className="admin-platform-form">
							<label>
								Plan
								<select
									value={editDraft.plan}
									onChange={(e) => applyPlanDefaults(e.target.value)}
								>
									{planOptions.map((p) => (
										<option key={p.id} value={p.id}>{p.label}</option>
									))}
								</select>
							</label>
							<label>
								Status
								<select
									value={editDraft.status}
									onChange={(e) => setEditDraft((p) => ({ ...p, status: e.target.value }))}
								>
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
								<textarea
									rows={3}
									value={editDraft.notes}
									onChange={(e) => setEditDraft((p) => ({ ...p, notes: e.target.value }))}
								/>
							</label>
							<div className="admin-platform-plan-preview">
								<strong>Inclus în {planOptions.find((p) => p.id === editDraft.plan)?.label || editDraft.plan}</strong>
								<p>
									{Object.entries(FEATURE_LABELS)
										.filter(([key]) => editDraft.features?.[key])
										.map(([, label]) => label)
										.join(' · ') || 'Cursuri, teste, progres și certificări.'}
								</p>
							</div>
							<button type="submit" className="admin-btn admin-btn-primary" disabled={editSaving}>
								{editSaving ? 'Se salvează…' : 'Salvează'}
							</button>

							<div className="admin-platform-invite-box">
								<h3>Invitație owner</h3>
								<p className="admin-platform-muted">
									{editing.pending_owner_invites
										? `${editing.pending_owner_invites} invitație deschisă.`
										: 'Trimite din nou dacă owner-ul nu a primit mailul.'}
								</p>
								<div className="admin-platform-invite-row">
									<input
										type="email"
										placeholder="owner@firma.com"
										value={inviteEmail}
										onChange={(e) => setInviteEmail(e.target.value)}
									/>
									<button type="button" className="admin-btn admin-btn-sm" onClick={handleResendInvite}>
										Trimite
									</button>
								</div>
							</div>
						</div>
					</form>
				</div>
			) : null}
		</div>
	);
};

export default AdminPlatformCompaniesPage;
