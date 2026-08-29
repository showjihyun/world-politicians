import { describe, expect, it } from 'vitest';
import {
  billUrl,
  buildStats,
  pairKey,
  parseBill,
  selectEdges,
  strengthOf,
  tallyPairs,
  type Bill,
} from './cosponsor-core.mts';

const xml = (over: { sponsor?: string; cosponsors?: string[]; type?: string; number?: number } = {}) => {
  const { sponsor = 'A000001', cosponsors = ['B000002'], type = 'S', number = 5 } = over;
  return `<bill>
  <congress>119</congress>
  <type>${type}</type>
  <number>${number}</number>
  <introducedDate>2025-01-06</introducedDate>
  <titles><item><title>Laken Riley Act</title></item></titles>
  <sponsors><item><bioguideId>${sponsor}</bioguideId></item></sponsors>
  <cosponsors>${cosponsors.map((c) => `<item><bioguideId>${c}</bioguideId></item>`).join('')}</cosponsors>
  <committees><item><bioguideId>Z000999</bioguideId></item></committees>
</bill>`;
};

const bill = (over: Partial<Bill> = {}): Bill => ({
  congress: 119, type: 'S', number: 1, title: 'A Bill',
  introduced: '2025-03-01', sponsor: 'A', cosponsors: ['B'], ...over,
});

describe('parseBill', () => {
  it('발의자와 공동발의자를 읽는다', () => {
    expect(parseBill(xml())).toMatchObject({
      congress: 119, type: 'S', number: 5,
      title: 'Laken Riley Act', introduced: '2025-01-06',
      sponsor: 'A000001', cosponsors: ['B000002'],
    });
  });

  // 문서 전체에서 bioguideId 를 찾으면 위원회·관련 의원까지 공동발의자가 된다
  it('cosponsors 블록 밖의 bioguideId 를 끌어오지 않는다', () => {
    expect(parseBill(xml())!.cosponsors).not.toContain('Z000999');
  });

  it('발의자가 공동발의자 목록에 있어도 자기 자신은 뺀다', () => {
    const b = parseBill(xml({ sponsor: 'A000001', cosponsors: ['A000001', 'B000002'] }));
    expect(b!.cosponsors).toEqual(['B000002']);
  });

  it('같은 사람이 두 번 나와도 한 번만 센다', () => {
    const b = parseBill(xml({ cosponsors: ['B000002', 'B000002'] }));
    expect(b!.cosponsors).toEqual(['B000002']);
  });

  it('공동발의자가 없는 법안도 읽는다', () => {
    const noCos = xml().replace(/<cosponsors>[\s\S]*?<\/cosponsors>/, '');
    expect(parseBill(noCos)!.cosponsors).toEqual([]);
  });

  it('발의자가 없으면 버린다', () => {
    expect(parseBill(xml().replace(/<sponsors>[\s\S]*?<\/sponsors>/, ''))).toBeNull();
  });

  it('필수 필드가 없으면 버린다', () => {
    expect(parseBill(xml().replace(/<introducedDate>[^<]*<\/introducedDate>/, ''))).toBeNull();
  });
});

describe('tallyPairs', () => {
  it('발의자와 공동발의자 쌍을 센다', () => {
    const t = tallyPairs([bill(), bill({ number: 2 })]);
    expect(t.get(pairKey('A', 'B'))!.bills).toBe(2);
  });

  // 한 법안의 공동발의자 30명을 서로 다 연결하면 435개 엣지가 된다.
  // 그건 관계가 아니라 법안의 크기다.
  it('공동발의자끼리는 세지 않는다', () => {
    const t = tallyPairs([bill({ cosponsors: ['B', 'C'] })]);
    expect([...t.keys()].sort()).toEqual([pairKey('A', 'B'), pairKey('A', 'C')].sort());
    expect(t.has(pairKey('B', 'C'))).toBe(false);
  });

  it('첫 날짜와 마지막 날짜를 잡는다', () => {
    const t = tallyPairs([
      bill({ introduced: '2025-06-01' }),
      bill({ introduced: '2025-02-01', number: 2 }),
      bill({ introduced: '2026-01-01', number: 3 }),
    ]);
    expect(t.get(pairKey('A', 'B'))).toMatchObject({ first: '2025-02-01', last: '2026-01-01' });
  });

  it('근거 표본을 정해진 수만큼만 모은다', () => {
    const bills = [1, 2, 3, 4, 5].map((n) => bill({ number: n }));
    expect(tallyPairs(bills, 2).get(pairKey('A', 'B'))!.samples).toHaveLength(2);
  });
});

