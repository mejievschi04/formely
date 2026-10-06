import React, { useState, useEffect } from 'react';
import {
	EnvelopeSimple,
	FloppyDisk,
	IdentificationBadge,
	ShieldCheck,
} from '@phosphor-icons/react';
import { profileService } from '../services/api';
import { useAuth } from '../contexts/AuthContextShared.js';
import { useToast } from '../contexts/ToastContextShared.js';
import { toImageUrl } from '../utils/imageUrl';
import '../styles/student-settings.css';
import { nameInitials } from '../utils/initials';

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
	const initials = nameInitials(user?.name || user?.email);

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
				showToast(res.data.message || 'Verifică câmpurile marcate', 'error');
			} else {
				showToast(res?.data?.message || 'Nu s-au putut salva datele', 'error');
			}
		} finally {
			setSaving(false);
		}
	};

	if (authLoading || !user) {
		return (
			<div className="student-settings-page">
				<p className="va-muted">Se încarcă...</p>
			</div>
		);
	}

	return (
		<div className="student-settings-page">
			<header className="student-settings-header">
				<h1 className="va-page-title student-settings-title">Setări</h1>
			</header>

			<div className="student-settings-grid">
				<div className="student-settings-rail">
					<aside className="student-settings-account-card" aria-label="Rezumat cont">
						<div className="student-settings-account-top">
							<div className="student-settings-avatar" aria-hidden>
								{user.avatar ? (
									<img src={toImageUrl(user.avatar) || user.avatar} alt="" />
								) : (
									initials
								)}
							</div>
							<div className="student-settings-account-copy">
								<h2>{user.name || 'Utilizator'}</h2>
								<p>{user.email}</p>
							</div>
						</div>
						<div className="student-settings-account-meta">
							<span className="student-settings-chip">
								<ShieldCheck size={16} weight="duotone" aria-hidden />
								{isStudent ? 'Utilizator' : (user?.role === 'admin' ? 'Administrator' : user?.role === 'instructor' ? 'Instructor' : 'Utilizator')}
							</span>
							<span className="student-settings-chip">
								<EnvelopeSimple size={16} weight="duotone" aria-hidden />
								Email activ
							</span>
						</div>
					</aside>

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
							Despre mine <span className="student-settings-label-note">(opțional)</span>
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
						<button type="submit" className="lms-btn-primary va-btn-save student-settings-save-btn" disabled={saving}>
							<FloppyDisk size={17} weight="duotone" aria-hidden />
							{saving ? 'Se salvează...' : 'Salvează'}
						</button>
					</div>
				</form>
				</section>
			</div>
		</div>
	);
};

export default StudentSettingsPage;
