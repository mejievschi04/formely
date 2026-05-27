import React, { useEffect, useState } from 'react';

const Toast = ({ message, type = 'info', onClose, duration = 4000 }) => {
	const [isVisible, setIsVisible] = useState(false);
	const [isExiting, setIsExiting] = useState(false);

	useEffect(() => {
		// Trigger entrance animation
		setTimeout(() => setIsVisible(true), 10);

		// Auto close
		const timer = setTimeout(() => {
			handleClose();
		}, duration);

		return () => clearTimeout(timer);
	}, [duration]);

	const handleClose = () => {
		setIsExiting(true);
		setTimeout(() => {
			onClose();
		}, 300);
	};

	const icons = {
		success: '✓',
		error: '✕',
		warning: '⚠',
		info: 'ℹ',
	};

	return (
		<div
			role="alert"
			aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
			aria-atomic="true"
			className={`toast toast-${type}`}
			onClick={handleClose}
			style={{
				background: 'var(--bg-elevated)',
				border: '1px solid var(--border-primary)',
				borderLeft: `3px solid ${
					type === 'success' ? 'var(--color-success)' :
					type === 'error' ? 'var(--color-error)' :
					type === 'warning' ? 'var(--color-warning)' :
					'var(--color-info)'
				}`,
				borderRadius: 'var(--radius-lg)',
				padding: 'var(--space-4)',
				boxShadow: 'var(--shadow-xl)',
				display: 'flex',
				alignItems: 'flex-start',
				gap: 'var(--space-3)',
				animation: 'slideIn var(--transition-base)',
				minWidth: '300px',
				opacity: isVisible && !isExiting ? 1 : 0,
				transform: isVisible && !isExiting ? 'translateX(0)' : 'translateX(100%)',
				transition: 'all var(--transition-base)',
			}}
		>
			<div style={{ fontSize: 'var(--font-size-lg)', flexShrink: 0 }}>{icons[type]}</div>
			<div className="toast-message" style={{ flex: 1, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{message}</div>
			<button
				type="button"
				className="toast-close"
				aria-label="Închide notificare"
				onClick={(e) => {
					e.stopPropagation();
					handleClose();
				}}
				style={{
					width: '20px',
					height: '20px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					border: 'none',
					background: 'transparent',
					color: 'var(--text-tertiary)',
					cursor: 'pointer',
					borderRadius: 'var(--radius-sm)',
					transition: 'all var(--transition-fast)',
					flexShrink: 0,
				}}
			>
				×
			</button>
		</div>
	);
};

export default Toast;

