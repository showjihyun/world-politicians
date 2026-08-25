import { useUIStore, type Locale } from '../store/uiStore';
import { UI_EN, type UIDict } from './ui-en';
import { UI_KO } from './ui-ko';

const DICTS: Record<Locale, UIDict> = { en: UI_EN, ko: UI_KO };

export interface LocalizedText {
  en: string;
  ko: string;
}

/** 로컬라이즈드 텍스트 → 현재 로케일 문자열 */
export function lt(t: LocalizedText, locale: Locale): string {
  return t[locale] ?? t.en;
}

/** 컴포넌트용 훅: t(UI키), L(데이터 텍스트) 두 함수 제공 */
export function useI18n() {
  const locale = useUIStore((s) => s.locale);
  return {
    locale,
    t: DICTS[locale],
    L: (text: LocalizedText) => lt(text, locale),
  };
}
