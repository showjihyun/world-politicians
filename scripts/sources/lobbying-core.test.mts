import { describe, expect, it } from 'vitest';
import {
  aggregate,
  buildPeopleIndex,
  buildStats,
  decodeEntities,
  extractOfficials,
  matchOfficial,
  normalizeName,
  parseRegistration,
  roleFor,
  type Registration,
} from './lobbying-core.mts';

const reg = (lobbyists: { name: string; pos: string }[], over: Partial<Registration> = {}) => `
<LOBBYINGDISCLOSURE1>
  <organizationName>${over.registrant ?? 'ACME Gov Rel'}</organizationName>
  <firstName> </firstName>
  <lastName> </lastName>
  <clientName>${over.client ?? 'Pfizer'}</clientName>
  <clientGeneralDescription>pharma</clientGeneralDescription>
  <affiliatedOrgName>SHOULD NOT APPEAR</affiliatedOrgName>
  <lobbyists>
    ${lobbyists
      .map(
        (l) => `<lobbyist>
      <lobbyistFirstName>${l.name.split(' ')[0]}</lobbyistFirstName>
      <lobbyistLastName>${l.name.split(' ').slice(1).join(' ')}</lobbyistLastName>
      <coveredPosition>${l.pos}</coveredPosition>
    </lobbyist>`
      )
      .join('')}
  </lobbyists>
  <foreignEntity><name>FOREIGN CO</name></foreignEntity>
</LOBBYINGDISCLOSURE1>`;

describe('parseRegistration', () => {
  it('등록자·고객·로비스트를 읽는다', () => {
    const r = parseRegistration(reg([{ name: 'Jane Doe', pos: 'LD, Rep. Marsha Blackburn' }]))!;
    expect(r).toMatchObject({ registrant: 'ACME Gov Rel', client: 'Pfizer' });
    expect(r.lobbyists).toEqual([{ name: 'Jane Doe', coveredPosition: 'LD, Rep. Marsha Blackburn' }]);
  });

  // 문서 전체를 훑으면 제휴 조직과 외국 실체 이름이 로비스트로 섞여 들어온다
  it('lobbyists 블록 밖의 이름을 끌어오지 않는다', () => {
    const r = parseRegistration(reg([{ name: 'Jane Doe', pos: '' }]))!;
    expect(r.lobbyists).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain('SHOULD NOT APPEAR');
  });

  it('개인 등록자는 이름으로 잡는다', () => {
    const xml = reg([]).replace('<organizationName>ACME Gov Rel</organizationName>', '<organizationName> </organizationName>')
      .replace('<firstName> </firstName>', '<firstName>Sam</firstName>')
      .replace('<lastName> </lastName>', '<lastName>Ray</lastName>');
    expect(parseRegistration(xml)!.registrant).toBe('Sam Ray');
  });

  it('고객이 없으면 버린다', () => {
    expect(parseRegistration('<LOBBYINGDISCLOSURE1></LOBBYINGDISCLOSURE1>')).toBeNull();
  });

  it('직위가 빈 로비스트도 담는다 — 세는 데 쓴다', () => {
    const r = parseRegistration(reg([{ name: 'No Pos', pos: ' ' }]))!;
    expect(r.lobbyists[0].coveredPosition).toBe('');
  });
});

describe('decodeEntities', () => {
  // 신고서에 'Becker &amp; Poliakoff' 로 들어온다. 안 풀면 화면에 그대로 나간다.
  it('흔한 엔티티를 되돌린다', () => {
    expect(decodeEntities('Becker &amp; Poliakoff')).toBe('Becker & Poliakoff');
    expect(decodeEntities('&quot;X&quot; &apos;Y&apos;')).toBe(`"X" 'Y'`);
    expect(decodeEntities('&#39;a&#39;')).toBe(`'a'`);
  });

  // &amp; 를 먼저 풀면 &amp;lt; 가 < 로 두 번 풀린다
  it('이중 인코딩을 한 번만 푼다', () => {
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });

  it('엔티티가 없으면 그대로', () => {
    expect(decodeEntities('Plain Name LLC')).toBe('Plain Name LLC');
  });
});

