import { create } from 'zustand';

export type Locale = 'en' | 'ko';
export type LangMode = '2d' | '3d';

interface UIState {
  locale: Locale;
  langMode: LangMode;
  autoRotate2d: boolean;
  autoOrbit3d: boolean;
  setLocale: (l: Locale) => void;
  setLangMode: (m: LangMode) => void;
  toggleAutoRotate2d: () => void;
  toggleAutoOrbit3d: () => void;
}

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('polaris-locale') : null;

export const useUIStore = create<UIState>((set) => ({
  locale: saved === 'ko' ? 'ko' : 'en',
  langMode: '2d',
  autoRotate2d: false,
  autoOrbit3d: false,
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
  toggleAutoRotate2d: () => set((s) => ({ autoRotate2d: !s.autoRotate2d })),
  toggleAutoOrbit3d: () => set((s) => ({ autoOrbit3d: !s.autoOrbit3d })),
}));
