import { loadFont } from '@remotion/fonts';
import { loadFont as loadFira } from '@remotion/google-fonts/FiraCode';
import { staticFile } from 'remotion';

export const W = 3840;
export const H = 2160;
export const FPS = 60;

/**
 * 음악 박자 격자. "Hitman" 은 150 BPM 이라 한 박이 0.4초 = 60fps 에서 24프레임,
 * 한 마디가 96프레임이다. 장면 경계는 전부 마디 위에 둔다.
 */
export const BEAT = 24;
export const BAR = 96;

/** 트랙의 51.85초 지점 드롭을 영상 14초(840f)에 맞춘다 → 트랙을 37.85초부터 튼다 */
export const DROP = 840;
export const MUSIC_TRIM_SECONDS = 37.85;

// 앱의 정본 색 (src/types.ts REL_META, factions.ts) 과 같은 값
export const C = {
  bg: '#05080f',
  panel: '#0c1322',
  line: '#1c2740',
  ink: '#eef3fb',
  sub: '#9fb0cc',
  dim: '#5d6b85',
  ally: '#34d399',
  feud: '#fb7185',
  bridge: '#fbbf24',
  family: '#c084fc',
  mentor: '#94a3b8',
  cosponsor: '#22d3ee',
  R: '#f25563',
  D: '#4f8ff7',
  I: '#a78bfa',
  X: '#cbd5e1',
  gold: '#f5c451',
} as const;

export const REL_COLOR: Record<string, string> = {
  ally: C.ally,
  feud: C.feud,
  bipartisan: C.bridge,
  family: C.family,
  mentor: C.mentor,
  cosponsor: C.cosponsor,
};

export const PARTY_COLOR: Record<string, string> = { R: C.R, D: C.D, I: C.I, X: C.X };

export const SANS = 'Pretendard';
export const { fontFamily: MONO } = loadFira('normal', { weights: ['400', '500', '600'], subsets: ['latin'] });

for (const [w, file] of [
  ['400', 'Regular'],
  ['500', 'Medium'],
  ['700', 'Bold'],
  ['800', 'ExtraBold'],
  ['900', 'Black'],
] as const) {
  loadFont({ family: SANS, url: staticFile(`fonts/Pretendard-${file}.woff2`), weight: w });
}

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