describe('extractOfficials', () => {
  it('호칭 뒤의 전체 이름을 뽑는다', () => {
    expect(extractOfficials('Legislative Director, Rep. Marsha Blackburn')).toEqual(['Marsha Blackburn']);
    expect(extractOfficials('Chief of Staff, Senator Chris Murphy')).toEqual(['Chris Murphy']);
  });

  // 역대 의원 중 Harris 가 33명, Graham 이 14명이다. 어느 쪽인지 알 수 없다.
  it('성만 있으면 버린다', () => {
    expect(extractOfficials('LA, Sen. Harris')).toEqual([]);
    expect(extractOfficials('Aide to Rep. Graham')).toEqual([]);
  });

  it('중간 이니셜을 허용한다', () => {
    expect(extractOfficials('Counsel, Sen. John A. Barrasso')).toEqual(['John A. Barrasso']);
  });

  it('한 문구의 여러 의원을 모두 뽑고 중복은 한 번만', () => {
    const got = extractOfficials('LD, Rep. Ted Cruz; LA, Sen. Chris Murphy; Intern, Rep. Ted Cruz');
    expect(got.sort()).toEqual(['Chris Murphy', 'Ted Cruz']);
  });

  it('호칭이 없으면 뽑지 않는다 — 아무 이름이나 잡으면 안 된다', () => {
    expect(extractOfficials('Chief of Staff, Department of Labor')).toEqual([]);
  });

  it('빈 문구는 빈 배열', () => {
    expect(extractOfficials('')).toEqual([]);
  });
});

describe('normalizeName / matchOfficial', () => {
  const idx = buildPeopleIndex([
    { id: 'blackburn', name: 'Marsha Blackburn' },
    { id: 'murphy-chris', name: 'Chris Murphy' },
    { id: 'ocasio-cortez', name: 'Alexandria Ocasio-Cortez' },
  ]);

  it('하이픈 성을 한 덩어리로 본다', () => {
    expect(normalizeName('Alexandria Ocasio-Cortez')).toBe('alexandria ocasiocortez');
    expect(matchOfficial('Alexandria Ocasio-Cortez', idx)).toBe('ocasio-cortez');
  });

  it('중간 이니셜이 붙어도 이름+성으로 맞춘다', () => {
    expect(matchOfficial('Marsha W. Blackburn', idx)).toBe('blackburn');
  });

  it('모르는 사람은 null', () => {
    expect(matchOfficial('Zoe Lofgren', idx)).toBeNull();
  });

  it('한 단어는 맞추지 않는다', () => {
    expect(matchOfficial('Blackburn', idx)).toBeNull();
  });
});

describe('roleFor', () => {
  // 한 이력에 여러 직위가 이어 붙는다. 통째로 보여주면 무관한 경력까지
  // 그 의원 밑에서 한 일처럼 읽힌다.
  it('해당 의원이 언급된 조각만 잘라낸다', () => {
    const pos = 'Chief of Staff, Small Business Administration; Legislative Director, Rep. Marsha Blackburn';
    expect(roleFor(pos, 'Marsha Blackburn')).toBe('Legislative Director, Rep. Marsha Blackburn');
  });

  it('줄바꿈으로 나뉜 이력도 자른다', () => {
    const pos = 'Chief of Staff, Congressman Raul Grijalva\nChief of Staff, Department of Labor';
    expect(roleFor(pos, 'Raul Grijalva')).toContain('Grijalva');
    expect(roleFor(pos, 'Raul Grijalva')).not.toContain('Department of Labor');
  });

  // 앞에서부터 자르면 '…Republican Leader Mitch …' 처럼 근거가 잘려 나간다
  it('길면 이름을 중심으로 자른다 — 이름을 잘라내지 않는다', () => {
    const pos = 'Deputy Chief of Staff for Policy '.repeat(4) + 'Senate Republican Leader Sen. Mitch McConnell';
    const r = roleFor(pos, 'Mitch McConnell');
    expect(r).toContain('McConnell');
    expect(r.length).toBeLessThanOrEqual(120);
  });

  // 같은 사람이 호칭 없이도 나온다. 호칭 있는 쪽이 매칭 근거다.
  it('호칭이 붙은 조각을 우선한다', () => {
    const pos = 'Special Representative for Global Partnerships, Secretary of State Hillary Clinton; Aide, Sen. Hillary Clinton';
    expect(roleFor(pos, 'Hillary Clinton')).toBe('Aide, Sen. Hillary Clinton');
  });

  it('못 찾으면 원문을 쓰되 길이를 자른다', () => {
    const long = 'x'.repeat(300);
    expect(roleFor(long, 'Nobody Here').length).toBeLessThanOrEqual(120);
  });
});

