import React, { useState, useEffect } from 'react';
import {
	EnvelopeSimple,
	FloppyDisk,
	IdentificationBadge,
	PaintBrush,
	ShieldCheck,
} from '@phosphor-icons/react';
import ThemePreferenceControl from '../components/ThemePreferenceControl';
import { profileService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const emptyFieldErrors = { name: '', email: '', bio: '' };

const StudentSettingsPage = () => {
	const { user, loading: authLoading, checkAuth } = useAuth();
	const { showToast } = useToast();
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [bio, setBio] = useState('');
	const [saving, setSaving] = useState(false);
	const [fieldErrors, setFieldErrors] = useState(emptyFieldErrors);

	useEffect(() => {
		if (!user) return;
		setName(user.name ?? '');
		setEmail(user.email ?? '');
		setBio(user.bio ?? '');
		setFieldErrors(emptyFieldErrors);
	}, [user]);

	const isStudent = user?.role === 'student';
	const initials = (user?.name || user?.email || 'U')
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();

	const handleSubmit = async (e) => {
		e.preventDefault();
		setFieldErrors(emptyFieldErrors);
		setSaving(true);
		try {
			const payload = isStudent
				? { email: email.trim(), bio: bio.trim() || '' }
				: { name: name.trim(), email: email.trim(), bio: bio.trim() || '' };
			await profileService.updateProfile(payload);
			await checkAuth();
			showToast('Datele au fost salvate', 'success');
		} catch (err) {
			const res = err?.response;
			if (res?.status === 422 && res.data?.errors) {
				const next = { ...emptyFieldErrors };
				for (const key of Object.keys(next)) {
					if (res.data.errors[key]?.[0]) next[key] = res.data.errors[key][0];
				}
				setFieldErrors(next);
				showToast(res.data.message || 'Verifica campurile marcate', 'error');
			} else {
				showToast(res?.data?.message || 'Nu s-au putut salva datele', 'error');
			}
		} finally {
			setSaving(false);
		}
	};

	if (authLoading || !user) {
		return (
			<div className="va-profile-container student-settings-page">
				<p className="va-muted">Se incarca...</p>
			</div>
		);
	}

	return (
		<div className="va-profile-container student-settings-page">
			<header className="student-settings-header">
				<h1 className="va-page-title student-settings-title">Setari</h1>
			</header>

			<div className="student-settings-grid">
				<div className="student-settings-rail">
					<aside className="student-settings-account-card" aria-label="Rezumat cont">
						<div className="student-settings-account-top">
							<div className="student-settings-avatar">{initials}</div>
							<div className="student-settings-account-copy">
								<h2>{user.name || 'Student'}</h2>
								<p>{user.email}</p>
							</div>
						</div>
						<div className="student-settings-account-meta">
							<span>
								<ShieldCheck size={16} weight="duotone" aria-hidden />
								{isStudent ? 'Student' : 'Utilizator'}
							</span>
							<span>
								<EnvelopeSimple size={16} weight="duotone" aria-hidden />
								Email activ
							</span>
						</div>
					</aside>

					<section
						className="student-settings-section student-settings-appearance-card"
						aria-labelledby="student-settings-appearance"
					>
						<div className="student-settings-section-header">
							<span className="student-settings-section-icon">
								<PaintBrush size={18} weight="duotone" aria-hidden />
							</span>
							<div>
								<h2 id="student-settings-appearance" className="student-settings-section-title">
									Aspect
								</h2>
							</div>
						</div>
						<div className="va-profile-theme-section student-settings-theme">
							<ThemePreferenceControl className="student-settings-theme-control" />
						</div>
					</section>
				</div>

				<section
					className="student-settings-section student-settings-section-main"
					aria-labelledby="student-settings-personal"
				>
				<div className="student-settings-section-header">
					<span className="student-settings-section-icon">
						<IdentificationBadge size={18} weight="duotone" aria-hidden />
					</span>
					<div>
						<h2 id="student-settings-personal" className="student-settings-section-title">
							Date personale
						</h2>
					</div>
				</div>
				<form className="student-settings-form" onSubmit={handleSubmit} noValidate>
					<div className="student-settings-form-grid">
						<div className="student-settings-field">
							<label className="va-input-label" htmlFor="settings-name">
								Nume
							</label>
							<input
								id="settings-name"
								className={`va-input${fieldErrors.name ? ' error' : ''}`}
								type="text"
								autoComplete="name"
								value={name}
								onChange={(ev) => setName(ev.target.value)}
								disabled={saving || isStudent}
								readOnly={isStudent}
								maxLength={255}
								aria-readonly={isStudent || undefined}
							/>
							{fieldErrors.name ? <p className="va-input-error">{fieldErrors.name}</p> : null}
						</div>
						<div className="student-settings-field">
							<label className="va-input-label" htmlFor="settings-email">
								Email
							</label>
							<input
								id="settings-email"
								className={`va-input${fieldErrors.email ? ' error' : ''}`}
								type="email"
								autoComplete="email"
								value={email}
								onChange={(ev) => setEmail(ev.target.value)}
								disabled={saving}
								maxLength={255}
							/>
							{fieldErrors.email ? <p className="va-input-error">{fieldErrors.email}</p> : null}
						</div>
					</div>
					<div className="student-settings-field">
						<label className="va-input-label" htmlFor="settings-bio">
							Despre mine <span className="student-settings-label-note">(optional)</span>
						</label>
						<textarea
							id="settings-bio"
							className={`va-input student-settings-textarea${fieldErrors.bio ? ' error' : ''}`}
							rows={4}
							value={bio}
							onChange={(ev) => setBio(ev.target.value)}
							disabled={saving}
							maxLength={2000}
						/>
						{fieldErrors.bio ? <p className="va-input-error">{fieldErrors.bio}</p> : null}
					</div>
					<div className="student-settings-actions">
						<button type="submit" className="lms-btn-primary" disabled={saving}>
							<FloppyDisk size={17} weight="duotone" aria-hidden />
							{saving ? 'Se salveaza...' : 'Salveaza'}
						</button>
					</div>
				</form>
				</section>
			</div>
		</div>
	);
};

export default StudentSettingsPage;
