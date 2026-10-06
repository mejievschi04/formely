import '../styles/auth-modern.css';
import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import {
	ArrowRight,
	CircleNotch,
	EnvelopeSimple,
	Eye,
	EyeSlash,
	Lock,
	User,
	WarningCircle,
} from '@phosphor-icons/react';
import { authService } from '../services/api';

import { useAuth } from '../contexts/AuthContextShared.js';
import logoShort from '../assets/Formely logo.png';

const InviteRegisterPage = () => {
	const { token } = useParams();
	const [invitation, setInvitation] = useState(null);
	const [invitationError, setInvitationError] = useState('');
	const [loadingInvitation, setLoadingInvitation] = useState(true);
	const [name, setName] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirmation, setPasswordConfirmation] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const { checkAuth } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		const loadInvitation = async () => {
			try {
				setLoadingInvitation(true);
				const data = await authService.getInvitation(token);
				setInvitation(data);
				if (data?.name) {
					setName(data.name);
				}
			} catch (err) {
				setInvitationError(
					err.response?.data?.message || 'Linkul de invitație este invalid sau a expirat.'
				);
			} finally {
				setLoadingInvitation(false);
			}
		};

		if (token) {
			loadInvitation();
		} else {
			setInvitationError('Link de invitație invalid.');
			setLoadingInvitation(false);
		}
	}, [token]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');

		if (password !== passwordConfirmation) {
			setError('Parolele nu coincid.');
			return;
		}

		setLoading(true);
		try {
			await authService.acceptInvitation(token, {
				name,
				password,
				password_confirmation: passwordConfirmation,
			});
			await checkAuth();
			navigate('/courses');
		} catch (err) {
			setError(
				err.response?.data?.message
				|| err.response?.data?.errors?.password?.[0]
				|| err.response?.data?.errors?.name?.[0]
				|| 'Eroare la activarea contului'
			);
		} finally {
			setLoading(false);
		}
	};

	if (loadingInvitation) {
		return (
			<div className="modern-auth-container">
				<div className="modern-auth-content">
					<div className="lms-dashboard-loading">
						<div className="lms-spinner" />
					</div>
				</div>
			</div>
		);
	}

	if (invitationError || !invitation?.valid) {
		return (
			<div className="modern-auth-container">
				<div className="modern-auth-background">
					<div className="modern-auth-gradient" />
					<div className="modern-auth-pattern" />
				</div>
				<div className="modern-auth-content">
					<div className="modern-auth-card">
						<div className="modern-auth-header">
							<div className="modern-auth-logo">
								<img src={logoShort} alt="Formely" className="modern-auth-logo-img" />
							</div>
							<h1 className="modern-auth-title">Invitație invalidă</h1>
							<p className="modern-auth-subtitle">{invitationError}</p>
						</div>
						<div className="modern-auth-footer">
							<Link to="/login" className="modern-auth-link">Mergi la autentificare</Link>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="modern-auth-container">
			<div className="modern-auth-background">
				<div className="modern-auth-gradient" />
				<div className="modern-auth-pattern" />
			</div>

			<div className="modern-auth-content">
				<div className="modern-auth-card">
					<div className="modern-auth-header">
						<div className="modern-auth-logo">
							<img src={logoShort} alt="Formely" className="modern-auth-logo-img" />
						</div>
						<h1 className="modern-auth-title">Activează-ți contul</h1>
						<p className="modern-auth-subtitle">
							Ai fost invitat(ă) pe Formely. Completează datele pentru a continua.
						</p>
					</div>

					<form onSubmit={handleSubmit} className="modern-auth-form">
						{error && (
							<div className="modern-auth-error">
								<WarningCircle size={20} weight="duotone" aria-hidden />
								<span>{error}</span>
							</div>
						)}

						<div className="modern-form-group">
							<label htmlFor="email" className="modern-form-label">Email</label>
							<div className="modern-form-input-wrapper">
								<EnvelopeSimple className="modern-form-icon" size={20} weight="duotone" aria-hidden />
								<input
									type="email"
									id="email"
									className="modern-form-input"
									value={invitation.email}
									readOnly
									disabled
								/>
							</div>
						</div>

						<div className="modern-form-group">
							<label htmlFor="name" className="modern-form-label">Nume complet</label>
							<div className="modern-form-input-wrapper">
								<User className="modern-form-icon" size={20} weight="duotone" aria-hidden />
								<input
									type="text"
									id="name"
									className="modern-form-input"
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
									placeholder="Ion Mejievski"
									autoComplete="name"
								/>
							</div>
						</div>

						<div className="modern-form-group">
							<label htmlFor="password" className="modern-form-label">Parolă</label>
							<div className="modern-form-input-wrapper">
								<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
								<input
									type={showPassword ? 'text' : 'password'}
									id="password"
									className="modern-form-input"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									minLength={8}
									placeholder="••••••••"
									autoComplete="new-password"
									style={{ paddingRight: '48px' }}
								/>
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="modern-password-toggle"
									aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
								>
									{showPassword ? (
										<EyeSlash size={20} weight="duotone" aria-hidden />
									) : (
										<Eye size={20} weight="duotone" aria-hidden />
									)}
								</button>
							</div>
							<small className="modern-form-hint">
								Minim 8 caractere, o literă mare, o literă mică și o cifră
							</small>
						</div>

						<div className="modern-form-group">
							<label htmlFor="password_confirmation" className="modern-form-label">Confirmă parola</label>
							<div className="modern-form-input-wrapper">
								<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
								<input
									type={showPassword ? 'text' : 'password'}
									id="password_confirmation"
									className="modern-form-input"
									value={passwordConfirmation}
									onChange={(e) => setPasswordConfirmation(e.target.value)}
									required
									minLength={8}
									placeholder="••••••••"
									autoComplete="new-password"
								/>
							</div>
						</div>

						<button type="submit" className="modern-auth-submit" disabled={loading}>
							{loading ? (
								<>
									<CircleNotch className="modern-auth-spinner" size={20} weight="bold" aria-hidden />
									<span>Se activează contul...</span>
								</>
							) : (
								<>
									<span>Activează contul</span>
									<ArrowRight size={20} weight="bold" aria-hidden />
								</>
							)}
						</button>
					</form>

					<div className="modern-auth-footer">
						<p className="modern-auth-footer-text">
							Ai deja cont activ?{' '}
							<Link to="/login" className="modern-auth-link">Autentifică-te</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default InviteRegisterPage;
