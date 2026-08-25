import type { LocalizedText } from '../types';

/** 데이터 저작용 이중언어 축약 헬퍼 */
export const L = (en: string, ko: string): LocalizedText => ({ en, ko });

export const Larr = (...pairs: [string, string][]): LocalizedText[] =>
  pairs.map(([en, ko]) => ({ en, ko }));
