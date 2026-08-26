import { create } from 'zustand';

export type Locale = 'en' | 'ko';
export type LangMode = '2d' | '3d';

interface UIState {
  locale: Locale;
  langMode: LangMode;
  setLocale: (l: Locale) => void;
  setLangMode: (m: LangMode) => void;
}

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('polaris-locale') : null;

export const useUIStore = create<UIState>((set) => ({
  locale: saved === 'ko' ? 'ko' : 'en',
  langMode: '2d',
  setLocale: (locale) => {
    localStorage.setItem('polaris-locale', locale);
    document.documentElement.lang = locale;
    document.title =
      locale === 'ko'
        ? 'POLARIS — 미국 정치인 관계 지형도'
        : 'POLARIS — U.S. Politician Network Atlas';
    set({ locale });
  },
  setLangMode: (langMode) => set({ langMode }),
}));
