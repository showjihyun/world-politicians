/**
 * 공동발의 엣지 판정 규칙 — 순수 함수.
 *
 * 왜 표결이 아니라 공동발의인가: 표결은 당론에 끌려간다. Cruz × Hawley 의 표결
 * 일치도 98.6% 는 관계가 아니라 소속이다. 반면 남의 법안에 이름을 올리는 것은
 * 개인의 선택이고, 날짜가 남고, 출처가 congress.gov 로 특정된다.
 *
 * 그래도 원시 건수를 그대로 쓰면 안 된다. 10건 이상 쌍의 84% 가 같은 당이고,
 * 상위권은 "법안을 많이 내는 사람들" 이 차지한다. 그래서 기준선을 두고, 만들어진
 * 엣지는 큐레이션한 관계와 **다른 타입**으로 표시한다. 하나는 편집 판단이고
 * 하나는 측정값이라, 같은 선으로 그리면 그래프가 근거를 잃는다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

export interface Bill {
  congress: number;
  /** S, HR, HRES … */
  type: string;
  number: number;
  title: string;
  introduced: string;
  sponsor: string;
  cosponsors: string[];
}

export interface PairTally {
  bills: number;
  first: string;
  last: string;
  /** 근거로 보여줄 법안 몇 건 */
  samples: Bill[];
}

export interface CosponsorEdge {
  a: string;
  b: string;
  bills: number;
  /** 기존 엣지와 같은 1~3 척도 — 규칙은 strengthOf 하나뿐이다 */
  strength: 1 | 2 | 3;
  /** 코커스가 다른가. 정당 문자열이 아니라 코커스로 본다 */
  crossParty: boolean;
  /** 이미 큐레이션된 관계가 있는 쌍인가 — 그래프에 선을 두 번 긋지 않기 위해 */
  duplicate: boolean;
  first: string;
  last: string;
  samples: { id: string; title: string; date: string; url: string }[];
}

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
};

/**
 * BILLSTATUS XML 한 건을 읽는다.
 *
 * `<cosponsors>` 블록 **안에서만** bioguideId 를 찾는다. 문서 전체에서 찾으면
 * 발의자·위원회·관련 의원까지 섞여 들어와 공동발의가 아닌 것이 엣지가 된다.
 */
