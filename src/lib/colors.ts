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
  // 'Non-political' 은 오해를 부른다 — 중간선거에 거액을 쓰는 인물에게 붙일 말이 아니다.
  // 이 필드가 실제로 담는 것은 "어느 정당 소속으로 선출/등록되었는가" 이고,
  // 정치적 정렬은 faction 이 담는다 (배넌: party=X, faction=MAGA).
  X: { en: 'Unaffiliated', ko: '무소속' },
};

export const COLORS = {
  bg: '#05070f',
  panel: 'rgba(10, 14, 26, 0.78)',
  panelBorder: 'rgba(148, 163, 184, 0.14)',
  text: '#e6edf7',
  textDim: '#8b95ab',
  accent: '#fbbf24',
};
