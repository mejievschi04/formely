import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
	ArrowLeft,
	ArrowRight,
	CheckCircle,
	CircleNotch,
	EnvelopeSimple,
	WarningCircle,
} from '@phosphor-icons/react';
import { authService } from '../../services/api';
import AuthFormCard from './AuthFormCard';

export default function ForgotPasswordFormCard() {
	const [email, setEmail] = useState('');
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setSuccess('');
		setLoading(true);

		try {
			const data = await authService.forgotPassword(email);
			setSuccess(
				data?.message ||
					'Dacă există un cont cu acest email, vei primi un link de resetare în câteva minute.'
			);
		} catch (err) {
			const data = err.response?.data;
			const msg =
				data?.errors?.email?.[0] || data?.message || 'Nu am putut trimite emailul. Încearcă din nou.';
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthFormCard
			title="Ai uitat parola?"
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
				{success && (
					<div className="modern-auth-success">
						<CheckCircle size={20} weight="duotone" aria-hidden />
						<span>{success}</span>
					</div>
				)}
				{error && (
					<div className="modern-auth-error">
						<WarningCircle size={20} weight="duotone" aria-hidden />
						<span>{error}</span>
					</div>
				)}

				<div className="modern-form-group">
					<label htmlFor="forgot-email" className="modern-form-label">
						Email
					</label>
					<div className="modern-form-input-wrapper">
						<EnvelopeSimple className="modern-form-icon" size={20} weight="duotone" aria-hidden />
						<input
							type="email"
							id="forgot-email"
							className="modern-form-input"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							placeholder="Adresa de email"
							autoComplete="email"
							disabled={Boolean(success)}
						/>
					</div>
				</div>

				<button type="submit" className="modern-auth-submit" disabled={loading || Boolean(success)}>
					{loading ? (
						<>
							<CircleNotch className="modern-auth-spinner" size={20} weight="bold" aria-hidden />
							<span>Se trimite...</span>
						</>
					) : (
						<>
							<span>Trimite link</span>
							<ArrowRight size={20} weight="bold" aria-hidden />
						</>
					)}
				</button>
			</form>
		</AuthFormCard>
	);
}
