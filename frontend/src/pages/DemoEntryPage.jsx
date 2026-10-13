import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContextShared.js';
import { isStaffAdminRole } from '../constants/staffRoles';
import { isDemoSession } from '../utils/demoMode';
import { ensureApiCsrfCookie, refreshApiCsrfCookie } from '../api';
import logoShort from '../assets/Formely logo.png';
import '../styles/demo-tour.css';

function homeForRole(role) {
	if (role === 'admin' || isStaffAdminRole(role)) return '/admin';
	return '/courses';
}

/** Un singur demo-login în zbor (StrictMode montează de 2 ori). */
let demoEntryInflight = null;

/**
 * Marketing entry: /demo → session pe academia demo (fără formular).
 * StrictMode-safe: un singur login în zbor; dacă ești deja pe alt tenant, ieși și reintri în demo.
 */
export default function DemoEntryPage() {
	const { user, loading, demoLogin, logout } = useAuth();
	const navigate = useNavigate();
	const [error, setError] = useState('');
	const [phase, setPhase] = useState('loading');
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		if (loading) return undefined;

		if (user && isDemoSession(user)) {
			navigate(homeForRole(user.actualRole ?? user.role), { replace: true });
			return undefined;
		}

		if (!demoEntryInflight) {
			demoEntryInflight = (async () => {
				if (user && !isDemoSession(user)) {
					if (mounted.current) setPhase('switching');
					try {
						await logout();
					} catch {
						/* continuăm */
					}
				}

				await ensureApiCsrfCookie();
				try {
					return await demoLogin();
				} catch (err) {
					if (err?.response?.status === 419) {
						await refreshApiCsrfCookie();
						return await demoLogin();
					}
					throw err;
				}
			})().finally(() => {
				demoEntryInflight = null;
			});
		}

		let cancelled = false;
		demoEntryInflight
			.then((data) => {
				if (cancelled || !mounted.current) return;
				navigate(homeForRole(data?.user?.role), { replace: true });
			})
			.catch((err) => {
				if (cancelled || !mounted.current) return;
				const msg =
					err.response?.data?.message ||
					err.response?.data?.errors?.email?.[0] ||
					'Demo-ul nu este disponibil momentan.';
				setError(msg);
				setPhase('error');
			});

		return () => {
			cancelled = true;
		};
	}, [loading, user, demoLogin, logout, navigate]);

	return (
		<div className="demo-entry">
			<div className="demo-entry-card">
				<img src={logoShort} alt="Formely" width={72} height={72} />
				{phase === 'error' ? (
					<>
						<p className="demo-entry-error">{error}</p>
						<div className="demo-entry-actions">
							<button
								type="button"
								className="demo-entry-btn"
								onClick={() => {
									setError('');
									setPhase('loading');
									window.location.assign('/demo');
								}}
							>
								Încearcă din nou
							</button>
							<a href="/login">Autentificare</a>
						</div>
					</>
				) : (
					<>
						<p className="demo-entry-text">
							{phase === 'switching' ? 'Pregătim academia demo…' : 'Se deschide academia demo…'}
						</p>
						<p className="demo-entry-hint">Mod explorare — modificările nu se salvează.</p>
					</>
				)}
			</div>
		</div>
	);
}
