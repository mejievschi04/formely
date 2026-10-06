import { ThemeContext, THEME_STORAGE_KEY } from './ThemeContextShared.js';
import React, { useLayoutEffect, useMemo } from 'react';

/* Formely are doar tema luminoasă; setTheme rămâne pentru compatibilitate și nu face nimic. */
const LIGHT_THEME = 'light';
const noop = () => {};

export const ThemeProvider = ({ children }) => {
	useLayoutEffect(() => {
		document.documentElement.setAttribute('data-theme', LIGHT_THEME);
		try {
			localStorage.removeItem(THEME_STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}, []);

	const value = useMemo(() => ({ theme: LIGHT_THEME, setTheme: noop }), []);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