export function parseBill(xml: string): Bill | null {
  const sponsorBlock = xml.match(/<sponsors>([\s\S]*?)<\/sponsors>/);
  const sponsor = sponsorBlock?.[1].match(/<bioguideId>([A-Z]\d+)<\/bioguideId>/)?.[1];
  if (!sponsor) return null;

  const congress = Number(tag(xml, 'congress'));
  const number = Number(tag(xml, 'number'));
  const type = tag(xml, 'type');
  const introduced = tag(xml, 'introducedDate');
  if (!Number.isFinite(congress) || !Number.isFinite(number) || !type || !introduced) return null;

  const cosBlock = xml.match(/<cosponsors>([\s\S]*?)<\/cosponsors>/);
  const cosponsors = cosBlock
    ? [...new Set(cosBlock[1].match(/<bioguideId>[A-Z]\d+<\/bioguideId>/g) ?? [])]
        .map((m) => m.replace(/<\/?bioguideId>/g, ''))
        .filter((b) => b !== sponsor)
    : [];

  return {
    congress,
    type,
    number,
    title: xml.match(/<titles>[\s\S]*?<title>([^<]*)/)?.[1].trim() ?? '',
    introduced,
    sponsor,
    cosponsors,
  };
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * 쌍별로 센다.
 *
 * 발의자 ↔ 공동발의자만 센다. 공동발의자끼리는 세지 않는다 — 같은 법안에 이름을
 * 올린 30명을 전부 서로 연결하면 한 법안이 435개 엣지를 만든다. 그건 관계가
 * 아니라 법안의 크기다.
 */
export function tallyPairs(bills: Bill[], sampleLimit = 3): Map<string, PairTally> {
  const out = new Map<string, PairTally>();
  for (const b of bills) {
    for (const c of b.cosponsors) {
      const k = pairKey(b.sponsor, c);
      const cur = out.get(k);
      if (!cur) {
        out.set(k, { bills: 1, first: b.introduced, last: b.introduced, samples: [b] });
        continue;
      }
      cur.bills++;
      if (b.introduced < cur.first) cur.first = b.introduced;
      if (b.introduced > cur.last) cur.last = b.introduced;
      if (cur.samples.length < sampleLimit) cur.samples.push(b);
    }
  }
  return out;
}

/** congress.gov 의 법안 주소 — 목적지가 확인 가능한 링크만 근거로 쓴다 */
export function billUrl(b: Bill): string {
  const slug: Record<string, string> = {
    S: 'senate-bill', HR: 'house-bill',
    SRES: 'senate-resolution', HRES: 'house-resolution',
    SJRES: 'senate-joint-resolution', HJRES: 'house-joint-resolution',
    SCONRES: 'senate-concurrent-resolution', HCONRES: 'house-concurrent-resolution',
  };
  const kind = slug[b.type.toUpperCase()] ?? 'senate-bill';
  return `https://www.congress.gov/bill/${b.congress}th-congress/${kind}/${b.number}`;
}

export interface SelectOptions {
  threshold: number;
  /** bioguide → POLARIS 인물 id */
  toPolaris: Map<string, string>;
  /**
   * POLARIS 인물 id → **코커스** 코드.
   *
   * 정당 문자열로 비교하면 Sanders(I) × Markey(D) 가 초당적이 된다. 두 사람은 같은
   * 코커스이므로 협업이 당을 넘은 것이 아니다. 이 구분을 놓쳐 초당적 쌍을 19개로
   * 세었는데 그중 8개가 Sanders 였다.
   */
  caucusOf: Map<string, string>;
  /** 이미 큐레이션된 쌍 (pairKey 형태, POLARIS id 기준) */
  curated: Set<string>;
}

/**
 * 엣지로 쓸 것을 고른다.
 *
 * 양쪽이 모두 우리 인물이어야 하고, 기준선을 넘어야 한다. 기준선을 두는 이유는
 * 5건으로 내리면 신규 264개가 되어 큐레이션한 266개가 절반으로 묻히기 때문이다.
 */
export function selectEdges(
  tally: Map<string, PairTally>,
  opts: SelectOptions
): CosponsorEdge[] {
  const out: CosponsorEdge[] = [];
  for (const [key, t] of tally) {
    if (t.bills < opts.threshold) continue;
    const [x, y] = key.split('|');
    const a = opts.toPolaris.get(x);
    const b = opts.toPolaris.get(y);
    if (!a || !b) continue;

    const pa = opts.caucusOf.get(a) ?? '';
    const pb = opts.caucusOf.get(b) ?? '';
    out.push({
      a: a < b ? a : b,
      b: a < b ? b : a,
      bills: t.bills,
      strength: strengthOf(t.bills),
      crossParty: Boolean(pa && pb && pa !== pb),
      duplicate: opts.curated.has(pairKey(a, b)),
      first: t.first,
      last: t.last,
      samples: t.samples.map((s) => ({
        id: `${s.type.toLowerCase()}${s.number}`,
        title: s.title,
        date: s.introduced,
        url: billUrl(s),
      })),
    });
  }
  // 많이 함께 낸 순. 같으면 id 순 — 같은 입력이면 같은 파일이 나와야 한다
  return out.sort((p, q) => q.bills - p.bills || `${p.a}|${p.b}`.localeCompare(`${q.a}|${q.b}`));
}

/** 건수를 관계 강도로 — 기존 엣지와 같은 1~3 척도를 쓴다 */
export function strengthOf(bills: number): 1 | 2 | 3 {
  if (bills >= 40) return 3;
  if (bills >= 20) return 2;
  return 1;
}

export interface CosponsorStats {
  billsScanned: number;
  pairsAll: number;
  edges: number;
  fresh: number;
  crossParty: number;
}

export function buildStats(
  billsScanned: number,
  tally: Map<string, PairTally>,
  edges: CosponsorEdge[]
): CosponsorStats {
  return {
    billsScanned,
    pairsAll: tally.size,
    edges: edges.length,
    fresh: edges.filter((e) => !e.duplicate).length,
    crossParty: edges.filter((e) => e.crossParty).length,
  };
}
