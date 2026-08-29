import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  buildStats,
  buildSurnameIndex,
  fillIcpsr,
  filterParties,
  icpsrByBioguide,
  matchName,
  nearMisses,
  needsDecision,
  nameKeys,
  normalizeName,
  parseCsv,
  parsePoliticians,
  partyCode,
  partyMismatches,
  resolveAll,
  toMember,
  unresolved,
  type Legislator,
  type Member,
} from './crosswalk-core.mts';

const leg = (
  bioguide: string,
  name: Legislator['name'],
  extra: Partial<Legislator['id']> = {},
  term: Partial<Legislator['terms'][0]> = {}
): Legislator => ({
  id: { bioguide, ...extra },
  name,
  terms: [{ type: 'sen', state: 'MA', party: 'Democrat', start: '2019-01-03', end: '2025-01-03', ...term }],
});

describe('normalizeName', () => {
  it('대소문자와 마침표를 무시한다', () => {
    expect(normalizeName('Donald J. Trump')).toBe('donald j trump');
  });

  // 하이픈을 공백으로 바꾸면 "ocasio cortez" 가 되어 성이 두 토큰이 된다
  it('하이픈은 공백이 아니라 제거다', () => {
    expect(normalizeName('Alexandria Ocasio-Cortez')).toBe('alexandria ocasiocortez');
  });

  it('접미사를 떨어낸다', () => {
    expect(normalizeName('Robert F. Kennedy Jr.')).toBe(normalizeName('Robert F. Kennedy'));
    expect(normalizeName('Hal Rogers III')).toBe('hal rogers');
  });

  it('발음 부호를 벗긴다', () => {
    expect(normalizeName('Raúl M. Grijalva')).toBe('raul m grijalva');
  });

  it("어퍼스트로피를 붙여 읽는다", () => {
    expect(normalizeName("Beto O'Rourke")).toBe('beto orourke');
  });

  it('빈 문자열은 빈 결과', () => {
    expect(normalizeName('   ')).toBe('');
  });
});

describe('nameKeys', () => {
  it('방식별로 키를 낸다', () => {
    const k = nameKeys({ first: 'Bernard', last: 'Sanders', nickname: 'Bernie', official_full: 'Bernard Sanders' });
    expect(k.official).toEqual(['bernard sanders']);
    expect(k.firstlast).toEqual(['bernard sanders']);
    expect(k.nickname).toEqual(['bernie sanders']);
  });

  it('없는 필드는 키를 만들지 않는다', () => {
    expect(nameKeys({ last: 'Sanders' }).firstlast).toEqual([]);
  });
});

