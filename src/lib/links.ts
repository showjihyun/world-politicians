import type { Politician } from '../types';

/** 공식 사이트 — 주요 인물만 큐레이션 (나머지는 위키·뉴스·X 검색 자동 링크) */
export const SITE_URLS: Record<string, string> = {
  sanders: 'https://berniesanders.com',
  aoc: 'https://ocasio-cortez.com',
  newsom: 'https://www.gov.ca.gov',
  desantis: 'https://www.flgov.com',
  'abbott-greg': 'https://gov.texas.gov',
  pritzker: 'https://gov.illinois.gov',
  whitmer: 'https://www.michigan.gov/whitmer',
  shapiro: 'https://www.governor.pa.gov',
  walz: 'https://mn.gov/governor',
  'moore-wes': 'https://governor.maryland.gov',
  harris: 'https://kamalaharris.com',
  biden: 'https://joebiden.com',
  hillary: 'https://hillaryclinton.com',
  obama: 'https://barackobama.com',
  warren: 'https://elizabethwarren.com',
  cruz: 'https://www.cruz.senate.gov',
  graham: 'https://www.lgraham.senate.gov',
  schumer: 'https://www.schumer.senate.gov',
  jeffries: 'https://hakeemjeffries.house.gov',
  fetterman: 'https://fetterman.senate.gov',
  pelosi: 'https://nancypelosi.com',
  trump: 'https://www.whitehouse.gov/',
  musk: 'https://x.com/elonmusk',
  'mccain-john': 'https://johnmccain.com',
};

export function siteUrlOf(p: Politician): string | undefined {
  return SITE_URLS[p.id];
}

export function xSearchUrl(enName: string): string {
  return `https://x.com/search?q=${encodeURIComponent(`"${enName}"`)}&f=live`;
}

export function newsSearchUrl(enName: string): string {
  return `https://news.google.com/search?q=${encodeURIComponent(`"${enName}" when:30d`)}&hl=en-US&gl=US&ceid=US:en`;
}
