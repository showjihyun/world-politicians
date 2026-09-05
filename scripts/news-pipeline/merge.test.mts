/**
 * 매니페스트 조립 규칙.
 *
 * `buildIndex` 는 순수하지 않은 파일(fs 를 다루는 merge.mts)에 살지만, 하는 일은
 * 세는 것뿐이다. 그런데 이 셈이 화면의 분모가 된다 — 여기서 하나를 흘리면
 * 화면은 "302 signals" 라고 적으면서 295 를 100% 로 그린다. 에러도 로그도 없다.
 */
import { describe, expect, it } from 'vitest';
import { buildIndex, UNATTRIBUTED, type SignalsFile } from './merge.mts';
import type { Signal } from './extract.mts';

const sig = (over: Partial<Signal> & { id: string }): Signal => ({
  date: '2026-08-01',
  source: 'Politico',
  url: `https://politico.com/${over.id}`,
  title: `Headline ${over.id}`,
  people: ['trump'],
  classified: true,
  polarity: 'feud',
  ...over,
});

const fileOf = (signals: Signal[]): SignalsFile => ({
  generatedAt: '2026-09-01T15:10:22.882Z',
  windowDays: 30,
  stats: {
    total: signals.length,
    classified: signals.filter((s) => s.classified).length,
    ally: 0,
    feud: signals.length,
    neutral: 0,
  },
  signals,
});

const sum = (outlets: Record<string, number>) =>
  Object.values(outlets).reduce((n, c) => n + c, 0);

describe('buildIndex — 매체 구성', () => {
  it('허용 목록의 정본 이름으로 모은다', () => {
    const idx = buildIndex(
      fileOf([
        sig({ id: '1', source: 'POLITICO Pro' }),
        sig({ id: '2', source: 'E&E News by POLITICO' }),
        sig({ id: '3', source: 'Politico' }),
      ]),
      '2026-09-01T15:10:22.882Z',
      ['2026-08']
    );
    expect(idx.outlets).toEqual({ Politico: 3 });
  });

  // 회귀: 저장된 `outlet` 을 그대로 읽으면 옛 규칙으로 쓰인 값이 365일 아카이브에
  // 굳는다. 별칭을 고쳐도 이미 쌓인 행은 옛 이름으로 남아, 매니페스트의 분모와
  // 시계열의 투표 키가 시대별로 다른 말을 하게 된다.
  it('저장된 outlet 이 낡았어도 source 에서 다시 만든다', () => {
    const idx = buildIndex(
      fileOf([
        // 예전 실행이 남긴 값 — 지금 규칙이면 'Politico' 가 되어야 한다
        { ...sig({ id: '1', source: 'POLITICO Pro' }), outlet: '옛 이름' },
        sig({ id: '2', source: 'Politico' }),
      ]),
      '2026-09-01T15:10:22.882Z',
      ['2026-08']
    );
    expect(idx.outlets).toEqual({ Politico: 2 });
  });

  // 회귀: canonicalSourceName('') 이 '' 를 돌려주고 `if (name)` 이 그 신호를
  // 통째로 건너뛰었다. 화면은 건수를 stats.total 로 적고 비율은 outlets 합계로
  // 나누므로, 독자는 302 위에서 100% 가 되는 막대를 보게 된다.
  it('매체명이 비어도 버리지 않는다 — 합계가 전체 건수와 같아야 한다', () => {
    const signals = [
      sig({ id: '1' }),
      sig({ id: '2', source: '' }),
      sig({ id: '3', source: '   ' }),
    ];
    const idx = buildIndex(fileOf(signals), '2026-09-01T15:10:22.882Z', ['2026-08']);

    expect(sum(idx.outlets)).toBe(idx.stats.total);
    expect(idx.outlets[UNATTRIBUTED]).toBe(2);
  });

  it('라벨은 비어 있지 않다 — 빈 키는 화면이 다시 걸러 버린다', () => {
    expect(UNATTRIBUTED.length).toBeGreaterThan(0);
  });

  it('목록에 없는 매체명은 원본 그대로 세고 버리지 않는다', () => {
    const idx = buildIndex(
      fileOf([sig({ id: '1', source: 'Some Local Paper' })]),
      '2026-09-01T15:10:22.882Z',
      ['2026-08']
    );
    expect(idx.outlets).toEqual({ 'Some Local Paper': 1 });
  });

  // 데이터가 안 바뀐 날에도 키 순서만 흔들리면 매니페스트에 diff 가 생긴다
  it('건수 내림차순, 동점은 이름순으로 고정한다', () => {
    const idx = buildIndex(
      fileOf([
        sig({ id: '1', source: 'CNN' }),
        sig({ id: '2', source: 'Politico' }),
        sig({ id: '3', source: 'Politico' }),
        sig({ id: '4', source: 'Axios' }),
      ]),
      '2026-09-01T15:10:22.882Z',
      ['2026-08']
    );
    expect(Object.keys(idx.outlets)).toEqual(['Politico', 'Axios', 'CNN']);
  });
});