describe('buildIndex', () => {
  it('bioguide 가 없는 항목은 건너뛴다', () => {
    const idx = buildIndex([{ id: {}, name: { first: 'A', last: 'B' }, terms: [] } as Legislator]);
    expect(idx.firstlast.size).toBe(0);
  });

  // 동명이인을 하나로 뭉개면 조용히 틀린 사람에게 붙는다
  it('같은 이름의 후보를 전부 들고 있는다', () => {
    const idx = buildIndex([
      leg('K000393', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
      leg('K000107', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
    ]);
    expect(idx.official.get('john kennedy')).toEqual(['K000393', 'K000107']);
  });

  it('같은 사람이 두 번 들어와도 한 번만 센다', () => {
    const one = leg('W000817', { first: 'Elizabeth', last: 'Warren' });
    expect(buildIndex([one, one]).firstlast.get('elizabeth warren')).toEqual(['W000817']);
  });
});

describe('matchName', () => {
  const idx = buildIndex([
    leg('W000817', { first: 'Elizabeth', last: 'Warren', official_full: 'Elizabeth Warren' }),
    leg('S000033', { first: 'Bernard', last: 'Sanders', nickname: 'Bernie', official_full: 'Bernard Sanders' }),
    leg('K000393', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
    leg('K000107', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
  ]);

  it('정식 이름으로 맞춘다', () => {
    expect(matchName('Elizabeth Warren', idx)).toMatchObject({ bioguide: 'W000817', method: 'official' });
  });

  it('별칭으로 맞춘다', () => {
    expect(matchName('Bernie Sanders', idx)).toMatchObject({ bioguide: 'S000033', method: 'nickname' });
  });

  // 덜 정확한 방식으로 내려가면 우연히 하나만 남아 맞은 것처럼 보인다 — 가장 위험하다
  it('동명이인이면 멈춘다. 다음 방식으로 내려가지 않는다', () => {
    const m = matchName('John Kennedy', idx);
    expect(m.bioguide).toBeNull();
    expect(m.reason).toBe('ambiguous');
    expect(m.candidates).toEqual(['K000107', 'K000393']);
  });

  it('후보가 없으면 none', () => {
    expect(matchName('Elon Musk', idx)).toMatchObject({ bioguide: null, reason: 'none' });
  });

  it('빈 이름은 none', () => {
    expect(matchName('', idx)).toMatchObject({ bioguide: null, reason: 'none' });
  });
});

describe('resolveAll', () => {
  const idx = buildIndex([
    leg('W000817', { first: 'Elizabeth', last: 'Warren', official_full: 'Elizabeth Warren' }),
    leg('K000393', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
    leg('K000107', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
  ]);
  const people = [
    { id: 'warren', name: 'Elizabeth Warren', party: 'D', branch: 'senate' },
    { id: 'kennedy', name: 'John Kennedy', party: 'R', branch: 'senate' },
    { id: 'musk', name: 'Elon Musk', party: '', branch: 'special' },
  ];

  it('자동으로 되는 것은 자동으로 한다', () => {
    const r = resolveAll(people, idx, {});
    expect(r[0].match.bioguide).toBe('W000817');
    expect(r[0].manual).toBe(false);
  });

  it('확정 목록이 자동 매칭을 덮어쓴다', () => {
    const r = resolveAll(people, idx, {
      kennedy: { bioguide: 'K000393', reason: '현직 루이지애나 상원의원' },
    });
    expect(r[1]).toMatchObject({ manual: true, match: { bioguide: 'K000393', method: 'override' } });
  });

  // 자동이 맞힌 것처럼 보여도 사람이 아니라고 정했으면 사람이 이긴다
  it('자동으로 맞은 것도 사람이 null 로 덮을 수 있다', () => {
    const r = resolveAll(people, idx, { warren: { bioguide: null, reason: '동명이인 오매칭' } });
    expect(r[0]).toMatchObject({ manual: true, match: { bioguide: null } });
  });
});

describe('unresolved — 감사가 막아야 하는 것', () => {
  const idx = buildIndex([
    leg('K000393', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
    leg('K000107', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
  ]);
  const people = [
    { id: 'kennedy', name: 'John Kennedy', party: 'R', branch: 'senate' },
    { id: 'musk', name: 'Elon Musk', party: '', branch: 'special' },
  ];

  it('동명이인은 확정을 요구한다', () => {
    expect(unresolved(resolveAll(people, idx, {})).map((r) => r.id)).toEqual(['kennedy']);
  });

  // "후보가 없다" 는 자동으로도 확정이다 — 의회 경력이 없는 사람이 대부분이다
  it('후보가 아예 없는 것은 요구하지 않는다', () => {
    const r = resolveAll([people[1]], idx, {});
    expect(unresolved(r)).toHaveLength(0);
  });

  it('사람이 정한 것은 더 이상 묻지 않는다', () => {
    const r = resolveAll(people, idx, { kennedy: { bioguide: 'K000393', reason: '확인함' } });
    expect(unresolved(r)).toHaveLength(0);
  });
});

describe('toMember', () => {
  it('마지막 임기로 소속·주·원을 정한다', () => {
    const l: Legislator = {
      id: { bioguide: 'X1', icpsr: 41301, fec: ['S4MA00028'], govtrack: 412542, opensecrets: 'N001' },
      name: { first: 'E', last: 'W', official_full: 'E W' },
      terms: [
        { type: 'rep', state: 'TX', party: 'Republican', start: '2011-01-03', end: '2013-01-03' },
        { type: 'sen', state: 'MA', party: 'Democrat', start: '2019-01-03', end: '2025-01-03' },
      ],
    };
    expect(toMember(l, true)).toMatchObject({
      bioguide: 'X1', icpsr: 41301, fec: ['S4MA00028'],
      party: 'D', state: 'MA', chamber: 'senate', current: true,
    });
  });

  // 정당 문자열만 비교하면 Sanders(I) × Markey(D) 가 초당적이 된다 — 같은 코커스다
  it('무소속은 코커스하는 쪽을 실질 소속으로 잡는다', () => {
    const m = toMember(
      leg('S000033', { first: 'Bernard', last: 'Sanders' }, {}, { party: 'Independent', caucus: 'Democrat' }),
      true
    );
    expect(m).toMatchObject({ party: 'I', caucus: 'D' });
  });

  it('코커스가 없으면 정당을 그대로 쓴다', () => {
    const m = toMember(leg('X9', { first: 'A', last: 'B' }, {}, { party: 'Republican' }), true);
    expect(m).toMatchObject({ party: 'R', caucus: 'R' });
  });

  it('없는 id 는 null 로 채운다 — 빈 문자열로 속이지 않는다', () => {
    const m = toMember(leg('X2', { first: 'A', last: 'B' }), false);
    expect(m).toMatchObject({ icpsr: null, fec: [], govtrack: null, opensecrets: null });
  });

  it('임기가 없으면 만들지 않는다', () => {
    expect(toMember({ id: { bioguide: 'X3' }, name: {}, terms: [] }, true)).toBeNull();
  });
});

describe('partyCode', () => {
  it('긴 이름을 코드로 바꾼다', () => {
    expect(partyCode('Republican')).toBe('R');
    expect(partyCode('Democrat')).toBe('D');
    expect(partyCode('Independent')).toBe('I');
  });

  it('이미 코드면 그대로 둔다', () => {
    expect(partyCode('R')).toBe('R');
  });

  // 형식 차이를 불일치로 세면 전원이 불일치로 나와서 진짜 불일치가 묻힌다
  it('형식만 다른 것은 같은 값이 된다', () => {
    expect(partyCode('Democrat')).toBe(partyCode('D'));
  });

  it('모르는 값은 건드리지 않는다', () => {
    expect(partyCode('Libertarian')).toBe('Libertarian');
    expect(partyCode(undefined)).toBe('');
  });
});

describe('filterParties', () => {
  const ms = [
    { party: 'Republican' }, { party: 'Democrat' }, { party: 'Independent' },
  ] as Member[];

  it('지정한 정당만 남긴다', () => {
    expect(filterParties(ms, ['Republican', 'Democrat'])).toHaveLength(2);
  });

  // 무소속을 기본값으로 숨기면 Sanders 가 조용히 사라진다
  it('무소속을 넣기로 하면 넣는다', () => {
    expect(filterParties(ms, ['Republican', 'Democrat', 'Independent'])).toHaveLength(3);
  });
});

describe('parsePoliticians', () => {
  const src = `
  {
    id: 'trump',
    name: L('Donald J. Trump', '도널드 트럼프'),
    enName: 'Donald J. Trump',
    party: 'R',
    branch: 'executive',
  },
  {
    id: 'warren',
    enName: 'Elizabeth Warren',
    party: 'D',
    branch: 'senate',
  },
`;

  it('id·이름·소속·분류를 읽는다', () => {
    expect(parsePoliticians(src)).toEqual([
      { id: 'trump', name: 'Donald J. Trump', party: 'R', branch: 'executive' },
      { id: 'warren', name: 'Elizabeth Warren', party: 'D', branch: 'senate' },
    ]);
  });

  // 하나의 정규식으로 id 와 enName 을 함께 잡으면 다음 항목의 값을 끌어온다
  it('enName 이 없는 항목이 다음 항목의 이름을 훔치지 않는다', () => {
    const broken = `
  {
    id: 'noname',
    party: 'R',
  },
  {
    id: 'warren',
    enName: 'Elizabeth Warren',
    party: 'D',
  },
`;
    const out = parsePoliticians(broken);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('warren');
  });

  it('빈 소스는 빈 배열', () => {
    expect(parsePoliticians('')).toEqual([]);
  });
});

describe('partyMismatches', () => {
  const people = [
    { id: 'warren', name: 'Elizabeth Warren', party: 'D', branch: 'senate' },
    { id: 'flip', name: 'F Lip', party: 'D', branch: 'senate' },
  ];
  const members = new Map<string, Member>([
    ['W1', { party: 'D' } as Member],
    ['F1', { party: 'R' } as Member],
  ]);
  const res = [
    { id: 'warren', name: 'Elizabeth Warren', manual: false, match: { bioguide: 'W1', method: 'official' as const } },
    { id: 'flip', name: 'F Lip', manual: false, match: { bioguide: 'F1', method: 'official' as const } },
  ];

  it('우리 라벨과 의회 기록이 다른 곳을 찾는다', () => {
    expect(partyMismatches(people, res, members)).toEqual([{ id: 'flip', ours: 'D', theirs: 'R' }]);
  });

  it('매칭되지 않은 사람은 비교하지 않는다', () => {
    const unmatched = [{ id: 'warren', name: 'x', manual: false, match: { bioguide: null, method: null } }];
    expect(partyMismatches(people, unmatched, members)).toHaveLength(0);
  });
});

describe('parseCsv', () => {
  it('머리글을 키로 쓴다', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([{ a: '1', b: '2' }]);
  });

  // Voteview 의 bioname 은 "WARREN, Elizabeth" 라 따옴표 안에 쉼표가 있다.
  // 그냥 자르면 뒤 열이 한 칸씩 밀린다 — 에러가 아니라 조용히 틀린 값이 된다
  it('따옴표 안의 쉼표를 지킨다', () => {
    const rows = parseCsv('icpsr,bioname,party\n41301,"WARREN, Elizabeth",D\n');
    expect(rows[0]).toEqual({ icpsr: '41301', bioname: 'WARREN, Elizabeth', party: 'D' });
  });

  it('이스케이프된 따옴표를 읽는다', () => {
    const cell = parseCsv(['a', '"say ""hi"""'].join('\n') + '\n')[0].a;
    expect(cell).toBe('say "hi"');
  });

  it('CRLF 를 처리한다', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('열 수가 맞지 않는 줄은 버린다', () => {
    expect(parseCsv('a,b\n1,2\n3\n')).toHaveLength(1);
  });

  it('빈 입력은 빈 배열', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('icpsrByBioguide', () => {
  it('bioguide 로 icpsr 를 찾는다', () => {
    const m = icpsrByBioguide([{ bioguide_id: 'W000817', icpsr: '41301', congress: '119' }]);
    expect(m.get('W000817')).toBe(41301);
  });

  // 같은 사람이 여러 의회에 나온다 — 가장 최근 값이어야 한다
  it('가장 최근 의회의 값을 쓴다', () => {
    const m = icpsrByBioguide([
      { bioguide_id: 'X', icpsr: '111', congress: '110' },
      { bioguide_id: 'X', icpsr: '222', congress: '119' },
      { bioguide_id: 'X', icpsr: '333', congress: '115' },
    ]);
    expect(m.get('X')).toBe(222);
  });

  it('bioguide 나 숫자가 없는 줄은 버린다', () => {
    const m = icpsrByBioguide([
      { bioguide_id: '', icpsr: '1', congress: '119' },
      { bioguide_id: 'Y', icpsr: '', congress: '119' },
    ]);
    expect(m.size).toBe(0);
  });
});

describe('fillIcpsr', () => {
  const ms = [
    { bioguide: 'A', icpsr: null },
    { bioguide: 'B', icpsr: 999 },
    { bioguide: 'C', icpsr: null },
  ] as Member[];

  it('빈 값만 채운다', () => {
    const r = fillIcpsr(ms, new Map([['A', 111], ['B', 222]]));
    expect(r.members.map((m) => m.icpsr)).toEqual([111, 999, null]);
    expect(r.filled).toBe(1);
  });

  // 이미 있는 값을 덮으면 어느 소스가 맞는지 알 수 없게 된다
  it('있는 값은 덮지 않는다', () => {
    expect(fillIcpsr(ms, new Map([['B', 1]])).members[1].icpsr).toBe(999);
  });

  it('원본을 바꾸지 않는다', () => {
    fillIcpsr(ms, new Map([['A', 1]]));
    expect(ms[0].icpsr).toBeNull();
  });
});

describe('buildSurnameIndex', () => {
  it('성으로 후보를 모은다', () => {
    const idx = buildSurnameIndex([
      leg('L000599', { first: 'Michael', last: 'Lawler' }),
      leg('L000129', { first: 'Joab', last: 'Lawler' }),
    ]);
    expect(idx.get('lawler')).toEqual(['L000599', 'L000129']);
  });

  it('성이 없으면 담지 않는다', () => {
    expect(buildSurnameIndex([leg('X', { first: 'Only' })]).size).toBe(0);
  });
});

describe('nearMisses — 조용히 새는 곳', () => {
  const legs = [
    leg('L000599', { first: 'Michael', last: 'Lawler', official_full: 'Michael Lawler' }),
    leg('W000817', { first: 'Elizabeth', last: 'Warren', official_full: 'Elizabeth Warren' }),
  ];
  const idx = buildIndex(legs);
  const surnames = buildSurnameIndex(legs);

  // 실제로 이렇게 빠졌다 — 데이터는 Michael, 우리는 Mike, 별칭 필드는 비어 있다
  it('성이 같은 의원이 있는데 못 맞추면 사람에게 올린다', () => {
    const r = resolveAll([{ id: 'lawler', name: 'Mike Lawler', party: 'R', branch: 'house' }], idx, {});
    expect(nearMisses(r, surnames).map((x) => x.id)).toEqual(['lawler']);
  });

  it('맞춘 것은 올리지 않는다', () => {
    const r = resolveAll([{ id: 'warren', name: 'Elizabeth Warren', party: 'D', branch: 'senate' }], idx, {});
    expect(nearMisses(r, surnames)).toHaveLength(0);
  });

  it('성조차 없는 사람은 올리지 않는다 — 의회와 무관한 인물이다', () => {
    const r = resolveAll([{ id: 'musk', name: 'Elon Musk', party: '', branch: 'special' }], idx, {});
    expect(nearMisses(r, surnames)).toHaveLength(0);
  });

  it('사람이 이미 정했으면 다시 묻지 않는다', () => {
    const r = resolveAll(
      [{ id: 'lawler', name: 'Mike Lawler', party: 'R', branch: 'house' }],
      idx,
      { lawler: { bioguide: 'L000599', reason: '통칭 Mike' } }
    );
    expect(nearMisses(r, surnames)).toHaveLength(0);
  });

  // null 로 정한 것도 판단이다 — 다시 올라오면 매번 같은 판단을 반복하게 된다
  it('null 로 정한 것도 다시 묻지 않는다', () => {
    const r = resolveAll(
      [{ id: 'bush', name: 'George W. Bush', party: 'R', branch: 'former' }],
      buildIndex([leg('B001166', { first: 'George', last: 'Bush' })]),
      { bush: { bioguide: null, reason: '연방의회 경력 없음' } }
    );
    expect(nearMisses(r, buildSurnameIndex([leg('B001166', { first: 'George', last: 'Bush' })]))).toHaveLength(0);
  });
});

describe('needsDecision', () => {
  const legs = [
    leg('K000393', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
    leg('K000109', { first: 'John', last: 'Kennedy', official_full: 'John Kennedy' }),
    leg('L000599', { first: 'Michael', last: 'Lawler', official_full: 'Michael Lawler' }),
  ];
  const idx = buildIndex(legs);
  const surnames = buildSurnameIndex(legs);

  it('동명이인과 아깝게 놓친 것을 모두 올린다', () => {
    const r = resolveAll(
      [
        { id: 'kennedy', name: 'John Kennedy', party: 'R', branch: 'senate' },
        { id: 'lawler', name: 'Mike Lawler', party: 'R', branch: 'house' },
        { id: 'musk', name: 'Elon Musk', party: '', branch: 'special' },
      ],
      idx,
      {}
    );
    expect(needsDecision(r, surnames).map((x) => x.id).sort()).toEqual(['kennedy', 'lawler']);
  });

  it('전부 정해졌으면 비어 있다', () => {
    const r = resolveAll(
      [{ id: 'lawler', name: 'Mike Lawler', party: 'R', branch: 'house' }],
      idx,
      { lawler: { bioguide: 'L000599', reason: '확인함' } }
    );
    expect(needsDecision(r, surnames)).toHaveLength(0);
  });
});

describe('buildStats', () => {
  it('정당·원별로 세고 id 보유를 센다', () => {
    const ms = [
      { party: 'R', chamber: 'senate', icpsr: 1, fec: ['a'] },
      { party: 'D', chamber: 'house', icpsr: null, fec: [] },
    ] as Member[];
    const res = [
      { id: 'a', name: 'a', manual: false, match: { bioguide: 'X', method: 'official' as const } },
      { id: 'b', name: 'b', manual: false, match: { bioguide: null, method: null } },
    ];
    expect(buildStats(ms, res)).toEqual({
      members: 2,
      byParty: { R: 1, D: 1 },
      byChamber: { senate: 1, house: 1 },
      withIcpsr: 1,
      withFec: 1,
      polarisMatched: 1,
      polarisTotal: 2,
    });
  });
});
