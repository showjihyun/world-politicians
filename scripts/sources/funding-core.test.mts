import { describe, expect, it } from 'vitest';
import {
  aggregate,
  buildStats,
  classifyDonor,
  parseCandidateSummary,
  parseCommittee,
  parsePas2,
  toAmount,
  type Committee,
  type Pas2Row,
} from './funding-core.mts';

const cmte = (over: Partial<Committee> = {}): Committee => ({
  id: 'C1', name: 'ACME PAC', designation: 'B', type: 'Q', connectedOrg: 'ACME INC', ...over,
});

const row = (over: Partial<Pas2Row> = {}): Pas2Row => ({
  committeeId: 'C1', transactionType: '24K', amount: 5000, candidateId: 'H1', ...over,
});

describe('toAmount', () => {
  it('숫자를 읽는다', () => {
    expect(toAmount('5000')).toBe(5000);
    expect(toAmount(' 12.5 ')).toBe(12.5);
  });

  // 빈 칸을 Number() 에 그냥 넘기면 0 이 되는데, 여기서는 0 이 맞다.
  // 하지만 쓰레기 값은 NaN 이 되어 합계 전체를 오염시킨다.
  it('빈 칸과 쓰레기는 0 으로 본다', () => {
    expect(toAmount('')).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount('abc')).toBe(0);
  });
});

describe('parseCommittee', () => {
  const line = 'C00771246|JOHNSON LEADERSHIP FUND|T|ADDR||CITY|LA|71101|J|N|UNK|M|C|NONE|';

  it('지정 코드와 유형을 읽는다', () => {
    expect(parseCommittee(line)).toMatchObject({
      id: 'C00771246', name: 'JOHNSON LEADERSHIP FUND', designation: 'J', type: 'N',
    });
  });

  it('열이 모자라면 버린다', () => {
    expect(parseCommittee('C1|NAME')).toBeNull();
  });
});

describe('parseCandidateSummary', () => {
  // FEC weball 은 30열이다. 수입·개인기부·위원회기부 위치를 잘못 잡으면
  // 숫자가 그럴듯하게 틀린다.
  const cols = Array.from({ length: 30 }, (_, i) => String(i));
  const line = () => {
    const c = [...cols];
    c[0] = 'S1'; c[1] = 'CRUZ, TED'; c[5] = '1000'; c[17] = '700'; c[25] = '60'; c[26] = '10';
    c[27] = '06/30/2026';
    return c.join('|');
  };

  it('금액을 올바른 열에서 읽는다', () => {
    expect(parseCandidateSummary(line())).toMatchObject({
      candidateId: 'S1', receipts: 1000, individual: 700, committee: 60, party: 10,
    });
  });

  it('열이 모자라면 버린다', () => {
    expect(parseCandidateSummary('S1|X')).toBeNull();
  });
});

describe('parsePas2', () => {
  const c = Array.from({ length: 22 }, () => '');
  const line = (tp: string, amt: string, cand: string) => {
    const r = [...c];
    r[0] = 'C1'; r[5] = tp; r[14] = amt; r[16] = cand;
    return r.join('|');
  };

  it('거래 유형과 금액과 후보를 읽는다', () => {
    expect(parsePas2(line('24K', '5000', 'H1'))).toEqual({
      committeeId: 'C1', transactionType: '24K', amount: 5000, candidateId: 'H1',
    });
  });

  it('후보 id 가 없으면 버린다 — 후보와 무관한 거래다', () => {
    expect(parsePas2(line('24K', '5000', ''))).toBeNull();
  });
});

describe('classifyDonor', () => {
  it('이익집단 PAC 을 가려낸다', () => {
    expect(classifyDonor(cmte({ type: 'Q' }))).toBe('interest');
    expect(classifyDonor(cmte({ type: 'N' }))).toBe('interest');
  });

  it('정당 위원회는 따로 센다', () => {
    expect(classifyDonor(cmte({ type: 'Y' }))).toBe('party');
  });

  // Mike Johnson 의 1위 "후원자" 가 본인 공동모금위원회($100만)였다.
  // PAC 한도가 주기당 $10,000 이므로 애초에 기부일 수 없다.
  it('공동모금은 유형과 무관하게 joint 다 — 본인 돈이 도로 들어온 것이다', () => {
    expect(classifyDonor(cmte({ designation: 'J', type: 'Q' }))).toBe('joint');
    expect(classifyDonor(cmte({ designation: 'J', type: 'N' }))).toBe('joint');
  });

  it('모르는 위원회는 other', () => {
    expect(classifyDonor(undefined)).toBe('other');
    expect(classifyDonor(cmte({ type: 'ZZ' }))).toBe('other');
  });
});

