import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
	ArrowLeft,
	ArrowRight,
	CircleNotch,
	EnvelopeSimple,
	Eye,
	EyeSlash,
	Lock,
	WarningCircle,
} from '@phosphor-icons/react';
import { authService } from '../../services/api';
import AuthFormCard from './AuthFormCard';

export default function ResetPasswordFormCard() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const token = searchParams.get('token') ?? '';
	const emailFromQuery = searchParams.get('email') ?? '';

	const [email, setEmail] = useState(emailFromQuery);
	const [password, setPassword] = useState('');
	const [passwordConfirmation, setPasswordConfirmation] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const linkInvalid = useMemo(() => !token || !emailFromQuery, [token, emailFromQuery]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			const data = await authService.resetPassword({
				token,
				email,
				password,
				password_confirmation: passwordConfirmation,
			});
			navigate('/login', {
				replace: true,
				state: {
					message: data?.message || 'Parola a fost resetată. Te poți autentifica acum.',
				},
			});
		} catch (err) {
			const data = err.response?.data;
			const msg =
				data?.errors?.email?.[0] ||
				data?.errors?.password?.[0] ||
				data?.message ||
				'Nu am putut reseta parola. Încearcă din nou.';
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	if (linkInvalid) {
		return (
			<AuthFormCard
				title="Link invalid"
				footer={
					<p className="modern-auth-footer-text">
						<Link to="/forgot-password" className="modern-auth-link">
							Solicită link nou
						</Link>
						{' · '}
						<Link to="/login" className="modern-auth-link">
							Autentificare
						</Link>
					</p>
				}
			>
				<div className="modern-auth-error">
					<WarningCircle size={20} weight="duotone" aria-hidden />
					<span>Deschide linkul direct din emailul primit.</span>
				</div>
			</AuthFormCard>
		);
	}

	return (
		<AuthFormCard
			title="Parolă nouă"
			footer={
				<p className="modern-auth-footer-text">
					<Link to="/login" className="modern-auth-link modern-auth-link--with-icon">
						<ArrowLeft size={16} weight="bold" aria-hidden />
						Înapoi la autentificare
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
					<label htmlFor="reset-email" className="modern-form-label">
						Email
					</label>
					<div className="modern-form-input-wrapper">
						<EnvelopeSimple className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type="email"
							id="reset-email"
							className="modern-form-input"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							readOnly
							autoComplete="email"
						/>
					</div>
				</div>

				<div className="modern-form-group">
					<label htmlFor="reset-password" className="modern-form-label">
						Parolă nouă
					</label>
					<div className="modern-form-input-wrapper">
						<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type={showPassword ? 'text' : 'password'}
							id="reset-password"
							className="modern-form-input"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={8}
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
				</div>

				<div className="modern-form-group">
					<label htmlFor="reset-password-confirm" className="modern-form-label">
						Confirmă parola
					</label>
					<div className="modern-form-input-wrapper">
						<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type={showPassword ? 'text' : 'password'}
							id="reset-password-confirm"
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
							<span>Se salvează...</span>
						</>
					) : (
						<>
							<span>Resetează parola</span>
							<ArrowRight size={20} weight="bold" aria-hidden />
						</>
					)}
				</button>
			</form>
		</AuthFormCard>
	);
}
