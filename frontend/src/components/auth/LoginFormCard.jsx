import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
import { useAuth } from '../../contexts/AuthContext';
import { isStaffAdminRole } from '../../constants/staffRoles';
import { prefetchRoute } from '../../utils/prefetch';
import AuthFormCard from './AuthFormCard';

export default function LoginFormCard() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const { login } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const successMessage = location.state?.message;

	useEffect(() => {
		prefetchRoute('/courses');
		prefetchRoute('/admin');
	}, []);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			const user = await login(email, password);
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
		} catch (err) {
			const data = err.response?.data;
			const msg =
				data?.errors?.email?.[0] ||
				data?.message ||
				err.response?.data?.message ||
				'Eroare la autentificare';
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthFormCard
			title="Bine ai revenit"
			subtitle="Autentifică-te pentru a continua"
			footer={
				<p className="modern-auth-footer-text">
					Nu ai cont?{' '}
					<Link to="/register" className="modern-auth-link">
						Înregistrează-te
					</Link>
				</p>
			}
		>
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

				<button type="submit" className="modern-auth-submit" disabled={loading}>
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
		</AuthFormCard>
	);
}
