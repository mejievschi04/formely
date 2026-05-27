import { useCallback, useLayoutEffect, useState } from 'react';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  persistTheme,
  resolveTheme,
} from '../utils/theme';

export default function useFormelyTheme() {
  const [theme, setTheme] = useState('light');

  const syncFromStorage = useCallback(() => {
    const next = resolveTheme();
    applyTheme(next);
    setTheme(next);
  }, []);

  useLayoutEffect(() => {
    syncFromStorage();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => {
      if (!getStoredTheme()) syncFromStorage();
    };

    const onStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        syncFromStorage();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncFromStorage();
    };

    media.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [syncFromStorage]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    persistTheme(next);
    setTheme(next);
  }, [theme]);

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
  };
}
