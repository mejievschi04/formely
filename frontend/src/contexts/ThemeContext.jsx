import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';

export const THEME_STORAGE_KEY = 'formely-ui-theme';

const ThemeContext = createContext(null);

function readStoredTheme() {
	try {
		const v = localStorage.getItem(THEME_STORAGE_KEY);
		if (v === 'dark' || v === 'light') return v;
	} catch {
		/* ignore */
	}
	return 'light';
}

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within ThemeProvider');
	}
	return context;
};

export const ThemeProvider = ({ children }) => {
	const [theme, setThemeState] = useState(readStoredTheme);

	useLayoutEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
	}, [theme]);

	const setTheme = useCallback((next) => {
		const t = next === 'dark' ? 'dark' : 'light';
		setThemeState(t);
		try {
			localStorage.setItem(THEME_STORAGE_KEY, t);
		} catch {
			/* ignore */
		}
	}, []);

	const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
