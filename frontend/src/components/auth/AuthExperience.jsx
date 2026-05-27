import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LiquidEther from '../backgrounds/LiquidEther';
import { useAuth } from '../../contexts/AuthContext';
import { isStaffAdminRole } from '../../constants/staffRoles';
import AuthBrand from './AuthBrand';
import LoginFormCard from './LoginFormCard';
import RegisterFormCard from './RegisterFormCard';
import './AuthExperience.css';

const SPLASH_LIQUID_COLORS = ['#030712', '#0891b2', '#22d3ee'];
const FORM_REVEAL_MS = 520;

const authExperienceElement = <AuthExperience />;

export { authExperienceElement };

export default function AuthExperience() {
	const { user, loading } = useAuth();
	const navigate = useNavigate();
	const { pathname } = useLocation();

	const isHome = pathname === '/';
	const isRegister = pathname === '/register';
	const skipSplash = !isHome;

	const [prefetchDone, setPrefetchDone] = useState(false);
	const [booted, setBooted] = useState(false);
	const [progress, setProgress] = useState(skipSplash ? 100 : 0);
	const [brandElevated, setBrandElevated] = useState(skipSplash);
	const [showForm, setShowForm] = useState(skipSplash);

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
			if (user.actualRole === 'admin') {
				const mode =
					typeof sessionStorage !== 'undefined'
						? sessionStorage.getItem('formelyAdminViewMode')
						: null;
				navigate(mode === 'student' ? '/courses' : '/admin', { replace: true });
			} else if (isStaffAdminRole(user.actualRole)) {
				navigate('/admin', { replace: true });
			} else {
				navigate('/courses', { replace: true });
			}
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

	useEffect(() => {
		if (pathname === '/login' || pathname === '/register') {
			setBrandElevated(true);
			setShowForm(true);
		}
	}, [pathname]);

	const canStart = booted && !loading && prefetchDone && progress >= 100;

	const handleStart = useCallback(() => {
		setBrandElevated(true);
		window.setTimeout(() => {
			setShowForm(true);
			if (pathname === '/') {
				navigate('/login', { replace: true });
			}
		}, FORM_REVEAL_MS);
	}, [navigate, pathname]);

	if (user) {
		return null;
	}

	const formVisible =
		showForm && (pathname === '/login' || pathname === '/register' || (isHome && brandElevated));

	return (
		<div
			className={`auth-x modern-auth-container ${booted ? 'is-booted' : ''} ${brandElevated ? 'brand-elevated' : ''} ${formVisible ? 'form-visible' : ''} ${canStart ? 'is-ready' : ''}`}
			data-auth-ui="fixed"
		>
			<div className="auth-x-smoke" aria-hidden="true">
				<LiquidEther
					className="auth-x-smoke-canvas"
					resolution={0.46}
					autoDemo
					autoSpeed={0.4}
					autoIntensity={1.75}
					colors={SPLASH_LIQUID_COLORS}
				/>
				<div className="auth-x-smoke-depth" />
			</div>
			<div className="auth-x-grain" aria-hidden="true" />

			<AuthBrand elevated={brandElevated} animateIn={!skipSplash} />

			<div className="auth-x-body">
				{isHome && !showForm && (
					<div className="auth-x-splash-actions">
						{canStart ? (
							<button type="button" className="auth-x-start" onClick={handleStart}>
								Începe
							</button>
						) : (
							<div className="auth-x-wait" aria-live="polite" aria-busy="true">
								<span className="auth-x-wait-bar" style={{ width: `${progress}%` }} />
							</div>
						)}
					</div>
				)}

				{formVisible && (
					<div className="auth-x-form-slot">
						{!isRegister ? <LoginFormCard /> : <RegisterFormCard />}
					</div>
				)}
			</div>

			<p className="auth-x-credit">Powered by Mejievski</p>
		</div>
	);
}
