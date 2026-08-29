/**
 * 로비 등록서(LD-1) 판정 규칙 — 순수 함수.
 *
 * 무엇을 말할 수 있는가부터.
 *
 * `<coveredPosition>` 은 로비스트가 **과거에 어떤 정부 직위에 있었는지** 적는 칸이다.
 * "Legislative Director, Rep. Marsha Blackburn" 같은 문자열이 들어온다. 이건 고용
 * 이력이지 로비 대상이 아니다. 같은 등록서의 `clientName` 은 기업이다(Palantir,
 * Bristol-Myers Squibb). 그러므로 이 데이터로 쓸 수 있는 문장은
 *
 *   "Blackburn 의 전직 보좌진 N명이 지금 로비 업계에 있다"
 *
 * 까지이고, **"이 로비스트들이 Blackburn 을 로비한다" 가 아니다.** 후자로 읽히게
 * 두면 데이터가 받쳐주지 않는 주장을 하게 된다.
 *
 * 이름 매칭은 `Rep./Sen. + 이름 전체` 만 인정한다. 성만으로 훑으면 절반이 거짓이다 —
 * 역대 의원 중 Harris 가 33명, Graham 이 14명이다. 전체 이름으로 좁히면 역대
 * 12,768명 기준으로도 동명이인이 0건이었다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

export interface Lobbyist {
  name: string;
  /** 신고서에 적힌 과거 정부 직위 원문 */
  coveredPosition: string;
}

export interface Registration {
  /** 로비 회사(또는 개인 등록자) */
  registrant: string;
  client: string;
  clientDescription: string;
  lobbyists: Lobbyist[];
}

/**
 * XML 엔티티를 되돌린다.
 *
 * 신고서에 `Becker &amp; Poliakoff` 로 들어온다. 안 풀면 화면에 그대로 나간다 —
 * 뉴스 제목에서 같은 문제가 나서 감사에 검사를 넣어 둔 적이 있다.
 */
export function decodeEntities(s: string): string {
  return (
    s
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      // &amp; 를 마지막에 풀어야 &amp;lt; 가 < 로 두 번 풀리지 않는다
      .replace(/&amp;/g, '&')
  );
}

const one = (xml: string, tag: string): string => {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1].replace(/\s+/g, ' ')).trim() : '';
};

/**
 * 등록서 하나를 읽는다.
 *
 * `<lobbyists>` 블록 **안에서만** 로비스트를 찾는다. 문서 전체를 훑으면
 * 제휴 조직(affiliatedOrg)과 외국 실체(foreignEntity)의 이름이 섞여 들어온다.
 */
export function parseRegistration(xml: string): Registration | null {
  const client = one(xml, 'clientName');
  if (!client) return null;

  const org = one(xml, 'organizationName');
  const person = [one(xml, 'firstName'), one(xml, 'lastName')].filter(Boolean).join(' ');

  const block = xml.match(/<lobbyists>([\s\S]*?)<\/lobbyists>/);
  const lobbyists: Lobbyist[] = [];
  if (block) {
    for (const m of block[1].matchAll(/<lobbyist>([\s\S]*?)<\/lobbyist>/g)) {
      const name = [one(m[1], 'lobbyistFirstName'), one(m[1], 'lobbyistLastName')]
        .filter(Boolean)
        .join(' ');
      const coveredPosition = one(m[1], 'coveredPosition');
      if (name) lobbyists.push({ name, coveredPosition });
    }
  }

  return {
    registrant: org || person,
    client,
    clientDescription: one(xml, 'clientGeneralDescription'),
    lobbyists,
  };
}

/**
 * 직위 문구에서 의원 이름을 뽑는다.
 *
 * 호칭 뒤에 **두 단어 이상**이 와야 인정한다. "Sen. Harris" 같은 성 단독은 버린다 —
 * 역대에 같은 성이 33명이라 어느 Harris 인지 알 수 없다. 버리는 대신 틀리게
 * 붙이면 조용히 잘못된 그래프가 된다.
 */
const TITLE =
  /\b(?:Rep|Sen|Reps|Sens|Representative|Senator|Congressman|Congresswoman)s?\.?\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-zA-Z'\-]+){1,2})/g;

export function extractOfficials(coveredPosition: string): string[] {
  const out: string[] = [];
  for (const m of coveredPosition.matchAll(TITLE)) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    if (name.split(' ').length >= 2) out.push(name);
  }
  return [...new Set(out)];
}

/** 비교용 정규화 — 접미사와 문장부호를 떨어낸다 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/-/g, '')
    .split(/\s+/)
    .filter((t) => t && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(t))
    .join(' ');
}

/** 인물 이름 → id 색인. 전체 이름과 '이름+성' 두 형태를 담는다 */
export function buildPeopleIndex(people: { id: string; name: string }[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const p of people) {
    const parts = normalizeName(p.name).split(' ').filter(Boolean);
    if (!parts.length) continue;
    idx.set(parts.join(' '), p.id);
    if (parts.length >= 2) idx.set(`${parts[0]} ${parts[parts.length - 1]}`, p.id);
  }
  return idx;
}

export function matchOfficial(name: string, idx: Map<string, string>): string | null {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  return idx.get(parts.join(' ')) ?? idx.get(`${parts[0]} ${parts[parts.length - 1]}`) ?? null;
}

