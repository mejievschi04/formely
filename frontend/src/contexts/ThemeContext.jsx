import { ThemeContext, THEME_STORAGE_KEY } from './ThemeContextShared.js';
import React, {  useCallback, useLayoutEffect, useMemo, useState } from 'react';





function readStoredTheme() {
	try {
		const v = localStorage.getItem(THEME_STORAGE_KEY);
		if (v === 'dark' || v === 'light') return v;
	} catch {
		/* ignore */
	}
	return 'light';
}



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
