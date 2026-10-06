import '../styles/auth-modern.css';
import '../styles/auth-experience.css';
import React, { useState, useEffect, useRef } from 'react';
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
import LiquidEther from '../components/backgrounds/LiquidEther';
import api from '../api';

// Splash → logo sus → login: aceleași durate ca în Formely inițial
const SPLASH_HOLD_MS = 1100;
const ZOOM_MS = 720;
const LOGO_MOVE_MS = 820;
const SMOKE_COLORS = ['#6c2df0', '#1970f0', '#19d2eb'];

const prefersReducedMotion = () =>
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Pe „/” pagina pornește ca splash (logo în centru peste fum); când aplicația e gata (`splashReady`),
 * logo-ul face zoom, urcă sus și formularul apare dedesubt, apoi adresa devine /login.
 * „/” și „/login” folosesc același element de rută, deci componenta nu se remontează la navigare.
 */
const LoginPage = ({ splashReady = true }) => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState(() => {
		// Mesaj lăsat la sesiune expirată / academie inactivă; se șterge în efect (StrictMode rulează inițializatorul de două ori).
		try {
			return sessionStorage.getItem('formely_login_notice') || '';
		} catch {
			return '';
		}
	});
	useEffect(() => {
		try {
			sessionStorage.removeItem('formely_login_notice');
		} catch {
			/* ignore */
		}
	}, []);
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

	const isSplash = location.pathname === '/';
	const [cinematic] = useState(isSplash);
	const [booted, setBooted] = useState(false);
	const [zooming, setZooming] = useState(!isSplash);
	const [brandElevated, setBrandElevated] = useState(!isSplash);
	const [showForm, setShowForm] = useState(!isSplash);
	const sequenceStarted = useRef(false);
	const splashStartedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);

	useEffect(() => {
		const id = requestAnimationFrame(() => setBooted(true));
		return () => cancelAnimationFrame(id);
	}, []);

	useEffect(() => {
		if (!isSplash || sequenceStarted.current || !booted || !splashReady) return undefined;
		sequenceStarted.current = true;

		const finish = () => {
			setShowForm(true);
			navigate('/login', { replace: true });
		};
		if (prefersReducedMotion()) {
			setZooming(true);
			setBrandElevated(true);
			finish();
			return undefined;
		}

		const elapsed = Math.max(0, performance.now() - splashStartedAt.current);
		const hold = Math.max(0, SPLASH_HOLD_MS - elapsed);
		const timers = [
			window.setTimeout(() => setZooming(true), hold),
			window.setTimeout(() => setBrandElevated(true), hold + ZOOM_MS),
			window.setTimeout(finish, hold + ZOOM_MS + LOGO_MOVE_MS),
		];
		return () => timers.forEach((id) => window.clearTimeout(id));
	}, [isSplash, booted, splashReady, navigate]);

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
		<div
			className={[
				'auth-x',
				zooming ? 'is-zooming' : '',
				brandElevated ? 'brand-elevated' : '',
				showForm ? 'form-visible' : '',
				cinematic ? 'is-cinematic' : '',
			].filter(Boolean).join(' ')}
		>
			<div className="auth-x-smoke" aria-hidden="true">
				<LiquidEther
					className="auth-x-smoke-canvas"
					resolution={0.46}
					autoDemo
					autoSpeed={0.4}
					autoIntensity={1.75}
					colors={SMOKE_COLORS}
				/>
				<div className="auth-x-smoke-depth" />
			</div>
			<div className="auth-x-grain" aria-hidden="true" />

			<div
				className={`auth-brand ${brandElevated ? 'auth-brand--elevated' : ''} ${cinematic ? 'auth-brand--animate-in' : ''}`}
				style={{ '--auth-logo-mask': `url("${logoShort}")` }}
			>
				<img src={logoShort} alt="Formely" className="auth-brand-logo-img" />
				<span className="auth-brand-shine" aria-hidden="true" />
			</div>

			<div className="auth-x-body">
			{showForm && (
			<div className="auth-x-form-slot">
				<div className="modern-auth-card">
					{/* Header */}
					<div className="modern-auth-header auth-rise" style={{ '--auth-rise-delay': '0.04s' }}>
						<h1 className="modern-auth-title">Bine ai revenit</h1>
						<p className="modern-auth-subtitle">
							Autentifică-te pentru a continua călătoria ta de învățare
						</p>
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className="modern-auth-form auth-rise" style={{ '--auth-rise-delay': '0.12s' }}>
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
			)}
			</div>

			<p className="auth-x-credit">Powered by Mejievski</p>
		</div>
	);
};

export default LoginPage;

