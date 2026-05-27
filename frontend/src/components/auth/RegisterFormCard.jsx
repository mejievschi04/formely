import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { useAuth } from '../../contexts/AuthContext';
import AuthFormCard from './AuthFormCard';

export default function RegisterFormCard() {
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const { register } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			const result = await register(name, email, password);
			if (result?.pending_approval) {
				navigate('/login', {
					replace: true,
					state: {
						message:
							result.message ||
							'Cererea ta a fost trimisă. Vei putea te autentifica după aprobare.',
					},
				});
			} else {
				navigate('/courses', { replace: true });
			}
		} catch (err) {
			const data = err.response?.data;
			const msg =
				data?.errors?.email?.[0] ||
				data?.errors?.password?.[0] ||
				data?.message ||
				'Eroare la înregistrare';
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthFormCard
			title="Creează-ți contul"
			subtitle="Completează datele de mai jos"
			footer={
				<p className="modern-auth-footer-text">
					Ai deja cont?{' '}
					<Link to="/login" className="modern-auth-link">
						Autentifică-te
					</Link>
				</p>
			}
		>
			<form onSubmit={handleSubmit} className="modern-auth-form">
				{error && (
					<div className="modern-auth-error">
						<WarningCircle size={20} weight="duotone" aria-hidden />
						<span>{error}</span>
					</div>
				)}

				<div className="modern-form-group">
					<label htmlFor="name" className="modern-form-label">
						Nume complet
					</label>
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
					<label htmlFor="reg-email" className="modern-form-label">
						Email
					</label>
					<div className="modern-form-input-wrapper">
						<EnvelopeSimple className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type="email"
							id="reg-email"
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
					<label htmlFor="reg-password" className="modern-form-label">
						Parolă
					</label>
					<div className="modern-form-input-wrapper">
						<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type={showPassword ? 'text' : 'password'}
							id="reg-password"
							className="modern-form-input"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={6}
							placeholder="••••••••"
							autoComplete="new-password"
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
					<small className="modern-form-hint">Minim 6 caractere</small>
				</div>

				<button type="submit" className="modern-auth-submit" disabled={loading}>
					{loading ? (
						<>
							<CircleNotch className="modern-auth-spinner" size={20} weight="bold" aria-hidden />
							<span>Se creează contul...</span>
						</>
					) : (
						<>
							<span>Înregistrare</span>
							<ArrowRight size={20} weight="bold" aria-hidden />
						</>
					)}
				</button>
			</form>
		</AuthFormCard>
	);
}
