import type { FactionDef } from '../types';
import { L } from './L';

export const FACTIONS: FactionDef[] = [
  {
    id: 'maga',
    label: L('MAGA Core', 'MAGA 본류'),
    short: 'M',
    party: 'R',
    color: '#ff5d5d',
    desc: L(
      'Trump loyalists — the dominant force inside the GOP.',
      '트럼프 충성파. 당 내 최대 중심 세력.'
    ),
  },
  {
    id: 'gop-est',
    label: L('GOP Establishment', 'GOP 확장파'),
    short: 'E',
    party: 'R',
    color: '#f97316',
    desc: L(
      'Traditional institutional Republicans keeping distance from MAGA.',
      '전통 원내 기득권. 트럼프과 거리를 두는 온건·국방파.'
    ),
  },
  {
    id: 'gop-liberty',
    label: L('Liberty Wing', '자유지상파'),
    short: 'L',
    party: 'R',
    color: '#eab308',
    desc: L('Fiscally hawkish, non-interventionist. Paul & Massie orbit.', '재정·외교 불간섭 노선. 폴·매시 계열.'),
  },
  {
    id: 'dem-prog',
    label: L('Progressive', '민주 진보'),
    short: 'P',
    party: 'D',
    color: '#22d3ee',
    desc: L('The Squad & Bernie orbit — structural reform wing.', '스쿼드·버니 계열. 구조개혁 강경파.'),
  },
  {
    id: 'dem-est',
    label: L('Democratic Establishment', '민주 원내파'),
    short: 'O',
    party: 'D',
    color: '#60a5fa',
    desc: L('Schumer–Pelosi–Jeffries leadership orbit.', '슈머·펠로시·제프리스 원내 지도부 계열.'),
  },
  {
    id: 'dem-mod',
    label: L('Moderate', '민주 온건'),
    short: 'D',
    party: 'D',
    color: '#818cf8',
    desc: L('Swing-district pragmatists.', '스윙지구·중도 실용파.'),
  },
  {
    id: 'independent',
    label: L('Independent', '무소속'),
    short: 'I',
    party: 'I',
    color: '#a78bfa',
    desc: L('Outside both parties.', '양당 바깥.'),
  },
  {
    id: 'special',
    label: L('Non-Elected Power', '비정치 행위자'),
    short: 'X',
    party: 'X',
    color: '#94a3b8',
    desc: L('Unelected actors who still bend the map.', '직접 선출되지 않았지만 지형을 흔드는 자.'),
  },
];

export const FACTION_MAP: Record<string, FactionDef> = Object.fromEntries(
  FACTIONS.map((f) => [f.id, f])
);
