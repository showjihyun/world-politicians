import type { Branch, Politician } from '../types';
import { EXECUTIVE } from './politicians/executive';
import { SENATE } from './politicians/senate';
import { HOUSE } from './politicians/house';
import { OTHERS } from './politicians/others';

export const POLITICIANS: Politician[] = [
  ...EXECUTIVE,
  ...SENATE,
  ...HOUSE,
  ...OTHERS,
];

export const POLITICIAN_MAP: Map<string, Politician> = new Map(
  POLITICIANS.map((p) => [p.id, p])
);

export const BRANCH_ORDER: Branch[] = [
  'executive',
  'senate',
  'house',
  'governor',
  'former',
  'special',
];

/** dev-time integrity check */
if (import.meta.env.DEV) {
  const ids = new Set(POLITICIANS.map((p) => p.id));
  const dupes = POLITICIANS.length - ids.size;
  if (dupes > 0) console.warn(`[POLARIS] duplicate politician ids: ${dupes}`);
}
