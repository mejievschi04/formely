import { createContext, useContext } from 'react';
export const THEME_STORAGE_KEY = 'volta-ui-theme';

export const ThemeContext = createContext(null);

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within ThemeProvider');
	}
	return context;
};
