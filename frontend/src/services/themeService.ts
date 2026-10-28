import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'signflow.theme';
const listeners = new Set<(theme: Theme) => void>();

const stored = (): Theme | null => {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

const systemTheme = (): Theme =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const getTheme = (): Theme => stored() ?? systemTheme();

export const applyTheme = (theme: Theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
};

export const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice lasts for this page only
  }
  applyTheme(theme);
  listeners.forEach((fn) => fn(theme));
};

// Called once before React renders, so the page never flashes the wrong theme
export const initTheme = () => {
  applyTheme(getTheme());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!stored()) {
      applyTheme(systemTheme());
      listeners.forEach((fn) => fn(systemTheme()));
    }
  });
};

export const useTheme = (): [Theme, () => void] => {
  const [theme, setState] = useState<Theme>(getTheme);
  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
};
