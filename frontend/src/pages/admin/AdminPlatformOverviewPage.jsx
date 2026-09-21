import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { isPlatformAdmin } from '../../utils/entitlements';
import {
	PLAN_LABELS,
	REASON_LABELS,
	STATUS_LABELS,
	seatPercent,
	seats,
} from './platformConsole';
import './AdminPlatformCompaniesPage.css';

function SeatMeter({ used, max }) {
	const pct = seatPercent(used, max);
	return (
		<div className="admin-platform-seat">
			<span>{seats(used, max)}</span>
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

const AdminPlatformOverviewPage = () => {
	const { showToast } = useToast();
	const { user } = useAuth();
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		try {
			setLoading(true);
			const res = await adminService.getPlatformOverview();
			setData(res);
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu am putut încărca panoul platformei.', 'error');
		} finally {
			setLoading(false);
		}
	}, [showToast]);

	useEffect(() => {
		if (!isPlatformAdmin(user)) return;
		load();
	}, [load, user]);

	if (!isPlatformAdmin(user)) {
		return (
			<div className="admin-container">
				<p>Nu ai acces la consola platformei.</p>
			</div>
		);
	}

	const kpis = data?.kpis;
	const companyTotal = kpis?.companies || 0;
	const planTotal = Math.max(
		1,
		(data?.by_plan?.instructor || 0) + (data?.by_plan?.academie || 0) + (data?.by_plan?.business || 0)
	);
	const uniqueAttention = [];
	const seen = new Set();
	(data?.attention || []).forEach((item) => {
		if (seen.has(item.id)) return;
		seen.add(item.id);
		uniqueAttention.push(item);
	});

	return (
		<div className="admin-container admin-platform-page">
			<header className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Panou platformă</h1>
					<p className="admin-page-subtitle">
						Academii, abonamente și locuri. Fără acces la cursurile clienților.
					</p>
				</div>
				<Link to="/admin/platform/companies?new=1" className="admin-btn admin-btn-primary">
					Academie nouă
				</Link>
			</header>

			{loading ? (
				<div className="admin-platform-skel" aria-busy="true">Se încarcă panoul…</div>
			) : (
				<>
					<section className="admin-platform-kpis">
						<article>
							<span>Academii</span>
							<strong>{companyTotal}</strong>
							<small>
								{data?.by_status?.active || 0} active · {data?.by_status?.trial || 0} trial · {data?.by_status?.suspended || 0} suspendate
							</small>
						</article>
						<article>
							<span>Utilizatori</span>
							<strong>{kpis?.users ?? 0}</strong>
							<small>Conturi în toate academiile</small>
						</article>
						<article>
							<span>Cursanți</span>
							<strong>{seats(kpis?.learners?.used, kpis?.learners?.max)}</strong>
							<small>Folosite / incluse în planuri</small>
						</article>
						<article>
							<span>Staff</span>
							<strong>{seats(kpis?.staff?.used, kpis?.staff?.max)}</strong>
							<small>Owneri, admini, instructori</small>
						</article>
						<article className={(kpis?.needs_attention || 0) > 0 ? 'is-alert' : ''}>
							<span>De rezolvat</span>
							<strong>{kpis?.needs_attention ?? 0}</strong>
							<small>{kpis?.leads_new ?? 0} cereri de acces noi</small>
						</article>
					</section>

					<div className="admin-platform-split">
						<section className="admin-platform-card">
							<div className="admin-platform-card__head">
								<h2>Coadă</h2>
								{uniqueAttention.length > 0 && (
									<Link to="/admin/platform/companies">Vezi academiile</Link>
								)}
							</div>
							{uniqueAttention.length === 0 ? (
								<p className="admin-platform-empty">Nimic urgent. Toate academiile sunt în parametrii planului.</p>
							) : (
								<ul className="admin-platform-attention">
									{uniqueAttention.map((item) => (
										<li key={item.id} data-severity={item.health?.severity || 'watch'}>
											<div>
												<strong>{item.name}</strong>
												<span>
													{(item.health?.reasons || [item.reason]).map((r) => REASON_LABELS[r] || r).join(' · ')}
												</span>
												<span className="admin-platform-muted">
													{item.plan_label} · {STATUS_LABELS[item.status] || item.status}
													{item.health?.trial_days_left != null && item.status === 'trial'
														? ` · ${item.health.trial_days_left < 0 ? 'expirat' : `${item.health.trial_days_left} zile rămase`}`
														: ''}
												</span>
											</div>
											<Link
												className="admin-btn admin-btn-sm"
												to={`/admin/platform/companies?q=${encodeURIComponent(item.slug || item.name)}`}
											>
												Deschide
											</Link>
										</li>
									))}
								</ul>
							)}
						</section>

						<section className="admin-platform-card">
							<h2>Abonamente</h2>
							<div className="admin-platform-plan-mix">
								{['instructor', 'academie', 'business'].map((id) => {
									const count = data?.by_plan?.[id] || 0;
									const pct = Math.round((count / planTotal) * 100);
									return (
										<div key={id} className="admin-platform-plan-mix__row">
											<div className="admin-platform-plan-mix__meta">
												<strong>{PLAN_LABELS[id]}</strong>
												<span>{count}</span>
											</div>
											<div className="admin-platform-plan-mix__bar">
												<span style={{ width: `${pct}%` }} />
											</div>
										</div>
									);
								})}
							</div>

							{(data?.leads_recent || []).length > 0 && (
								<div className="admin-platform-leads-mini">
									<h3>Cereri de acces</h3>
									<ul>
										{(data.leads_recent || []).map((lead) => (
											<li key={lead.id}>
												<strong>{lead.company_name || lead.name}</strong>
												<span>{lead.email}</span>
												<Link
													className="admin-btn admin-btn-sm"
													to={`/admin/platform/companies?new=1&lead=${lead.id}`}
												>
													Convertește
												</Link>
											</li>
										))}
									</ul>
								</div>
							)}
						</section>
					</div>

					<section className="admin-platform-card">
						<div className="admin-platform-card__head">
							<h2>Academii</h2>
							<Link to="/admin/platform/companies">Toate</Link>
						</div>
						{companyTotal === 0 ? (
							<div className="admin-platform-empty admin-platform-empty--cta">
								<p>Nicio academie încă. Creezi primul cont după un contract sau o cerere de acces.</p>
								<Link to="/admin/platform/companies?new=1" className="admin-btn admin-btn-primary">
									Academie nouă
								</Link>
							</div>
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
										</tr>
									</thead>
									<tbody>
										{(data?.companies || []).map((c) => (
											<tr key={c.id} data-severity={c.health?.severity || 'ok'}>
												<td>
													<Link to={`/admin/platform/companies?q=${encodeURIComponent(c.slug || c.name)}`}>
														<strong>{c.name}</strong>
													</Link>
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
													/>
												</td>
												<td>
													<SeatMeter
														used={c.entitlements?.seats?.staff?.used}
														max={c.entitlements?.seats?.staff?.max}
													/>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>
				</>
			)}
		</div>
	);
};

export default AdminPlatformOverviewPage;