describe('billUrl', () => {
  it('상원 법안 주소를 만든다', () => {
    expect(billUrl(bill({ type: 'S', number: 5 }))).toBe(
      'https://www.congress.gov/bill/119th-congress/senate-bill/5'
    );
  });

  it('하원 결의안 주소를 만든다', () => {
    expect(billUrl(bill({ type: 'HRES', number: 12 }))).toContain('house-resolution/12');
  });

  it('소문자 타입도 처리한다', () => {
    expect(billUrl(bill({ type: 'hr', number: 1 }))).toContain('house-bill/1');
  });
});

describe('selectEdges', () => {
  const opts = {
    threshold: 10,
    toPolaris: new Map([['A', 'warren'], ['B', 'markey'], ['C', 'cruz']]),
    partyOf: new Map([['warren', 'D'], ['markey', 'D'], ['cruz', 'R']]),
    curated: new Set([pairKey('warren', 'markey')]),
  };
  const tally = (pairs: Record<string, number>) => {
    const m = new Map();
    for (const [k, n] of Object.entries(pairs)) {
      m.set(k, { bills: n, first: '2025-01-01', last: '2026-01-01', samples: [bill()] });
    }
    return m;
  };

  it('기준선 아래는 버린다', () => {
    expect(selectEdges(tally({ [pairKey('A', 'B')]: 9 }), opts)).toHaveLength(0);
    expect(selectEdges(tally({ [pairKey('A', 'B')]: 10 }), opts)).toHaveLength(1);
  });

  it('우리 인물이 아니면 버린다', () => {
    expect(selectEdges(tally({ [pairKey('A', 'ZZZ')]: 50 }), opts)).toHaveLength(0);
  });

  it('이미 큐레이션된 쌍은 표시해 둔다 — 선을 두 번 긋지 않기 위해', () => {
    const [e] = selectEdges(tally({ [pairKey('A', 'B')]: 30 }), opts);
    expect(e.duplicate).toBe(true);
  });

  it('다른 당끼리면 초당적으로 표시한다', () => {
    const [e] = selectEdges(tally({ [pairKey('A', 'C')]: 30 }), opts);
    expect(e).toMatchObject({ crossParty: true, duplicate: false });
  });

  it('같은 당은 초당적이 아니다', () => {
    expect(selectEdges(tally({ [pairKey('A', 'B')]: 30 }), opts)[0].crossParty).toBe(false);
  });

  it('a·b 를 항상 같은 순서로 낸다', () => {
    const [e] = selectEdges(tally({ [pairKey('B', 'A')]: 30 }), opts);
    expect([e.a, e.b]).toEqual(['markey', 'warren']);
  });

  // 같은 입력이면 같은 파일이 나와야 git diff 가 의미를 갖는다
  it('건수 내림차순으로 정렬한다', () => {
    const es = selectEdges(tally({ [pairKey('A', 'B')]: 12, [pairKey('A', 'C')]: 40 }), opts);
    expect(es.map((e) => e.bills)).toEqual([40, 12]);
  });

  it('근거 링크를 붙인다', () => {
    const [e] = selectEdges(tally({ [pairKey('A', 'B')]: 30 }), opts);
    expect(e.samples[0].url).toContain('congress.gov/bill/119th-congress');
  });
});

describe('strengthOf', () => {
  it('건수를 1~3 으로 나눈다', () => {
    expect(strengthOf(10)).toBe(1);
    expect(strengthOf(19)).toBe(1);
    expect(strengthOf(20)).toBe(2);
    expect(strengthOf(39)).toBe(2);
    expect(strengthOf(40)).toBe(3);
  });
});

describe('buildStats', () => {
  it('신규와 초당적 수를 따로 센다', () => {
    const edges = [
      { duplicate: false, crossParty: true },
      { duplicate: true, crossParty: false },
      { duplicate: false, crossParty: false },
    ] as ReturnType<typeof selectEdges>;
    expect(buildStats(100, new Map([['x', {} as never]]), edges)).toEqual({
      billsScanned: 100, pairsAll: 1, edges: 3, fresh: 2, crossParty: 1,
    });
  });
});
