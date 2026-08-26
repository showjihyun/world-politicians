import type { LocalizedText, Party } from '../types';

export const PARTY_COLOR: Record<Party, string> = {
  R: '#ef4444',
  D: '#3b82f6',
  I: '#a78bfa',
  X: '#94a3b8',
};

export const PARTY_LABEL: Record<Party, LocalizedText> = {
  R: { en: 'Republican', ko: '공화당' },
  D: { en: 'Democrat', ko: '민주당' },
  I: { en: 'Independent', ko: '무소속' },
  X: { en: 'Non-political', ko: '비정치' },
};

export const COLORS = {
  bg: '#05070f',
  panel: 'rgba(10, 14, 26, 0.78)',
  panelBorder: 'rgba(148, 163, 184, 0.14)',
  text: '#e6edf7',
  textDim: '#8b95ab',
  accent: '#fbbf24',
};
