import React from 'react';

const UrlBlockEditor = ({ label = 'URL', value, onChange, placeholder }) => {
	return (
		<div>
			<label className="admin-settings-label">{label}</label>
			<input
				className="admin-settings-input"
				type="url"
				value={value || ''}
				placeholder={placeholder || 'https://...'}
				onChange={(e) => onChange(e.target.value)}
			/>
			<div className="admin-settings-hint">Poți lipi un link (YouTube/Vimeo/Google Drive/website etc.).</div>
		</div>
	);
};

export default UrlBlockEditor;

