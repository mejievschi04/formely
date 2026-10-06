import '../styles/auth-modern.css';
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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

import { useAuth } from '../contexts/AuthContextShared.js';
import logoShort from '../assets/Formely logo.png';

const RegisterPage = () => {
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
			// Dacă e pending approval, nu facem redirect la home - mergem la login cu mesaj
			if (result?.pending_approval) {
				navigate('/login', { state: { message: result?.message || 'Cererea ta a fost trimisă. Un administrator va verifica contul în curând.' } });
			} else {
				navigate('/courses');
			}
		} catch (err) {
			setError(err.response?.data?.message || err.response?.data?.errors?.email?.[0] || 'Eroare la înregistrare');
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
						<h1 className="modern-auth-title">Creează-ți contul</h1>
						<p className="modern-auth-subtitle">
							Începe-ți călătoria de învățare astăzi
						</p>
					</div>

					{/* Form */}
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
									minLength={6}
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
							<small className="modern-form-hint">Minim 6 caractere</small>
						</div>

						<button
							type="submit"
							className="modern-auth-submit"
							disabled={loading}
						>
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

					{/* Footer */}
					<div className="modern-auth-footer">
						<p className="modern-auth-footer-text">
							Ai deja cont?{' '}
							<Link to="/login" className="modern-auth-link">
								Autentifică-te
							</Link>
						</p>
						<p className="modern-auth-footer-text modern-form-hint" style={{ marginTop: '0.75rem' }}>
							Ai primit invitație pe email? Deschide linkul din mesaj pentru a-ți activa contul.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default RegisterPage;

