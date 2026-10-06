import React from 'react';

// Culorile stărilor sunt în common-components.css (.is-pending / .is-saving / .is-saved / .is-error).
const AutoSaveIndicator = ({ status, onRetry, liveHint = false }) => {
	const getStatusConfig = () => {
		switch (status) {
			case 'pending':
				return { text: 'Nesalvat', icon: '•' };
			case 'saving':
				return { text: 'Se salvează...', icon: '⏳' };
			case 'saved':
				return {
					text: liveHint ? 'Salvat · nepublicat' : 'Salvat',
					icon: '✓',
				};
			case 'error':
				return { text: 'Modificările nu au fost salvate', icon: '⚠️' };
			default:
				return { text: '', icon: '' };
		}
	};

	const config = getStatusConfig();

	if (!config.text) return null;

	return (
		<div
			className={`admin-auto-save-indicator is-${status || 'idle'}`}
			role={status === 'error' ? 'alert' : 'status'}
		>
			<span>{config.icon}</span>
			<span>{config.text}</span>
			{status === 'error' && typeof onRetry === 'function' ? (
				<button type="button" className="admin-auto-save-retry" onClick={onRetry}>
					Reîncearcă
				</button>
			) : null}
		</div>
	);
};

export default AutoSaveIndicator;
