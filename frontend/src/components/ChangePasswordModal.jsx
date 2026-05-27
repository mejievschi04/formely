import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const ChangePasswordModal = () => {
	useEffect(() => {
		console.log('ChangePasswordModal mounted');
		return () => {
			console.log('ChangePasswordModal unmounted');
		};
	}, []);
	const { changePassword } = useAuth();
	const [formData, setFormData] = useState({
		currentPassword: '',
		newPassword: '',
		newPasswordConfirmation: '',
	});
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');

		if (formData.newPassword !== formData.newPasswordConfirmation) {
			setError('Parolele nu se potrivesc');
			return;
		}

		if (formData.newPassword.length < 8) {
			setError('Parola trebuie să aibă cel puțin 8 caractere');
			return;
		}

		// Validate password complexity
		const hasLowerCase = /[a-z]/.test(formData.newPassword);
		const hasUpperCase = /[A-Z]/.test(formData.newPassword);
		const hasNumber = /[0-9]/.test(formData.newPassword);

		if (!hasLowerCase || !hasUpperCase || !hasNumber) {
			setError('Parola trebuie să conțină cel puțin o literă mare, o literă mică și o cifră');
			return;
		}

		try {
			setLoading(true);
			await changePassword(formData.currentPassword, formData.newPassword, formData.newPasswordConfirmation);
			// Modal will close automatically when user.must_change_password becomes false
		} catch (err) {
			setError(err.response?.data?.message || 'Eroare la schimbarea parolei');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div 
			className="modal-backdrop" 
			style={{ 
				zIndex: 10000, 
				pointerEvents: 'all',
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'var(--bg-overlay)',
				backdropFilter: 'blur(8px)',
			}}
			onClick={(e) => {
				// Prevent closing modal by clicking backdrop - password change is mandatory
				e.stopPropagation();
			}}
		>
			<div 
				className="modal" 
				style={{ maxWidth: '500px' }} 
				onClick={(e) => e.stopPropagation()}
			>
				<div className="modal-header">
					<h2 className="modal-title">Schimbă parola</h2>
				</div>
				<div className="modal-body">
					<p style={{ marginBottom: 'var(--space-6)', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-base)' }}>
						Pentru securitate, trebuie să îți setezi o parolă nouă înainte de a continua.
					</p>

					{error && (
						<div style={{ 
							padding: 'var(--space-3)', 
							background: 'rgba(239, 68, 68, 0.2)', 
							color: 'var(--color-error)', 
							borderRadius: 'var(--radius-lg)', 
							marginBottom: 'var(--space-4)',
							border: '1px solid rgba(239, 68, 68, 0.3)',
							fontSize: 'var(--font-size-sm)',
						}}>
							{error}
						</div>
					)}

					<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
						<div className="form-group">
							<label htmlFor="currentPassword" className="form-label">Parola curentă</label>
							<input
								type="password"
								id="currentPassword"
								className="form-input"
								value={formData.currentPassword}
								onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
								required
								placeholder="formely2025"
								autoFocus
							/>
							<p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
								Parola implicită este: <strong>formely2025</strong>
							</p>
						</div>

						<div className="form-group">
							<label htmlFor="newPassword" className="form-label">Parola nouă</label>
							<input
								type="password"
								id="newPassword"
								className="form-input"
								value={formData.newPassword}
								onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
								required
								minLength={8}
								placeholder="Minim 8 caractere"
							/>
						</div>

						<div className="form-group">
							<label htmlFor="newPasswordConfirmation" className="form-label">Confirmă parola nouă</label>
							<input
								type="password"
								id="newPasswordConfirmation"
								className="form-input"
								value={formData.newPasswordConfirmation}
								onChange={(e) => setFormData({ ...formData, newPasswordConfirmation: e.target.value })}
								required
								minLength={8}
								placeholder="Repetă parola"
							/>
						</div>

						<div className="modal-footer">
							<button 
								type="submit" 
								className="btn btn-primary"
								disabled={loading}
							>
								{loading ? 'Se salvează...' : 'Schimbă parola'}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default ChangePasswordModal;

