import '../styles/auth-modern.css';
import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
	ArrowRight,
	CheckCircle,
	CircleNotch,
	EnvelopeSimple,
	Eye,
	EyeSlash,
	Lock,
	WarningCircle,
} from '@phosphor-icons/react';

import { useAuth } from '../contexts/AuthContextShared.js';
import { isStaffAdminRole } from '../constants/staffRoles';
import { prefetchRoute } from '../utils/prefetch';
import logoShort from '../assets/Formely logo.png';
import api from '../api';

const LoginPage = () => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState(() => {
		// Formely: mesaj lăsat de interceptor când academia nu mai e activă.
		try {
			const notice = sessionStorage.getItem('formely_login_notice');
			if (notice) sessionStorage.removeItem('formely_login_notice');
			return notice || '';
		} catch {
			return '';
		}
	});
	const [loading, setLoading] = useState(false);
	// Formely e sales-led: linkul de înregistrare apare doar dacă register-ul public e pornit.
	const [publicRegisterEnabled, setPublicRegisterEnabled] = useState(false);

	useEffect(() => {
		let cancelled = false;
		api.get('/plans')
			.then((res) => { if (!cancelled) setPublicRegisterEnabled(Boolean(res.data?.public_register_enabled)); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, []);
	const { login } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const successMessage = location.state?.message;

	// Prefetch likely post-login routes for instant navigation
	useEffect(() => {
		prefetchRoute('/courses');
	}, []);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			const data = await login(email, password);
			// Admin: respectă ultima „Vizionare”; analist / instructor → panou admin; restul → cursuri
			const r = data?.user?.role;
			if (r === 'admin') {
				const mode =
					typeof sessionStorage !== 'undefined'
						? sessionStorage.getItem('voltaAdminViewMode')
						: null;
				navigate(mode === 'student' ? '/courses' : '/admin');
			} else if (isStaffAdminRole(r)) {
				navigate('/admin');
			} else {
				navigate('/courses');
			}
		} catch (err) {
			const data = err.response?.data;
			const msg = data?.errors?.email?.[0] || data?.message || err.response?.data?.message || 'Eroare la autentificare';
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="modern-auth-container">
			{/* Background decorative elements */}
			<div className="modern-auth-background">
				<div className="modern-auth-gradient"></div>
				<div className="modern-auth-pattern"></div>
			</div>

			{/* Main content */}
			<div className="modern-auth-content">
				<div className="modern-auth-card">
					{/* Logo and Header */}
					<div className="modern-auth-header">
						<div className="modern-auth-logo">
							<img src={logoShort} alt="Formely" className="modern-auth-logo-img" />
						</div>
						<h1 className="modern-auth-title">Bine ai revenit</h1>
						<p className="modern-auth-subtitle">
							Autentifică-te pentru a continua călătoria ta de învățare
						</p>
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className="modern-auth-form">
						{successMessage && (
							<div className="modern-auth-success">
								<CheckCircle size={20} weight="duotone" aria-hidden />
								<span>{successMessage}</span>
							</div>
						)}
						{error && (
							<div className="modern-auth-error">
								<WarningCircle size={20} weight="duotone" aria-hidden />
								<span>{error}</span>
							</div>
						)}

						<div className="modern-form-group">
							<label htmlFor="email" className="modern-form-label">
								Email
							</label>
							<div className="modern-form-input-wrapper">
								<EnvelopeSimple className="modern-form-icon" size={20} weight="duotone" aria-hidden />
								<input
									type="email"
									id="email"
									className="modern-form-input"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									placeholder="Adresa de email"
									autoComplete="email"
								/>
							</div>
						</div>

						<div className="modern-form-group">
							<label htmlFor="password" className="modern-form-label">
								Parolă
							</label>
							<div className="modern-form-input-wrapper">
								<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
								<input
									type={showPassword ? 'text' : 'password'}
									id="password"
									className="modern-form-input"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									placeholder="••••••••"
									autoComplete="current-password"
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
						</div>

					<button
						type="submit"
						className="modern-auth-submit"
						disabled={loading}
					>
							{loading ? (
								<>
									<CircleNotch className="modern-auth-spinner" size={20} weight="bold" aria-hidden />
									<span>Se autentifică...</span>
								</>
							) : (
								<>
									<span>Autentificare</span>
									<ArrowRight size={20} weight="bold" aria-hidden />
								</>
							)}
						</button>
					</form>

					{/* Footer */}
					{publicRegisterEnabled && (
					<div className="modern-auth-footer">
						<p className="modern-auth-footer-text">
							Nu ai cont?{' '}
							<Link to="/register" className="modern-auth-link">
								Înregistrează-te
							</Link>
						</p>
					</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default LoginPage;

