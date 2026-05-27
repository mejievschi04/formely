import React from 'react';

const AutoSaveIndicator = ({ status }) => {
	const getStatusConfig = () => {
		switch (status) {
			case 'saving':
				return { text: 'Se salvează...', icon: '⏳', color: '#9FE22F' };
			case 'saved':
				return { text: 'Salvat', icon: '✓', color: '#09A86B' };
			case 'error':
				return { text: 'Eroare salvare', icon: '⚠️', color: '#ef4444' };
			default:
				return { text: '', icon: '', color: '' };
		}
	};

	const config = getStatusConfig();

	if (!config.text) return null;

	return (
		<div
			className="admin-auto-save-indicator"
			style={{ color: config.color }}
		>
			<span>{config.icon}</span>
			<span>{config.text}</span>
		</div>
	);
};

export default AutoSaveIndicator;