export interface Alumnus {
  /** 전직 보좌진(현 로비스트) 이름 */
  name: string;
  /** 그 인물 밑에서 맡았던 직위 — 신고서 원문에서 잘라낸 부분 */
  role: string;
  firm: string;
  client: string;
  year: number;
}

export interface PersonLobbying {
  /** 이 인물 밑에서 일했던 등록 로비스트 수 (중복 제거) */
  alumniCount: number;
  alumni: Alumnus[];
  topFirms: { name: string; count: number }[];
  topClients: { name: string; count: number }[];
}

/**
 * 직위 원문에서 해당 의원이 언급된 조각만 잘라낸다.
 *
 * 두 가지를 지켜야 한다.
 *
 * 하나, **호칭이 붙은 언급을 고른다.** 한 이력에 같은 사람이 두 번 나올 수 있는데
 * ("Special Representative ... Secretary of State Hillary Clinton" 과
 * "Aide, Sen. Hillary Clinton") 호칭 없는 쪽을 고르면 왜 이 사람에게 붙었는지
 * 보여줄 수 없다. 매칭은 호칭이 있는 곳에서만 일어나기 때문이다.
 *
 * 둘, **자를 때 이름을 잘라내지 않는다.** 앞에서부터 120자로 자르면
 * "…Republican Leader Mitch …" 처럼 근거가 잘려 나간다. 이름 위치를 중심으로
 * 창을 잡는다.
 */
const TITLED = (last: string) =>
  new RegExp(
    `(?:Rep|Sen|Reps|Sens|Representative|Senator|Congressman|Congresswoman)s?\\.?\\s+[^,;\\n]*${last}`,
    'i'
  );

export function roleFor(coveredPosition: string, officialName: string): string {
  const text = coveredPosition.replace(/\s+/g, ' ').trim();
  const parts = normalizeName(officialName).split(' ').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  if (!last) return text.slice(0, 120);

  const segments = coveredPosition.split(/[;\n]/).map((s) => s.replace(/\s+/g, ' ').trim());
  const titled = TITLED(last);

  // 호칭이 붙은 조각을 먼저 찾는다
  const hit = segments.find((s) => titled.test(s)) ?? segments.find((s) => normalizeName(s).includes(last));
  if (hit && hit.length <= 120) return hit;

  const source = hit ?? text;
  const m = source.match(titled) ?? source.match(new RegExp(last, 'i'));
  if (!m || m.index === undefined) return source.slice(0, 120);

  // 이름을 중심으로 창을 잡는다 — 근거가 잘려 나가면 안 된다
  const end = Math.min(source.length, m.index + m[0].length + 20);
  const start = Math.max(0, end - 118);
  return (start > 0 ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '');
}

export interface AggregateInput {
  filings: { year: number; registration: Registration }[];
  index: Map<string, string>;
  maxAlumni: number;
}

export function aggregate(input: AggregateInput): Record<string, PersonLobbying> {
  const { filings, index, maxAlumni } = input;
  const byPerson = new Map<string, Map<string, Alumnus>>();

  for (const { year, registration } of filings) {
    for (const l of registration.lobbyists) {
      if (!l.coveredPosition) continue;
      for (const official of extractOfficials(l.coveredPosition)) {
        const pid = matchOfficial(official, index);
        if (!pid) continue;
        if (!byPerson.has(pid)) byPerson.set(pid, new Map());
        const m = byPerson.get(pid)!;
        // 같은 사람이 해마다 다시 등록한다. 사람 단위로 모으고 최근 신고를 남긴다.
        const key = normalizeName(l.name);
        const prev = m.get(key);
        if (!prev || year > prev.year) {
          m.set(key, {
            name: l.name,
            role: roleFor(l.coveredPosition, official),
            firm: registration.registrant,
            client: registration.client,
            year,
          });
        }
      }
    }
  }

  const out: Record<string, PersonLobbying> = {};
  for (const [pid, m] of byPerson) {
    const alumni = [...m.values()].sort(
      (a, b) => b.year - a.year || a.name.localeCompare(b.name)
    );
    const tally = (pick: (a: Alumnus) => string) => {
      const c = new Map<string, number>();
      for (const a of alumni) {
        const k = pick(a);
        if (k) c.set(k, (c.get(k) ?? 0) + 1);
      }
      return [...c]
        .map(([name, count]) => ({ name, count }))
        .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name))
        .slice(0, 5);
    };
    out[pid] = {
      alumniCount: alumni.length,
      alumni: alumni.slice(0, maxAlumni),
      topFirms: tally((a) => a.firm),
      topClients: tally((a) => a.client),
    };
  }
  return out;
}

export interface LobbyingStats {
  registrations: number;
  lobbyists: number;
  withPosition: number;
  matched: number;
  people: number;
}

export function buildStats(
  filings: { registration: Registration }[],
  people: Record<string, PersonLobbying>
): LobbyingStats {
  let lobbyists = 0;
  let withPosition = 0;
  for (const f of filings) {
    for (const l of f.registration.lobbyists) {
      lobbyists++;
      if (l.coveredPosition) withPosition++;
    }
  }
  return {
    registrations: filings.length,
    lobbyists,
    withPosition,
    matched: Object.values(people).reduce((n, p) => n + p.alumniCount, 0),
    people: Object.keys(people).length,
  };
}
