import React from 'react';

import { useTheme } from '../contexts/ThemeContextShared.js';
import './ThemePreferenceControl.css';

export default function ThemePreferenceControl({ className = '' }) {
	const { theme, setTheme } = useTheme();

	return (
		<div className={`va-theme-preference ${className}`.trim()} role="region" aria-label="Tema interfață">
			<div className="va-theme-preference-info">
				<span className="va-theme-preference-label">Tema interfață</span>
				<p className="va-theme-preference-desc">
					Alege rapid între modul luminos și modul întunecat.
				</p>
			</div>
			<div className="va-theme-segment" role="group" aria-label="Alege tema">
				<button
					type="button"
					className={`va-theme-segment-btn ${theme === 'light' ? 'active' : ''}`}
					onClick={() => setTheme('light')}
					aria-pressed={theme === 'light'}
				>
					Luminos
				</button>
				<button
					type="button"
					className={`va-theme-segment-btn ${theme === 'dark' ? 'active' : ''}`}
					onClick={() => setTheme('dark')}
					aria-pressed={theme === 'dark'}
				>
					Întunecat
				</button>
			</div>
		</div>
	);
}
