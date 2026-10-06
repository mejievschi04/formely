import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api';
import { useAuth } from '../../../contexts/AuthContextShared.js';
import { useToast } from '../../../contexts/ToastContextShared.js';
import { toImageUrl } from '../../../utils/imageUrl';

const formatCap = (max) => (max == null ? 'nelimitat' : String(max));

/** Formely: numele, logo-ul și planul academiei (în locul setărilor globale din Volta). */
const CompanyAcademyPanel = ({ readOnly }) => {
	const { user, checkAuth } = useAuth();
	const { success, error: showError } = useToast();
	const fileRef = useRef(null);
	const [name, setName] = useState(user?.company?.name || '');
	const [busy, setBusy] = useState(false);
	const [emailNotifications, setEmailNotifications] = useState(null);

	useEffect(() => {
		let cancelled = false;
		api.get('/admin/settings')
			.then((res) => { if (!cancelled) setEmailNotifications(Boolean(res.data?.email_notifications?.value)); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		setName(user?.company?.name || '');
	}, [user?.company?.name]);

	const company = user?.company;
	const entitlements = user?.entitlements;
	const seats = entitlements?.seats;

	const run = async (request, message) => {
		setBusy(true);
		try {
			await request();
			await checkAuth();
			success(message);
		} catch (err) {
			showError(err.response?.data?.message || 'Nu am putut salva modificarea.');
		} finally {
			setBusy(false);
		}
	};

	const saveName = () => {
		const trimmed = name.trim();
		if (!trimmed || trimmed === company?.name) return;
		run(() => api.put('/admin/company/branding', { name: trimmed }), 'Numele academiei a fost actualizat.');
	};

	const uploadLogo = (event) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		const form = new FormData();
		form.append('logo', file);
		run(() => api.post('/admin/company/branding/logo', form), 'Logo-ul a fost încărcat.');
	};

	const toggleEmails = () => {
		const next = !emailNotifications;
		run(async () => {
			await api.put('/admin/settings', { email_notifications: next });
			setEmailNotifications(next);
		}, next ? 'Notificările email au fost pornite.' : 'Notificările email au fost oprite.');
	};

	const removeLogo = () => run(() => api.delete('/admin/company/branding/logo'), 'Logo-ul a fost șters.');

	if (!company) return null;

	return (
		<div className="admin-settings-toggle-group">
			<div className="admin-settings-toggle">
				<div className="admin-settings-toggle-info">
					<label className="admin-settings-toggle-label" htmlFor="company-name">Numele academiei</label>
					<p className="admin-settings-toggle-description">Apare în meniu și în emailurile trimise cursanților.</p>
				</div>
				<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
					<input
						id="company-name"
						className="admin-form-input"
						value={name}
						maxLength={255}
						onChange={(e) => setName(e.target.value)}
						disabled={readOnly || busy}
					/>
					{!readOnly && (
						<button type="button" className="lms-btn-primary" onClick={saveName} disabled={busy || !name.trim() || name.trim() === company.name}>
							Salvează
						</button>
					)}
				</div>
			</div>

			<div className="admin-settings-toggle">
				<div className="admin-settings-toggle-info">
					<label className="admin-settings-toggle-label">Logo</label>
					<p className="admin-settings-toggle-description">PNG, JPG, WEBP sau SVG, maxim 2 MB.</p>
				</div>
				<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
					{company.logo_url && (
						<img src={toImageUrl(company.logo_url)} alt="" style={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 8 }} />
					)}
					{!readOnly && (
						<>
							<input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadLogo} />
							<button type="button" className="lms-btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
								{company.logo_url ? 'Schimbă' : 'Încarcă'}
							</button>
							{company.logo_url && (
								<button type="button" className="lms-btn-secondary" onClick={removeLogo} disabled={busy}>
									Șterge
								</button>
							)}
						</>
					)}
				</div>
			</div>

			{emailNotifications !== null && (
				<div className="admin-settings-toggle">
					<div className="admin-settings-toggle-info">
						<label className="admin-settings-toggle-label">Notificări email</label>
						<p className="admin-settings-toggle-description">Trimite emailuri utilizatorilor academiei (invitații, cursuri noi, evenimente).</p>
					</div>
					<button
						type="button"
						className={`admin-settings-toggle-switch ${emailNotifications ? 'active' : ''}`}
						onClick={toggleEmails}
						disabled={readOnly || busy}
						aria-pressed={emailNotifications}
						aria-label="Notificări email"
					>
						<div className="admin-settings-toggle-slider" />
					</button>
				</div>
			)}

			{entitlements && (
				<div className="admin-settings-toggle">
					<div className="admin-settings-toggle-info">
						<label className="admin-settings-toggle-label">Plan: {entitlements.plan_label}</label>
						<p className="admin-settings-toggle-description">
							Cursanți activi: {seats?.learners?.used ?? 0} / {formatCap(seats?.learners?.max)}
							{' · '}Staff: {seats?.staff?.used ?? 0} / {formatCap(seats?.staff?.max)}
							{entitlements.trial_ends_at && (
								<> · Demo până la {new Date(entitlements.trial_ends_at).toLocaleDateString('ro-RO')}</>
							)}
						</p>
					</div>
				</div>
			)}
		</div>
	);
};

export default CompanyAcademyPanel;
