import { create } from 'zustand';

interface ThemeState {
  themeKey: string;
  setTheme: (themeKey: string) => void;
  hydrate: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeKey: 'light',

  setTheme: (themeKey) => {
    localStorage.setItem('orim_theme', themeKey);
    set({ themeKey });
  },

  hydrate: () => {
    const stored = localStorage.getItem('orim_theme')?.trim();
    if (stored) {
      set({ themeKey: stored });
    }
  },
}));
