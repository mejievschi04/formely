import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LiquidEther from '../backgrounds/LiquidEther';
import { useAuth } from '../../contexts/AuthContext';
import { getPostLoginPath } from '../../utils/authRedirect';
import AuthBrand from './AuthBrand';
import { useCompanyBranding } from '../../contexts/CompanyBrandingContext';
import { brandingLiquidColors } from '../../utils/companyBranding';
import ForgotPasswordFormCard from './ForgotPasswordFormCard';
import LoginFormCard from './LoginFormCard';
import RegisterFormCard from './RegisterFormCard';
import ResetPasswordFormCard from './ResetPasswordFormCard';
import AcceptInviteFormCard from './AcceptInviteFormCard';
import './AuthExperience.css';

const SPLASH_HOLD_MS = 1100;
const ZOOM_MS = 720;
const LOGO_MOVE_MS = 820;

const authExperienceElement = <AuthExperience />;

export { authExperienceElement };

function prefersReducedMotion() {
	return typeof window !== 'undefined'
		&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function AuthExperience() {
	const { user, loading } = useAuth();
	const { branding } = useCompanyBranding();
	const liquidColors = brandingLiquidColors(branding);
	const navigate = useNavigate();
	const { pathname } = useLocation();

	const isHome = pathname === '/';
	const isRegister = pathname === '/register';
	const isForgotPassword = pathname === '/forgot-password';
	const isResetPassword = pathname === '/reset-password';
	const isAcceptInvite = pathname === '/accept-invite';
	const skipSplash = !isHome;

	const [prefetchDone, setPrefetchDone] = useState(false);
	const [booted, setBooted] = useState(false);
	const [progress, setProgress] = useState(skipSplash ? 100 : 0);
	const [zooming, setZooming] = useState(false);
	const [brandElevated, setBrandElevated] = useState(skipSplash);
	const [showForm, setShowForm] = useState(skipSplash);
	const [cinematic] = useState(isHome);
	const sequenceStarted = useRef(false);
	const splashStartedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);

	useEffect(() => {
		const id = requestAnimationFrame(() => setBooted(true));
		return () => cancelAnimationFrame(id);
	}, []);

	useEffect(() => {
		Promise.all([
			import('../../pages/DashboardPage'),
			import('../../pages/CoursesPage'),
		])
			.then(() => setPrefetchDone(true))
			.catch(() => setPrefetchDone(true));
	}, []);

	useEffect(() => {
		if (!loading && user) {
			navigate(getPostLoginPath(user), { replace: true });
		}
	}, [user, loading, navigate]);

	useEffect(() => {
		if (skipSplash) {
			setBrandElevated(true);
			setShowForm(true);
			setProgress(100);
			return undefined;
		}
		if (!loading && prefetchDone) {
			setProgress(100);
			return undefined;
		}
		const id = setInterval(() => {
			setProgress((p) => (p >= 94 ? p : Math.min(94, p + (p < 60 ? 2.5 : 0.8))));
		}, 45);
		return () => clearInterval(id);
	}, [loading, prefetchDone, skipSplash]);

	const assetsReady = booted && !loading && prefetchDone && progress >= 100;

	useEffect(() => {
		if (!isHome || sequenceStarted.current || !assetsReady) return undefined;
		sequenceStarted.current = true;

		if (prefersReducedMotion()) {
			setZooming(true);
			setBrandElevated(true);
			setShowForm(true);
			navigate('/login', { replace: true });
			return undefined;
		}

		const elapsed = Math.max(0, (typeof performance !== 'undefined' ? performance.now() : 0) - splashStartedAt.current);
		const hold = Math.max(0, SPLASH_HOLD_MS - elapsed);
		const timers = [];

		timers.push(window.setTimeout(() => setZooming(true), hold));
		timers.push(window.setTimeout(() => setBrandElevated(true), hold + ZOOM_MS));
		timers.push(window.setTimeout(() => {
			setShowForm(true);
			navigate('/login', { replace: true });
		}, hold + ZOOM_MS + LOGO_MOVE_MS));

		return () => timers.forEach((id) => window.clearTimeout(id));
	}, [assetsReady, isHome, navigate]);

	useEffect(() => {
		if (
			pathname === '/register' ||
			pathname === '/forgot-password' ||
			pathname === '/reset-password' ||
			pathname === '/accept-invite'
		) {
			setBrandElevated(true);
			setShowForm(true);
			setZooming(true);
		}
	}, [pathname]);

	if (user) {
		return null;
	}

	const formVisible =
		showForm &&
		(pathname === '/login' ||
			pathname === '/register' ||
			pathname === '/forgot-password' ||
			pathname === '/reset-password' ||
			pathname === '/accept-invite' ||
			(isHome && brandElevated));

	const authForm = isAcceptInvite ? (
		<AcceptInviteFormCard />
	) : isResetPassword ? (
		<ResetPasswordFormCard />
	) : isForgotPassword ? (
		<ForgotPasswordFormCard />
	) : !isRegister ? (
		<LoginFormCard />
	) : (
		<RegisterFormCard />
	);

	return (
		<div
			className={[
				'auth-x',
				'modern-auth-container',
				booted ? 'is-booted' : '',
				zooming ? 'is-zooming' : '',
				brandElevated ? 'brand-elevated' : '',
				formVisible ? 'form-visible' : '',
				cinematic ? 'is-cinematic' : '',
				assetsReady ? 'is-ready' : '',
			].filter(Boolean).join(' ')}
			data-auth-ui="fixed"
		>
			<div className="auth-x-smoke" aria-hidden="true">
				<LiquidEther
					className="auth-x-smoke-canvas"
					resolution={0.46}
					autoDemo
					autoSpeed={0.4}
					autoIntensity={1.75}
					colors={liquidColors}
				/>
				<div className="auth-x-smoke-depth" />
			</div>
			<div className="auth-x-grain" aria-hidden="true" />

			<AuthBrand elevated={brandElevated} animateIn={!skipSplash} />

			<div className="auth-x-body">
				{formVisible && <div className="auth-x-form-slot">{authForm}</div>}
			</div>

			<p className="auth-x-credit">Powered by Mejievski</p>
		</div>
	);
}