describe('aggregate', () => {
  const idx = buildPeopleIndex([
    { id: 'blackburn', name: 'Marsha Blackburn' },
    { id: 'murphy-chris', name: 'Chris Murphy' },
  ]);
  const filing = (year: number, lobbyists: { name: string; pos: string }[], over: Partial<Registration> = {}) => ({
    year,
    registration: parseRegistration(reg(lobbyists, over))!,
  });

  it('의원별로 전직 보좌진을 모은다', () => {
    const r = aggregate({
      filings: [filing(2026, [{ name: 'Jane Doe', pos: 'LD, Rep. Marsha Blackburn' }])],
      index: idx,
      maxAlumni: 10,
    });
    expect(r.blackburn.alumniCount).toBe(1);
    expect(r.blackburn.alumni[0]).toMatchObject({ name: 'Jane Doe', firm: 'ACME Gov Rel', client: 'Pfizer', year: 2026 });
  });

  // 같은 사람이 해마다 다시 등록한다. 사람 단위로 모아야 한다.
  it('같은 사람이 여러 해에 나와도 한 번만 세고 최근 것을 남긴다', () => {
    const r = aggregate({
      filings: [
        filing(2023, [{ name: 'Jane Doe', pos: 'LD, Rep. Marsha Blackburn' }], { client: 'Old Co' }),
        filing(2026, [{ name: 'Jane Doe', pos: 'LD, Rep. Marsha Blackburn' }], { client: 'New Co' }),
      ],
      index: idx,
      maxAlumni: 10,
    });
    expect(r.blackburn.alumniCount).toBe(1);
    expect(r.blackburn.alumni[0]).toMatchObject({ client: 'New Co', year: 2026 });
  });

  it('한 로비스트가 두 의원 밑에 있었으면 양쪽에 담는다', () => {
    const r = aggregate({
      filings: [filing(2026, [{ name: 'Jane Doe', pos: 'LD, Rep. Marsha Blackburn; LA, Sen. Chris Murphy' }])],
      index: idx,
      maxAlumni: 10,
    });
    expect(r.blackburn.alumniCount).toBe(1);
    expect(r['murphy-chris'].alumniCount).toBe(1);
  });

  it('우리 인물이 아니면 담지 않는다', () => {
    const r = aggregate({
      filings: [filing(2026, [{ name: 'Jane Doe', pos: 'LD, Rep. Zoe Lofgren' }])],
      index: idx,
      maxAlumni: 10,
    });
    expect(Object.keys(r)).toHaveLength(0);
  });

  it('회사·고객 상위를 센다', () => {
    const r = aggregate({
      filings: [
        filing(2026, [{ name: 'A One', pos: 'LD, Rep. Marsha Blackburn' }], { registrant: 'F1', client: 'C1' }),
        filing(2026, [{ name: 'B Two', pos: 'LD, Rep. Marsha Blackburn' }], { registrant: 'F1', client: 'C2' }),
      ],
      index: idx,
      maxAlumni: 10,
    });
    expect(r.blackburn.topFirms[0]).toEqual({ name: 'F1', count: 2 });
    expect(r.blackburn.topClients.map((c) => c.name).sort()).toEqual(['C1', 'C2']);
  });

  it('목록은 상한만큼만 남기되 총계는 그대로 센다', () => {
    // 이름에 숫자를 쓰면 정규화가 지워서 전부 같은 사람이 된다 — 실제 이름 형태로
    const many = 'abcdefg'.split('').map((c) => ({ name: `${c.toUpperCase()}na Smith${c}`, pos: 'LD, Rep. Marsha Blackburn' }));
    const r = aggregate({ filings: [filing(2026, many)], index: idx, maxAlumni: 3 });
    expect(r.blackburn.alumniCount).toBe(7);
    expect(r.blackburn.alumni).toHaveLength(3);
  });
});

describe('buildStats', () => {
  it('직위가 적힌 로비스트와 매칭된 수를 따로 센다', () => {
    const f = [
      { registration: parseRegistration(reg([{ name: 'A B', pos: 'LD, Rep. Marsha Blackburn' }, { name: 'C D', pos: '' }]))! },
    ];
    const s = buildStats(f, { blackburn: { alumniCount: 1, alumni: [], topFirms: [], topClients: [] } });
    expect(s).toEqual({ registrations: 1, lobbyists: 2, withPosition: 1, matched: 1, people: 1 });
  });
});