describe('aggregate', () => {
  const base = {
    toPolaris: new Map([['H1', 'cruz'], ['S1', 'cruz'], ['H2', 'warren']]),
    committees: new Map([
      ['C1', cmte({ id: 'C1', name: 'ACME PAC' })],
      ['C2', cmte({ id: 'C2', name: 'PARTY CMTE', type: 'Y' })],
      ['C3', cmte({ id: 'C3', name: 'OWN JFC', designation: 'J', type: 'N' })],
      ['C4', cmte({ id: 'C4', name: 'SUPER PAC', type: 'O' })],
    ]),
    summaries: [],
    rows: [],
    topN: 3,
  };

  it('여러 후보 id 를 한 사람으로 합친다', () => {
    const r = aggregate({
      ...base,
      summaries: [
        { candidateId: 'H1', name: '', receipts: 100, individual: 60, committee: 0, party: 0, through: '' },
        { candidateId: 'S1', name: '', receipts: 300, individual: 200, committee: 0, party: 0, through: '' },
      ],
    });
    expect(r.cruz).toMatchObject({ receipts: 400, individual: 260 });
  });

  it('이익집단 기부만 pacDirect 에 넣는다', () => {
    const r = aggregate({
      ...base,
      rows: [row({ amount: 5000 }), row({ committeeId: 'C2', amount: 1000 })],
    });
    expect(r.cruz).toMatchObject({ pacDirect: 5000, partyDirect: 1000 });
  });

  // 합치면 공격에 쓴 돈이 후원으로 그려진다
  it('독립지출은 기부에 합치지 않고 지지·반대를 나눈다', () => {
    const r = aggregate({
      ...base,
      rows: [
        row({ transactionType: '24E', amount: 700 }),
        row({ transactionType: '24A', amount: 900 }),
        row({ transactionType: '24K', amount: 100 }),
      ],
    });
    expect(r.cruz).toMatchObject({ ieSupport: 700, ieOppose: 900, pacDirect: 100 });
  });

  it('공동모금에서 온 돈은 세지 않는다', () => {
    const r = aggregate({ ...base, rows: [row({ committeeId: 'C3', amount: 1_000_000 })] });
    expect(r.cruz.pacDirect).toBe(0);
    expect(r.cruz.topFunders).toHaveLength(0);
  });

  it('모르는 유형의 위원회는 세지 않는다', () => {
    const r = aggregate({ ...base, rows: [row({ committeeId: 'C4', amount: 5000 })] });
    expect(r.cruz.pacDirect).toBe(0);
  });

  it('우리 인물이 아닌 후보는 무시한다', () => {
    const r = aggregate({ ...base, rows: [row({ candidateId: 'ZZZ' })] });
    expect(Object.keys(r)).toHaveLength(0);
  });

  it('같은 위원회의 여러 건을 합쳐 상위 N 개만 남긴다', () => {
    const many = new Map(base.committees);
    for (let i = 5; i < 10; i++) many.set(`C${i}`, cmte({ id: `C${i}`, name: `PAC ${i}` }));
    const r = aggregate({
      ...base,
      committees: many,
      rows: [
        row({ amount: 1000 }), row({ amount: 1000 }),
        ...[5, 6, 7, 8, 9].map((i) => row({ committeeId: `C${i}`, amount: i * 100 })),
      ],
    });
    expect(r.cruz.topFunders).toHaveLength(3);
    expect(r.cruz.topFunders[0]).toMatchObject({ name: 'ACME PAC', amount: 2000 });
    expect(r.cruz.topFunders.map((f) => f.amount)).toEqual([2000, 900, 800]);
  });

  // FEC 는 반환된 기부를 음수로 적는다. 순액이 0 이하면 후원자가 아니다.
  it('환불로 상쇄된 위원회는 후원자 목록에서 뺀다', () => {
    const r = aggregate({
      ...base,
      rows: [row({ amount: 5000 }), row({ amount: -5000 })],
    });
    expect(r.cruz.pacDirect).toBe(0);
    expect(r.cruz.topFunders).toHaveLength(0);
  });

  it('환불이 더 크면 순액이 음수가 되고 목록에서도 빠진다', () => {
    const r = aggregate({ ...base, rows: [row({ amount: 1000 }), row({ amount: -3000 })] });
    expect(r.cruz.pacDirect).toBe(-2000);
    expect(r.cruz.topFunders).toHaveLength(0);
  });

  it('연계 조직이 NONE 이면 비워 둔다', () => {
    const c = new Map(base.committees);
    c.set('C1', cmte({ id: 'C1', connectedOrg: 'NONE' }));
    const r = aggregate({ ...base, committees: c, rows: [row()] });
    expect(r.cruz.topFunders[0].org).toBe('');
  });
});

describe('buildStats', () => {
  it('이름 있는 기부자로 설명되는 비중을 낸다', () => {
    const s = buildStats({
      cruz: { receipts: 1000, individual: 700, pacDirect: 60, partyDirect: 10, ieSupport: 5, ieOppose: 9, topFunders: [] },
    });
    expect(s).toMatchObject({ people: 1, receipts: 1000, pacDirect: 60, namedSharePct: 6 });
  });

  it('수입이 0 이면 비중은 0 이다 — 0 으로 나누지 않는다', () => {
    const s = buildStats({
      x: { receipts: 0, individual: 0, pacDirect: 0, partyDirect: 0, ieSupport: 0, ieOppose: 0, topFunders: [] },
    });
    expect(s.namedSharePct).toBe(0);
  });
});
