/** Aceeași cheie ca în frontend/src/contexts/ThemeContext.jsx */
export const THEME_STORAGE_KEY = 'formely-ui-theme';

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Preferință salvată în LMS; altfel sistemul operativ. */
export function resolveTheme() {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
}

export function persistTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
  return t;
}
