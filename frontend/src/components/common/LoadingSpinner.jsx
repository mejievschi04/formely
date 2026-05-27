import React from 'react';

const LoadingSpinner = ({ size = 'medium', fullScreen = false, message = null }) => {
	const sizeStyles = {
		small: { width: '20px', height: '20px', borderWidth: '2px' },
		medium: { width: '40px', height: '40px', borderWidth: '3px' },
		large: { width: '60px', height: '60px', borderWidth: '4px' },
	};

	const spinnerStyle = {
		...sizeStyles[size],
		border: `${sizeStyles[size].borderWidth} solid var(--border-primary)`,
		borderTopColor: 'var(--color-primary-500)',
		borderRadius: 'var(--radius-full)',
		animation: 'spin 0.8s linear infinite',
	};

	if (fullScreen) {
		return (
			<div style={{
				position: 'fixed',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'var(--bg-overlay)',
				backdropFilter: 'blur(8px)',
				zIndex: 9999,
			}}>
				<div style={spinnerStyle} />
				{message && (
					<p style={{
						marginTop: 'var(--space-4)',
						color: 'var(--text-secondary)',
						fontSize: 'var(--font-size-base)',
					}}>
						{message}
					</p>
				)}
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
			<div style={spinnerStyle} />
			{message && (
				<p style={{
					color: 'var(--text-secondary)',
					fontSize: 'var(--font-size-sm)',
				}}>
					{message}
				</p>
			)}
		</div>
	);
};

export default LoadingSpinner;

