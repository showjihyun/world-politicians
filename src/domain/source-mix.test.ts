import { describe, it, expect } from 'vitest';
import { MIX_TOP, countsTowardMix, outletMix, shareOf, wireShare } from './source-mix';

describe('outletMix — 화면·감사·E2E 가 같이 쓰는 산식', () => {
  it('건수 내림차순으로 준다 — 매니페스트 키 순서에 기대지 않는다', () => {
    const mix = outletMix({ CNN: 3, NPR: 10, Axios: 7 });
    expect(mix.entries.map(([name]) => name)).toEqual(['NPR', 'Axios', 'CNN']);
  });

  it('동점은 이름순 — 데이터가 안 바뀐 날 순서가 흔들리면 안 된다', () => {
    const forward = outletMix({ Semafor: 4, Axios: 4, NPR: 4 });
    const reversed = outletMix({ NPR: 4, Axios: 4, Semafor: 4 });
    expect(forward.entries).toEqual(reversed.entries);
    expect(forward.entries.map(([name]) => name)).toEqual(['Axios', 'NPR', 'Semafor']);
  });

  it('이름이 비었거나 0건인 항목은 세지 않는다', () => {
    const mix = outletMix({ CNN: 5, '': 9, NPR: 0 });
    expect(mix.entries).toEqual([['CNN', 5]]);
    // total 이 14 가 되면 화면은 5건짜리 막대를 36% 로 그린다 — 에러 없이 틀린다
    expect(mix.total).toBe(5);
  });

  it('상위 N 과 나머지가 전체를 정확히 나눈다', () => {
    const outlets = { a: 10, b: 9, c: 8, d: 7, e: 6, f: 5, g: 4 };
    const mix = outletMix(outlets);
    expect(mix.top).toHaveLength(MIX_TOP);
    expect(mix.rest.map(([name]) => name)).toEqual(['f', 'g']);
    expect(mix.restTotal).toBe(9);
    expect(mix.top.reduce((n, [, c]) => n + c, 0) + mix.restTotal).toBe(mix.total);
  });

  it('topN 이 항목 수보다 크면 나머지가 비고 100% 가 된다', () => {
    const mix = outletMix({ CNN: 2, NPR: 1 });
    expect(mix.rest).toEqual([]);
    expect(mix.restTotal).toBe(0);
    expect(mix.topShare).toBe(100);
  });

  it('빈 입력에서 나눗셈을 하지 않는다 — NaN 이 화면에 나가면 막대가 사라진다', () => {
    const empties: Record<string, number>[] = [{}, { '': 3 }, { CNN: 0 }];
    for (const empty of empties) {
      const mix = outletMix(empty);
      expect(mix.total).toBe(0);
      expect(mix.topShare).toBe(0);
      expect(Number.isNaN(mix.topShare)).toBe(false);
      expect(wireShare(mix)).toBe(0);
    }
  });

  it('매니페스트가 없어도 죽지 않는다', () => {
    expect(outletMix(undefined as unknown as Record<string, number>).entries).toEqual([]);
  });
});

describe('비율', () => {
  it('shareOf 는 자리수를 지킨다', () => {
    expect(shareOf(1, 3)).toBe(33);
    expect(shareOf(1, 3, 1)).toBe(33.3);
    expect(shareOf(0, 0)).toBe(0);
  });

  it('통신사는 허용 목록의 여러 표기를 모두 센다', () => {
    // 정규화 전 아카이브에는 AP·AP News·Associated Press 가 함께 남아 있었다
    const mix = outletMix({ 'AP News': 6, Reuters: 4, AP: 2, CNN: 88 });
    expect(wireShare(mix)).toBe(12);
  });

  it('통신사 몫은 소수 한 자리 — 기준선으로 쓰는 값이라 반올림으로 뭉개지 않는다', () => {
    const mix = outletMix({ Reuters: 1, CNN: 299 });
    expect(wireShare(mix)).toBe(0.3);
    expect(shareOf(1, 300, 0)).toBe(0);
  });
});

describe('countsTowardMix', () => {
  it('음수 건수를 세지 않는다', () => {
    expect(countsTowardMix('CNN', -3)).toBe(false);
  });
});
