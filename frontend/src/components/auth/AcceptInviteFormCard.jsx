import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
	ArrowLeft,
	ArrowRight,
	CircleNotch,
	EnvelopeSimple,
	Eye,
	EyeSlash,
	Lock,
	User,
	WarningCircle,
} from '@phosphor-icons/react';
import { authService } from '../../services/api';
import AuthFormCard from './AuthFormCard';

export default function AcceptInviteFormCard() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const token = searchParams.get('token') ?? '';

	const [validating, setValidating] = useState(true);
	const [invite, setInvite] = useState(null);
	const [validationError, setValidationError] = useState('');

	const [name, setName] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirmation, setPasswordConfirmation] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const linkInvalid = useMemo(() => !token, [token]);

	useEffect(() => {
		if (!token) {
			setValidating(false);
			return;
		}

		let cancelled = false;

		(async () => {
			setValidating(true);
			try {
				const data = await authService.validateInvitation(token);
				if (cancelled) return;
				if (!data?.valid) {
					setValidationError(data?.message || 'Invitația este invalidă sau a expirat.');
					return;
				}
				setInvite(data);
				if (data.name) setName(data.name);
			} catch (err) {
				if (!cancelled) {
					setValidationError(
						err.response?.data?.message || 'Invitația este invalidă sau a expirat.'
					);
				}
			} finally {
				if (!cancelled) setValidating(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [token]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			const data = await authService.acceptInvitation({
				token,
				name,
				password,
				password_confirmation: passwordConfirmation,
			});
			navigate('/login', {
				replace: true,
				state: {
					message: data?.message || 'Cont creat cu succes. Te poți autentifica acum.',
				},
			});
		} catch (err) {
			const data = err.response?.data;
			const msg =
				data?.errors?.token?.[0] ||
				data?.errors?.password?.[0] ||
				data?.errors?.name?.[0] ||
				data?.message ||
				'Nu am putut crea contul.';
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
						<Link to="/login" className="modern-auth-link">
							Autentificare
						</Link>
					</p>
				}
			>
				<div className="modern-auth-error">
					<WarningCircle size={20} weight="duotone" aria-hidden />
					<span>Lipsește tokenul de invitație.</span>
				</div>
			</AuthFormCard>
		);
	}

	if (validating) {
		return (
			<AuthFormCard title="Verific invitația...">
				<div className="modern-auth-form" style={{ textAlign: 'center', padding: '1rem' }}>
					<CircleNotch className="modern-auth-spinner" size={32} weight="bold" aria-hidden />
				</div>
			</AuthFormCard>
		);
	}

	if (validationError || !invite) {
		return (
			<AuthFormCard
				title="Invitație invalidă"
				subtitle={validationError}
				footer={
					<p className="modern-auth-footer-text">
						<Link to="/login" className="modern-auth-link modern-auth-link--with-icon">
							<ArrowLeft size={16} weight="bold" aria-hidden />
							Autentificare
						</Link>
					</p>
				}
			>
				<div className="modern-auth-error">
					<WarningCircle size={20} weight="duotone" aria-hidden />
					<span>Contactează administratorul pentru o invitație nouă.</span>
				</div>
			</AuthFormCard>
		);
	}

	return (
		<AuthFormCard
			title="Acceptă invitația"
			footer={
				<p className="modern-auth-footer-text">
					<Link to="/login" className="modern-auth-link modern-auth-link--with-icon">
						<ArrowLeft size={16} weight="bold" aria-hidden />
						Am deja cont
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
					<label htmlFor="invite-email" className="modern-form-label">
						Email
					</label>
					<div className="modern-form-input-wrapper">
						<EnvelopeSimple className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type="email"
							id="invite-email"
							className="modern-form-input"
							value={invite.email}
							readOnly
							autoComplete="email"
						/>
					</div>
				</div>

				<div className="modern-form-group">
					<label htmlFor="invite-name" className="modern-form-label">
						Nume complet
					</label>
					<div className="modern-form-input-wrapper">
						<User className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type="text"
							id="invite-name"
							className="modern-form-input"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							placeholder="Numele tău"
							autoComplete="name"
						/>
					</div>
				</div>

				<div className="modern-form-group">
					<label htmlFor="invite-password" className="modern-form-label">
						Parolă
					</label>
					<div className="modern-form-input-wrapper">
						<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type={showPassword ? 'text' : 'password'}
							id="invite-password"
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
					<label htmlFor="invite-password-confirm" className="modern-form-label">
						Confirmă parola
					</label>
					<div className="modern-form-input-wrapper">
						<Lock className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type={showPassword ? 'text' : 'password'}
							id="invite-password-confirm"
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
							<span>Se creează contul...</span>
						</>
					) : (
						<>
							<span>Creează cont</span>
							<ArrowRight size={20} weight="bold" aria-hidden />
						</>
					)}
				</button>
			</form>
		</AuthFormCard>
	);
}
