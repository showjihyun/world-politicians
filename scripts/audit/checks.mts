/**
 * 데이터 감사 규칙 — 순수 함수.
 *
 * 여기 있는 검사는 전부 실제로 데이터에 들어왔던 문제들이다. 지금까지는 문제가
 * 생길 때마다 임시 스크립트를 짜서 확인하고 지웠고, 그래서 같은 종류가 다시
 * 들어와도 알 수 없었다.
 *
 * fs 를 건드리지 않는 이유: 감사 규칙 자체가 틀리면 감사가 무의미하다.
 * 규칙은 최소 입력으로 검증할 수 있어야 한다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

export type Level = 'fail' | 'warn' | 'info';

export interface Finding {
  level: Level;
  check: string;
  message: string;
  /** 문제가 된 샘플 — 전부가 아니라 고칠 실마리만 */
  samples?: string[];
}

export interface SourceRef {
  title: string;
  url: string;
  source: string;
  date: string;
}

export interface SignalRef {
  id: string;
  date: string;
  source: string;
  url: string;
  title: string;
  people: string[];
  pair?: [string, string];
}

/**
 * 두 인물 id 를 순서 무관 키로. 스크립트 쪽 정본은 sources/keys-core.mts 인데
 * 이 파일은 순수성 때문에 값 import 가 금지돼 있어 자기 것을 쓴다.
 * 둘이 같은 값을 내는지는 keys-core.test.mts 의 계약 테스트가 고정한다.
 */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const cap = <T>(xs: T[], n = 4) => xs.slice(0, n);

/** 허용 목록 밖 매체가 섞였는가 — 'AP' 부분일치로 9건이 들어온 적이 있다 */
export function checkAllowlist(
  items: { source: string; url: string }[],
  isAllowed: (url: string, name: string) => boolean,
  label: string
): Finding[] {
  const bad = items.filter((s) => !isAllowed(s.url ?? '', s.source ?? ''));
  if (!bad.length) return [];
  return [
    {
      level: 'fail',
      check: `${label}.allowlist`,
      message: `허용 목록 밖 매체 ${bad.length}건`,
      samples: cap([...new Set(bad.map((s) => s.source))]),
    },
  ];
}

/** 날짜가 말이 되는가 */
export function checkDates(
  items: { date: string }[],
  label: string,
  now: Date,
  floor?: string
): Finding[] {
  const out: Finding[] = [];
  const today = now.toISOString().slice(0, 10);

  const malformed = items.filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.date ?? ''));
  if (malformed.length) {
    out.push({
      level: 'fail',
      check: `${label}.date.format`,
      message: `날짜 형식이 깨진 항목 ${malformed.length}건`,
      samples: cap(malformed.map((s) => String(s.date))),
    });
  }

  const future = items.filter((s) => s.date > today);
  if (future.length) {
    out.push({
      level: 'fail',
      check: `${label}.date.future`,
      message: `미래 날짜 ${future.length}건`,
      samples: cap(future.map((s) => s.date)),
    });
  }

  if (floor) {
    const tooOld = items.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.date < floor);
    if (tooOld.length) {
      out.push({
        level: 'fail',
        check: `${label}.date.floor`,
        message: `수집 하한(${floor}) 이전 항목 ${tooOld.length}건`,
        samples: cap(tooOld.map((s) => s.date)),
      });
    }
  }
  return out;
}

/**
 * 수집 시각이 데이터보다 뒤에 있는가.
 * 재처리가 generatedAt 을 갱신해 배지가 27.7시간 어긋난 적이 있다.
 */
export function checkFreshness(
  generatedAt: string | null,
  lastDate: string | null,
  now: Date,
  staleHours = 48
): Finding[] {
  if (!generatedAt) {
    return [{ level: 'fail', check: 'meta.generatedAt', message: '수집 시각이 없다' }];
  }
  const gen = new Date(generatedAt).getTime();
  if (Number.isNaN(gen)) {
    return [{ level: 'fail', check: 'meta.generatedAt', message: `파싱 불가: ${generatedAt}` }];
  }
  const out: Finding[] = [];

  if (gen > now.getTime() + 60_000) {
    out.push({
      level: 'fail',
      check: 'meta.generatedAt.future',
      message: `수집 시각이 미래다: ${generatedAt}`,
    });
  }
  if (lastDate) {
    // 수집 시각은 가장 최신 기사보다 앞설 수 없다
    const last = new Date(`${lastDate}T00:00:00Z`).getTime();
    if (gen < last) {
      out.push({
        level: 'fail',
        check: 'meta.generatedAt.beforeData',
        message: `수집 시각(${generatedAt})이 최신 기사(${lastDate})보다 이르다`,
      });
    }
  }
  const ageH = (now.getTime() - gen) / 3_600_000;
  if (ageH > staleHours) {
    out.push({
      level: 'warn',
      check: 'meta.stale',
      message: `마지막 수집이 ${ageH.toFixed(1)}시간 전 — 야간 작업을 확인할 것`,
    });
  }
  return out;
}

/** 매니페스트가 실제 파티션과 일치하는가 — 분할 이후 새로 생긴 어긋남 지점 */
export function checkManifest(
  manifest: { stats: { total: number }; months: string[]; counts: Record<string, number> },
  actual: { months: string[]; total: number; counts: Record<string, number> }
): Finding[] {
  const out: Finding[] = [];

  if (manifest.stats.total !== actual.total) {
    out.push({
      level: 'fail',
      check: 'manifest.total',
      message: `매니페스트 ${manifest.stats.total} vs 실제 ${actual.total}`,
    });
  }
  const mm = [...manifest.months].sort().join(',');
  const am = [...actual.months].sort().join(',');
  if (mm !== am) {
    out.push({
      level: 'fail',
      check: 'manifest.months',
      message: `월 목록 불일치 — 매니페스트 [${mm}] vs 파일 [${am}]`,
    });
  }
  const mismatched = Object.keys(actual.counts).filter(
    (p) => (manifest.counts[p] ?? 0) !== actual.counts[p]
  );
  if (mismatched.length) {
    out.push({
      level: 'fail',
      check: 'manifest.counts',
      message: `인물별 건수 불일치 ${mismatched.length}명 — 화면의 "N건" 이 틀리게 된다`,
      samples: cap(mismatched),
    });
  }
  return out;
}

/** 참조 무결성 — 신호가 가리키는 인물이 데이터셋에 있는가 */
export function checkReferences(signals: SignalRef[], knownIds: Set<string>): Finding[] {
  const unknown = new Set<string>();
  for (const s of signals) {
    for (const p of s.people ?? []) if (!knownIds.has(p)) unknown.add(p);
    for (const p of s.pair ?? []) if (!knownIds.has(p)) unknown.add(p);
  }
  if (!unknown.size) return [];
  return [
    {
      level: 'fail',
      check: 'signals.references',
      message: `데이터셋에 없는 인물 id ${unknown.size}종`,
      samples: cap([...unknown]),
    },
  ];
}

/** 표기 품질 — 제목에 매체명이 중복되거나 HTML 엔티티가 남았는가 */
export function checkPresentation(items: SourceRef[]): Finding[] {
  const out: Finding[] = [];

  const entity = items.filter((s) => /&(amp|quot|lt|gt|#\d+);/.test(s.title));
  if (entity.length) {
    out.push({
      level: 'fail',
      check: 'sources.entities',
      message: `제목에 디코딩되지 않은 HTML 엔티티 ${entity.length}건`,
      samples: cap(entity.map((s) => s.title.slice(0, 50))),
    });
  }

  // 제목 끝이 자기 매체명이면 화면에 두 번 나온다
  const dup = items.filter((s) => {
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    const i = s.title.toLowerCase().lastIndexOf(' - ');
    if (i < 0) return false;
    return norm(s.title.slice(i + 3)) === norm(s.source);
  });
  if (dup.length) {
    out.push({
      level: 'warn',
      check: 'sources.titleSuffix',
      message: `제목 끝에 매체명이 중복된 항목 ${dup.length}건`,
      samples: cap(dup.map((s) => s.title.slice(-46))),
    });
  }

  const empty = items.filter((s) => !s.title?.trim() || !s.url?.trim());
  if (empty.length) {
    out.push({
      level: 'fail',
      check: 'sources.empty',
      message: `제목 또는 URL 이 빈 항목 ${empty.length}건`,
    });
  }
  return out;
}

/**
 * 근거 링크가 확인 가능한 형태인가.
 * Google News 리다이렉트는 목적지도 매체도 확인할 수 없어 근거로 쓸 수 없다.
 */
export function checkVerifiable(items: SourceRef[]): Finding[] {
  const opaque = items.filter((s) => s.url.includes('news.google.com'));
  if (!opaque.length) return [];
  return [
    {
      level: 'fail',
      check: 'sources.opaqueUrl',
      message: `목적지를 확인할 수 없는 리다이렉트 URL ${opaque.length}건 — 근거로 쓸 수 없다`,
      samples: cap(opaque.map((s) => s.source)),
    },
  ];
}

/** 엣지 내부 중복 — 같은 기사가 한 관계에 두 번 붙는가 */
export function checkDuplicates(byEdge: Record<string, SourceRef[]>): Finding[] {
  const dupUrl: string[] = [];
  const dupTitle: string[] = [];
  for (const [key, list] of Object.entries(byEdge)) {
    if (new Set(list.map((s) => s.url)).size !== list.length) dupUrl.push(key);
    const t = list.map((s) => s.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
    if (new Set(t).size !== t.length) dupTitle.push(key);
  }
  const out: Finding[] = [];
  if (dupUrl.length) {
    out.push({
      level: 'fail',
      check: 'sources.dupUrl',
      message: `같은 URL 이 한 엣지에 중복 ${dupUrl.length}건`,
      samples: cap(dupUrl),
    });
  }
  if (dupTitle.length) {
    out.push({
      level: 'warn',
      check: 'sources.dupTitle',
      message: `같은 제목이 한 엣지에 중복 ${dupTitle.length}건 (모바일·지역판)`,
      samples: cap(dupTitle),
    });
  }
  return out;
}

/**
 * 문서에 적힌 수치가 실제 데이터와 맞는가.
 * README 숫자는 손으로 갱신해 왔고, 그래서 조용히 낡는다.
 */
export function checkDocClaims(
  docs: { file: string; text: string }[],
  claims: { pattern: RegExp; actual: number; label: string }[]
): Finding[] {
  const out: Finding[] = [];
  for (const { pattern, actual, label } of claims) {
    for (const doc of docs) {
      const m = doc.text.match(pattern);
      if (!m) continue;
      const stated = Number(m[1].replace(/,/g, ''));
      if (stated !== actual) {
        out.push({
          level: 'warn',
          check: 'docs.claims',
          message: `${doc.file} 의 ${label}: 문서 ${stated} vs 실제 ${actual}`,
        });
      }
    }
  }
  return out;
}

export interface CrosswalkFile {
  stats: { members: number; polarisMatched: number; polarisTotal: number };
  polaris: Record<string, { bioguide: string | null; method: string | null }>;
  members: { bioguide: string; icpsr: number | null; fec: string[] }[];
}

/**
 * 크로스워크 정합성.
 *
 * 이 파일의 존재 이유는 수치가 흔들리지 않게 하는 것이다. 그런데 인물이
 * 추가·개명·삭제되면 파일과 데이터셋이 조용히 어긋난다 — 그러면 흔들리지
 * 않는 대신 **일관되게 틀린** 값이 된다. 더 나쁘다.
 */
export function checkCrosswalk(cw: CrosswalkFile, knownIds: Set<string>): Finding[] {
  const out: Finding[] = [];

  const missing = [...knownIds].filter((id) => !(id in cw.polaris));
  if (missing.length) {
    out.push({
      level: 'fail',
      check: 'crosswalk.missing',
      message: `크로스워크에 없는 인물 ${missing.length}명 — 인물을 추가하고 크로스워크를 다시 만들지 않았다`,
      samples: cap(missing),
    });
  }

  const stale = Object.keys(cw.polaris).filter((id) => !knownIds.has(id));
  if (stale.length) {
    out.push({
      level: 'fail',
      check: 'crosswalk.stale',
      message: `데이터셋에 없는 id ${stale.length}종이 크로스워크에 남아 있다`,
      samples: cap(stale),
    });
  }

  const byBioguide = new Set(cw.members.map((m) => m.bioguide));
  const dangling = Object.entries(cw.polaris)
    .filter(([, v]) => v.bioguide && !byBioguide.has(v.bioguide))
    .map(([id, v]) => `${id} → ${v.bioguide}`);
  if (dangling.length) {
    out.push({
      level: 'fail',
      check: 'crosswalk.dangling',
      message: `명부에 없는 bioguide 를 가리킨다 ${dangling.length}건`,
      samples: cap(dangling),
    });
  }

  if (byBioguide.size !== cw.members.length) {
    out.push({
      level: 'fail',
      check: 'crosswalk.duplicate',
      message: `명부에 중복된 bioguide 가 있다 (${cw.members.length}행 / 고유 ${byBioguide.size})`,
    });
  }

  // 수치가 배열과 어긋나면 그 수치를 인용한 문서도 같이 틀린다
  const matched = Object.values(cw.polaris).filter((v) => v.bioguide).length;
  const total = Object.keys(cw.polaris).length;
  const mismatched = [
    cw.stats.members !== cw.members.length ? `members ${cw.stats.members} vs 실제 ${cw.members.length}` : '',
    cw.stats.polarisMatched !== matched ? `polarisMatched ${cw.stats.polarisMatched} vs 실제 ${matched}` : '',
    cw.stats.polarisTotal !== total ? `polarisTotal ${cw.stats.polarisTotal} vs 실제 ${total}` : '',
  ].filter(Boolean);
  if (mismatched.length) {
    out.push({
      level: 'fail',
      check: 'crosswalk.stats',
      message: '요약 수치가 실제 배열과 다르다',
      samples: mismatched,
    });
  }

  // icpsr 은 Voteview 로 채운다. 비면 채우기가 깨진 것이고, 표결 감사가 조용히 빠진다
  const noIcpsr = cw.members.filter((m) => m.icpsr === null);
  if (noIcpsr.length) {
    out.push({
      level: 'warn',
      check: 'crosswalk.icpsr',
      message: `icpsr 이 빈 의원 ${noIcpsr.length}명 — Voteview 보충이 닿지 않았다`,
      samples: cap(noIcpsr.map((m) => m.bioguide)),
    });
  }

  return out;
}

export interface CosponsorFile {
  congress: number;
  threshold: number;
  stats: { edges: number; fresh: number; crossParty: number };
  edges: {
    a: string; b: string; bills: number; strength: number;
    crossParty: boolean; duplicate: boolean;
    sponsoredByA: number; sponsoredByB: number; initiator: 'a' | 'b' | null;
  }[];
}

/**
 * 공동발의 엣지 정합성.
 *
 * 이 엣지들은 측정값이라 사람이 눈으로 확인하지 않는다. 그래서 생성이 어긋나도
 * 화면에는 그럴듯하게 나온다 — 기준선 아래가 섞이거나, 이미 큐레이션된 쌍이
 * 중복으로 그려지거나, 사라진 인물을 가리키는 식이다. 전부 조용히 틀린다.
 */
export function checkCosponsor(
  cos: CosponsorFile,
  knownIds: Set<string>,
  curatedPairs: Set<string>,
  sourcesByPair: Record<string, SourceRef[]>
): Finding[] {
  const out: Finding[] = [];
  const key = pairKey;

  const unknown = cos.edges
    .flatMap((e) => [e.a, e.b])
    .filter((id) => !knownIds.has(id));
  if (unknown.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.references',
      message: `데이터셋에 없는 인물 id ${new Set(unknown).size}종`,
      samples: cap([...new Set(unknown)]),
    });
  }

  const below = cos.edges.filter((e) => e.bills < cos.threshold);
  if (below.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.threshold',
      message: `기준 ${cos.threshold}건 아래가 ${below.length}건 섞였다`,
      samples: cap(below.map((e) => `${e.a}×${e.b} ${e.bills}건`)),
    });
  }

  const self = cos.edges.filter((e) => e.a === e.b);
  if (self.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.self',
      message: `자기 자신과의 엣지 ${self.length}건`,
      samples: cap(self.map((e) => e.a)),
    });
  }

  const seen = new Set<string>();
  const dup = cos.edges.filter((e) => {
    const k = key(e.a, e.b);
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  });
  if (dup.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.duplicatePair',
      message: `같은 쌍이 두 번 들어있다 ${dup.length}건`,
      samples: cap(dup.map((e) => `${e.a}×${e.b}`)),
    });
  }

  // duplicate 표시가 틀리면 큐레이션 엣지와 공동발의 엣지가 겹쳐 그려진다
  const mislabeled = cos.edges.filter((e) => e.duplicate !== curatedPairs.has(key(e.a, e.b)));
  if (mislabeled.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.duplicateFlag',
      message: `큐레이션 여부 표시가 실제와 다르다 ${mislabeled.length}건 — 선이 겹쳐 그려진다`,
      samples: cap(mislabeled.map((e) => `${e.a}×${e.b} (duplicate=${e.duplicate})`)),
    });
  }

  // 큐레이션된 쌍에는 근거를 두지 않는다 — 법안 날짜가 기사보다 새로워서 근거
  // 패널에서 기사를 밀어냈다. 그래서 화면에 실제로 그려지는 엣지만 근거를 요구한다.
  const drawn = cos.edges.filter((e) => !e.duplicate);
  const noSource = drawn.filter((e) => !(sourcesByPair[key(e.a, e.b)] ?? []).length);
  if (noSource.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.sources',
      message: `근거 법안이 없는 엣지 ${noSource.length}건`,
      samples: cap(noSource.map((e) => `${e.a}×${e.b}`)),
    });
  }

  const leaked = cos.edges.filter((e) => e.duplicate && (sourcesByPair[key(e.a, e.b)] ?? []).length);
  if (leaked.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.curatedLeak',
      message: `큐레이션된 쌍에 법안 근거가 들어갔다 ${leaked.length}건 — 근거 패널에서 기사를 밀어낸다`,
      samples: cap(leaked.map((e) => `${e.a}×${e.b}`)),
    });
  }

  // 방향 건수의 합이 총 건수와 다르면 어딘가에서 세다 흘렸다는 뜻이다
  const badSplit = cos.edges.filter((e) => e.sponsoredByA + e.sponsoredByB !== e.bills);
  if (badSplit.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.split',
      message: `방향별 건수의 합이 총 건수와 다르다 ${badSplit.length}건`,
      samples: cap(badSplit.map((e) => `${e.a}×${e.b} ${e.sponsoredByA}+${e.sponsoredByB}≠${e.bills}`)),
    });
  }

  // a·b 를 id 순으로 뒤집을 때 방향 집계를 같이 뒤집지 않으면 화살표가 정확히
  // 반대를 가리킨다. 눈으로는 그럴듯해 보여서 알아채기 어렵다.
  const lean = (x: number, y: number): 'a' | 'b' | null => {
    const t = x + y;
    if (!t) return null;
    if (x / t >= 0.65) return 'b';
    if (y / t >= 0.65) return 'a';
    return null;
  };
  const wrongDir = cos.edges.filter((e) => e.initiator !== lean(e.sponsoredByA, e.sponsoredByB));
  if (wrongDir.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.direction',
      message: `방향이 건수와 맞지 않는 엣지 ${wrongDir.length}건 — 화살표가 반대로 그려진다`,
      samples: cap(wrongDir.map((e) => `${e.a}×${e.b} ${e.sponsoredByA}/${e.sponsoredByB}→${e.initiator}`)),
    });
  }

  // 강도 규칙은 생성 쪽에 하나만 둔다. 여기서는 파일이 그 규칙과 맞는지만 본다.
  const wrongStrength = cos.edges.filter(
    (e) => e.strength !== (e.bills >= 40 ? 3 : e.bills >= 20 ? 2 : 1)
  );
  if (wrongStrength.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.strength',
      message: `건수와 강도가 맞지 않는 엣지 ${wrongStrength.length}건`,
      samples: cap(wrongStrength.map((e) => `${e.a}×${e.b} ${e.bills}건→${e.strength}`)),
    });
  }

  // 근거가 congress.gov 가 아니면 눌러서 확인할 수 없다 — 근거 패널의 전제가 깨진다
  const offSite = Object.values(sourcesByPair)
    .flat()
    .filter((s) => !/^https:\/\/www\.congress\.gov\/bill\//.test(s.url));
  if (offSite.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.sourceHost',
      message: `congress.gov 법안이 아닌 근거 ${offSite.length}건`,
      samples: cap(offSite.map((s) => s.url)),
    });
  }

  const fresh = cos.edges.filter((e) => !e.duplicate).length;
  const cross = cos.edges.filter((e) => e.crossParty).length;
  const bad = [
    cos.stats.edges !== cos.edges.length ? `edges ${cos.stats.edges} vs 실제 ${cos.edges.length}` : '',
    cos.stats.fresh !== fresh ? `fresh ${cos.stats.fresh} vs 실제 ${fresh}` : '',
    cos.stats.crossParty !== cross ? `crossParty ${cos.stats.crossParty} vs 실제 ${cross}` : '',
  ].filter(Boolean);
  if (bad.length) {
    out.push({
      level: 'fail',
      check: 'cosponsor.stats',
      message: '요약 수치가 실제 배열과 다르다',
      samples: bad,
    });
  }

  return out;
}

export interface FundingFile {
  cycle: number;
  stats: { people: number; receipts: number; pacDirect: number; namedSharePct: number };
  people: Record<
    string,
    {
      receipts: number; individual: number; pacDirect: number; partyDirect: number;
      ieSupport: number; ieOppose: number;
      topFunders: { name: string; amount: number; kind: string }[];
    }
  >;
}

/**
 * 자금 데이터 정합성.
 *
 * 이 데이터는 눈으로 검산할 수 없다. 그래서 틀려도 화면에는 그럴듯한 금액이
 * 나온다. 특히 위험한 것은 독립지출이 기부에 섞이는 것이다 — 실측에서 후보를
 * **반대**하는 지출($18.1M)이 지지($14.4M)보다 컸다. 섞이면 공격이 후원으로 보인다.
 */
export function checkFunding(f: FundingFile, knownIds: Set<string>): Finding[] {
  const out: Finding[] = [];
  const entries = Object.entries(f.people);

  const unknown = entries.map(([id]) => id).filter((id) => !knownIds.has(id));
  if (unknown.length) {
    out.push({
      level: 'fail',
      check: 'funding.references',
      message: `데이터셋에 없는 인물 id ${unknown.length}종`,
      samples: cap(unknown),
    });
  }

  // 총 수입은 음수일 수 없다. 여기가 음수면 열을 잘못 잡은 것이다.
  const badReceipts = entries.filter(([, p]) => p.receipts < 0);
  if (badReceipts.length) {
    out.push({
      level: 'fail',
      check: 'funding.negative',
      message: `총 수입이 음수인 인물 ${badReceipts.length}명 — 파싱이 열을 잘못 잡았다`,
      samples: cap(badReceipts.map(([id]) => id)),
    });
  }

  // 반면 PAC 순액이 음수인 것은 정상이다. FEC 는 반환된 기부를 음수로 적고,
  // 은퇴·사임한 인물은 받은 돈을 돌려준다(McConnell·McCarthy·Rubio 등).
  // 오류가 아니라 사실이므로 알려만 준다.
  const refunded = entries.filter(([, p]) => p.pacDirect < 0);
  if (refunded.length) {
    out.push({
      level: 'info',
      check: 'funding.refunded',
      message: `PAC 순액이 음수인 인물 ${refunded.length}명 — 받은 돈을 돌려준 경우다`,
      samples: cap(refunded.map(([id, p]) => `${id} ${Math.round(p.pacDirect)}`)),
    });
  }

  // 개인 + PAC + 정당이 총 수입을 넘으면 같은 돈을 두 번 셌다는 뜻이다
  const overCount = entries.filter(
    ([, p]) => p.receipts > 0 && p.individual + p.pacDirect + p.partyDirect > p.receipts * 1.02
  );
  if (overCount.length) {
    out.push({
      level: 'fail',
      check: 'funding.overcount',
      message: `구성 합계가 총 수입을 넘는다 ${overCount.length}명 — 같은 돈을 두 번 셌다`,
      samples: cap(overCount.map(([id, p]) => `${id} ${p.individual + p.pacDirect + p.partyDirect} > ${p.receipts}`)),
    });
  }

  // 후원자 목록 자체의 규칙. "합계가 총액을 넘지 않는다" 로 검사하려 했는데
  // 환불(음수) 때문에 성립하지 않는 전제였다 — 순액이 음수인 위원회가 있으면
  // 양수 상위 몇 개의 합이 전체 순액보다 클 수 있다.
  const badFunders = entries.filter(
    ([, p]) =>
      p.topFunders.some((x) => x.amount <= 0) ||
      p.topFunders.some((x, i) => i > 0 && x.amount > p.topFunders[i - 1].amount)
  );
  if (badFunders.length) {
    out.push({
      level: 'fail',
      check: 'funding.funderOrder',
      message: `후원자 목록이 0 이하를 담거나 내림차순이 아니다 ${badFunders.length}명`,
      samples: cap(badFunders.map(([id]) => id)),
    });
  }

  // PAC 한도는 주기당 $10,000 이다. 크게 넘으면 공동모금·이체가 기부로 들어온 것이다.
  // 다만 개인 기부를 묶어 전달하는 도관 PAC 은 정상적으로 넘을 수 있어 경고로 둔다.
  const LIMIT = 50_000;
  const huge = entries.flatMap(([id, p]) =>
    p.topFunders.filter((x) => x.amount > LIMIT).map((x) => `${id} ← ${x.name} ${Math.round(x.amount)}`)
  );
  if (huge.length) {
    out.push({
      level: 'warn',
      check: 'funding.limit',
      message: `PAC 한도를 크게 넘는 기부 ${huge.length}건 — 도관 PAC 인지 이체인지 확인이 필요하다`,
      samples: cap(huge),
    });
  }

  const badKind = entries.flatMap(([id, p]) =>
    p.topFunders.filter((x) => x.kind !== 'interest').map((x) => `${id} ← ${x.name} (${x.kind})`)
  );
  if (badKind.length) {
    out.push({
      level: 'fail',
      check: 'funding.kind',
      message: `상위 후원자에 이익집단 PAC 이 아닌 것이 섞였다 ${badKind.length}건`,
      samples: cap(badKind),
    });
  }

  const receipts = entries.reduce((n, [, p]) => n + p.receipts, 0);
  const pac = entries.reduce((n, [, p]) => n + p.pacDirect, 0);
  const share = receipts > 0 ? Math.round((pac / receipts) * 1000) / 10 : 0;
  const bad = [
    f.stats.people !== entries.length ? `people ${f.stats.people} vs 실제 ${entries.length}` : '',
    Math.abs(f.stats.receipts - receipts) > 1 ? `receipts ${f.stats.receipts} vs 실제 ${receipts}` : '',
    Math.abs(f.stats.namedSharePct - share) > 0.1 ? `namedSharePct ${f.stats.namedSharePct} vs 실제 ${share}` : '',
  ].filter(Boolean);
  if (bad.length) {
    out.push({
      level: 'fail',
      check: 'funding.stats',
      message: '요약 수치가 실제와 다르다',
      samples: bad,
    });
  }

  return out;
}

export interface LobbyingFile {
  years: number[];
  stats: { matched: number; people: number };
  people: Record<
    string,
    {
      alumniCount: number;
      alumni: { name: string; role: string; firm: string; client: string; year: number }[];
      topFirms: { name: string; count: number }[];
      topClients: { name: string; count: number }[];
    }
  >;
}

/**
 * 로비 회전문 정합성.
 *
 * 이 레이어의 위험은 수치가 아니라 **의미**다. 매칭이 헐거워지면 "Sen. Harris" 가
 * 아무 Harris 에게나 붙는다(역대 33명). 그래서 여기서는 이름이 성 하나로 붙지
 * 않았는지, 역할 문구가 실제로 그 사람을 가리키는지를 본다.
 */
export function checkLobbying(f: LobbyingFile, knownIds: Set<string>): Finding[] {
  const out: Finding[] = [];
  const entries = Object.entries(f.people);

  const unknown = entries.map(([id]) => id).filter((id) => !knownIds.has(id));
  if (unknown.length) {
    out.push({
      level: 'fail',
      check: 'lobbying.references',
      message: `데이터셋에 없는 인물 id ${unknown.length}종`,
      samples: cap(unknown),
    });
  }

  // 역할 문구에 호칭+이름이 남아 있어야 한다. 없으면 매칭 근거를 보여줄 수 없다.
  const noEvidence = entries.flatMap(([id, p]) =>
    p.alumni
      .filter((a) => !/\b(Rep|Sen|Representative|Senator|Congress(man|woman))s?\.?\s+[A-Z]/.test(a.role))
      .map((a) => `${id} ← ${a.name}: ${a.role.slice(0, 40)}`)
  );
  if (noEvidence.length) {
    out.push({
      level: 'fail',
      check: 'lobbying.evidence',
      message: `역할 문구에 호칭+이름이 없는 항목 ${noEvidence.length}건 — 왜 이 사람에게 붙었는지 보여줄 수 없다`,
      samples: cap(noEvidence),
    });
  }

  const emptyish = entries.filter(
    ([, p]) => p.alumniCount < 1 || p.alumni.some((a) => !a.name || !a.firm || !a.client)
  );
  if (emptyish.length) {
    out.push({
      level: 'fail',
      check: 'lobbying.incomplete',
      message: `이름·회사·고객이 빈 항목이 있다 ${emptyish.length}명`,
      samples: cap(emptyish.map(([id]) => id)),
    });
  }

  // 보여주는 목록은 총계보다 클 수 없다
  const overflow = entries.filter(([, p]) => p.alumni.length > p.alumniCount);
  if (overflow.length) {
    out.push({
      level: 'fail',
      check: 'lobbying.overflow',
      message: `목록이 총계보다 많다 ${overflow.length}명`,
      samples: cap(overflow.map(([id, p]) => `${id} ${p.alumni.length}>${p.alumniCount}`)),
    });
  }

  const badYear = entries.flatMap(([id, p]) =>
    p.alumni.filter((a) => !f.years.includes(a.year)).map((a) => `${id} ${a.year}`)
  );
  if (badYear.length) {
    out.push({
      level: 'fail',
      check: 'lobbying.year',
      message: `수집 범위 밖의 연도 ${badYear.length}건`,
      samples: cap(badYear),
    });
  }

  // XML 엔티티가 남으면 화면에 'Becker &amp; Poliakoff' 로 나간다
  const entity = entries.flatMap(([id, p]) =>
    [...p.alumni.map((a) => a.firm), ...p.topClients.map((c) => c.name)]
      .filter((s) => /&(amp|quot|lt|gt|apos|#\d+);/.test(s))
      .map((s) => `${id}: ${s.slice(0, 40)}`)
  );
  if (entity.length) {
    out.push({
      level: 'fail',
      check: 'lobbying.entities',
      message: `XML 엔티티가 남아 있다 ${entity.length}건`,
      samples: cap(entity),
    });
  }

  const matched = entries.reduce((n, [, p]) => n + p.alumniCount, 0);
  const bad = [
    f.stats.people !== entries.length ? `people ${f.stats.people} vs 실제 ${entries.length}` : '',
    f.stats.matched !== matched ? `matched ${f.stats.matched} vs 실제 ${matched}` : '',
  ].filter(Boolean);
  if (bad.length) {
    out.push({ level: 'fail', check: 'lobbying.stats', message: '요약 수치가 실제와 다르다', samples: bad });
  }

  return out;
}

export interface AccuracyFile {
  baseline: { polarity: number | null; pair: number | null };
  rows: {
    id: string;
    model: { polarity: string | null; classified: boolean };
    truth: { polarity: string | null; pairCorrect: boolean | null; by?: string };
  }[];
}

/**
 * 정확도 라벨 세트.
 *
 * 이 저장소에는 LLM 판정의 정확도를 재는 장치가 없었다. 없으면 프롬프트를 고치고
 * "좋아졌다" 고 믿게 된다 — 이 저장소에서 "확인했다" 가 거짓이었던 사례가 반복됐다.
 *
 * 절대 점수로 실패시키지 않는다. 처음에는 기준선을 모르고, 낮다고 해서 그날
 * 배포를 막을 일도 아니다.
 *
 * **여기서는 fail 을 내지 않는다.** `audit:data` 는 야간 워크플로에서 커밋 **앞에**
 * 서 있어서, 여기서 실패하면 그날 수집분이 커밋되지 못하고 통째로 날아간다.
 * 라벨 파일의 오타나 모델 품질 하락은 수집 데이터의 결함이 아니다.
 * 기준선 하락으로 실패시키는 것은 `npm run eval` 의 몫이다 — 그쪽은 아무것도
 * 막지 않는 전용 명령이다.
 */
export function checkAccuracy(f: AccuracyFile | null, tolerance = 3): Finding[] {
  if (!f) {
    return [
      {
        level: 'info',
        check: 'accuracy.absent',
        message: '정확도 라벨 세트가 없다 — npm run eval:sample 로 표본을 만든다',
      },
    ];
  }

  // 사람이 적었는데 읽히지 않는 값은 채점에서 빠져 조용히 사라진다.
  // 'conflict' 같은 오타를 오답으로 세면 기준선이 낮게 박혀 진짜 하락을 못 잡는다.
  const readPol = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim().toLowerCase();
    return t === 'ally' || t === 'feud' || t === 'neutral' ? t : null;
  };
  const bad = f.rows.flatMap((r) => {
    const out: string[] = [];
    if (r.truth.polarity != null && readPol(r.truth.polarity) === null) {
      out.push(`${r.id} polarity=${JSON.stringify(r.truth.polarity)}`);
    }
    if (r.truth.pairCorrect != null && typeof r.truth.pairCorrect !== 'boolean') {
      out.push(`${r.id} pairCorrect=${JSON.stringify(r.truth.pairCorrect)}`);
    }
    return out;
  });
  if (bad.length) {
    return [
      {
        level: 'warn',
        check: 'accuracy.invalid',
        message: `읽을 수 없는 라벨 ${bad.length}건 — polarity 는 ally|feud|neutral, pairCorrect 는 true|false`,
        samples: cap(bad),
      },
    ];
  }

  const polRows = f.rows.filter((r) => readPol(r.truth.polarity) !== null && r.model.classified);
  const pairRows = f.rows.filter((r) => typeof r.truth.pairCorrect === 'boolean');
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  const polAcc = pct(polRows.filter((r) => r.model.polarity === readPol(r.truth.polarity)).length, polRows.length);
  const pairAcc = pct(pairRows.filter((r) => r.truth.pairCorrect === true).length, pairRows.length);

  if (!polRows.length && !pairRows.length) {
    return [
      {
        level: 'info',
        check: 'accuracy.pending',
        message: `라벨 ${f.rows.length}행이 비어 있다 — truth 를 채우면 점수가 나온다`,
      },
    ];
  }

  const out: Finding[] = [];
  const b = f.baseline;

  if (b.polarity !== null && polRows.length && polAcc < b.polarity - tolerance) {
    out.push({
      level: 'warn',
      check: 'accuracy.polarity',
      message: `극성 정확도 ${polAcc}% — 기준선 ${b.polarity}% 에서 떨어졌다 (허용 -${tolerance})`,
    });
  }
  if (b.pair !== null && pairRows.length && pairAcc < b.pair - tolerance) {
    out.push({
      level: 'warn',
      check: 'accuracy.pair',
      message: `관계쌍 정확도 ${pairAcc}% — 기준선 ${b.pair}% 에서 떨어졌다 (허용 -${tolerance})`,
    });
  }

  // 기준선을 안 적어 두면 하락을 영영 못 잡는다. 다만 모델이 1차로 채운 행으로
  // 기준선을 잡으면 이후 하락 감지가 통째로 모델의 자기 평가 위에 선다 —
  // labels.mts 의 baselineReady 와 같은 기준(사람 라벨 40행)을 쓴다.
  const humanPol = polRows.filter((r) => r.truth.by !== 'model').length;
  if (b.polarity === null && humanPol >= 40) {
    out.push({
      level: 'warn',
      check: 'accuracy.baseline',
      message: `사람 라벨 ${humanPol}행이 쌓였는데 기준선이 비어 있다 — 지금 ${polAcc}% 를 labels.json 의 baseline 에 적는다`,
    });
  }

  if (!out.length) {
    out.push({
      level: 'info',
      check: 'accuracy.ok',
      message: `극성 ${polAcc}% (${polRows.length}행) · 관계쌍 ${pairAcc}% (${pairRows.length}행)`,
    });
  }
  return out;
}

/**
 * 같은 기사가 두 번 쌓였는가.
 *
 * 신호 id 는 `hash(url + title)` 이라 매체가 헤드라인을 고치면 같은 기사가 다른
 * id 로 들어온다(`Video ` 접두사가 붙는 경우도 있었다). id 로만 거르면 통과한다.
 * 화면에는 같은 기사가 두 줄로 나가고, 그중 하나는 극성이 없을 수도 있다.
 */
/**
 * core.mts 의 storyTitleKey 사본.
 *
 * 이 파일은 값 import 가 금지돼(boundary 규칙) 복제 말고는 방법이 없다.
 * pairKey 가 앱·스크립트·감사 세 벌인 것과 같은 사정이고, 같은 방식으로
 * 계약 테스트가 두 구현이 같은 값을 내는지 고정한다 — 그래서 export 한다.
 */
export function storyTitleKeyMirror(title: string): string {
  return title
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+[-\u2013|]\s+[^-\u2013|]{2,28}$/, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function checkSignalDuplicates(
  signals: { id: string; url: string; pair?: string[]; title?: string }[]
): Finding[] {
  const seen = new Map<string, string>();
  const dups: string[] = [];
  for (const s of signals) {
    // 키는 core.mts 의 dedupeByStory 와 같아야 한다 — 다르면 감사와 파이프라인이
    // 다른 것을 같다고 본다. 값 import 가 금지돼 사본을 두고, 둘이 같은 값을 내는지는
    // core.test.mts 의 계약 테스트가 고정한다.
    // url 에 공백이 있어도 충돌하지 않게 구분자는 제어문자를 쓴다.
    const pair = [...(s.pair ?? [])].sort().join('|');
    const title = storyTitleKeyMirror(s.title ?? '');
    const keys = [`${s.url}\u0000${pair}`];
    if (title) keys.push(`t\u0000${title}\u0000${pair}`);
    const hit = keys.find((k) => seen.has(k));
    if (hit) dups.push(`${seen.get(hit)} ≡ ${s.id}`);
    else for (const k of keys) seen.set(k, s.id);
  }
  if (!dups.length) return [];
  return [
    {
      level: 'fail',
      check: 'signals.duplicate',
      message: `같은 기사가 두 번 쌓였다 ${dups.length}건 — 제목이 바뀌거나 다른 피드로 들어오면 id 가 달라진다`,
      samples: cap(dups),
    },
  ];
}

/**
 * 분류가 얼마나 실패했는가.
 *
 * 2026-08-12~17 엿새치 29건이 분류 실패로 갇혀 있었는데 감사에도 로그에도
 * 화면에도 흔적이 없었다. 파이프라인이 새 기사만 분류해서 다시 보지 않았기
 * 때문이다. 비율이 튀면 그날 알 수 있어야 한다.
 *
 * 실패로 막지는 않는다 — LLM 이 잠깐 죽는 것은 데이터 오류가 아니고, 그날
 * 배포를 세울 일도 아니다. 재시도가 다음 실행에서 걷어낸다.
 */
export function checkUnclassified(
  signals: { classified?: boolean; date: string }[],
  threshold = 5
): Finding[] {
  if (!signals.length) return [];
  const un = signals.filter((s) => !s.classified);
  const pct = Math.round((un.length / signals.length) * 1000) / 10;
  if (pct < threshold) return [];

  const byDate = new Map<string, number>();
  for (const s of un) byDate.set(s.date, (byDate.get(s.date) ?? 0) + 1);
  const worst = [...byDate].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return [
    {
      level: 'warn',
      check: 'signals.unclassified',
      message: `분류되지 않은 신호 ${un.length}건 (${pct}%) — 임계 ${threshold}%`,
      samples: worst.map(([d, n]) => `${d} ${n}건`),
    },
  ];
}

/** 종료 코드 결정 — fail 이 하나라도 있으면 실패다 */
export function verdict(findings: Finding[]): { ok: boolean; fail: number; warn: number } {
  const fail = findings.filter((f) => f.level === 'fail').length;
  const warn = findings.filter((f) => f.level === 'warn').length;
  return { ok: fail === 0, fail, warn };
}

export interface UnityFile {
  congress: number;
  minVotes: number;
  axisMax: number;
  stats: {
    rollCalls: number;
    partyVotes: number;
    people: number;
    skipped: { notInCongress: number; noVotes: number; thinRecord: number };
  };
  medians: Record<string, number>;
  people: Record<
    string,
    { rate: number; votes: number; against: number; side: 'D' | 'R'; chamber: string }
  >;
  excluded: Record<string, string>;
}

/**
 * 당론 이탈률.
 *
 * 이 값은 눈으로 검산할 수 없다 — 화면에는 어떤 숫자든 그럴듯한 퍼센트로 나온다.
 * 가장 위험한 실패는 틀린 값이 아니라 **빈 값**이다. Voteview 가 열 이름을 바꾸면
 * 모든 행이 조용히 걸러져 people 이 {} 가 되고, 스크립트는 0 으로 끝나고,
 * 화면에서는 섹션이 그냥 사라진다. 그래서 비어 있는 것부터 잡는다.
 */
/**
 * 최소 표결 수의 바닥. 파일이 들고 온 minVotes 로만 재면 그 값이 3 으로
 * 낮아졌을 때 검사가 같이 낮아져 아무 말도 하지 않는다 — 지키려는 기준을
 * 지켜지는지 재는 쪽이 들고 있어야 한다.
 */
const UNITY_MIN_VOTES_FLOOR = 30;

export function checkPartyUnity(u: UnityFile, knownIds: Set<string>): Finding[] {
  const out: Finding[] = [];
  const entries = Object.entries(u.people);

  // 비어 있으면 아래 검사가 전부 빈 배열을 훑고 통과한다 — 여기서 먼저 막는다.
  if (!entries.length || !u.stats.partyVotes || !Object.keys(u.medians).length) {
    out.push({
      level: 'fail',
      check: 'unity.empty',
      message: `데이터가 비었다 — 인물 ${entries.length} · 정당표결 ${u.stats.partyVotes} · 중앙값 ${Object.keys(u.medians).length}`,
    });
    return out;
  }

  // 축이 없거나 0 이면 화면의 모든 막대가 가득 찬다 — unity.axis 가 잡으려던
  // 바로 그 상태인데, 축 자체가 없으면 그 비교가 false 라 통과해 버린다.
  if (!Number.isFinite(u.axisMax) || u.axisMax <= 0) {
    out.push({
      level: 'fail',
      check: 'unity.axis',
      message: `막대 축이 없거나 0 이다 (${u.axisMax}) — 모든 막대가 가득 찬다`,
    });
  }

  if (!Number.isFinite(u.minVotes) || u.minVotes < UNITY_MIN_VOTES_FLOOR) {
    out.push({
      level: 'fail',
      check: 'unity.threshold',
      message: `최소 표결 수가 ${u.minVotes} 로 기준(${UNITY_MIN_VOTES_FLOOR})보다 낮다 — 3건 중 1건이 33% 로 올라온다`,
    });
  }

  // 값이 없는 사람은 왜 없는지가 있어야 한다. 없으면 화면이 아무 이유나 고른다.
  const known = [...knownIds];
  const unexplained = known.filter((id) => !u.people[id] && !u.excluded[id]);
  if (unexplained.length) {
    out.push({
      level: 'warn',
      check: 'unity.unexplained',
      message: `값도 제외 사유도 없는 인물 ${unexplained.length}명`,
      samples: cap(unexplained),
    });
  }

  // 요약 수치가 실제와 어긋나면 둘 중 하나는 낡은 것이다.
  const skipped = u.stats.skipped;
  const bad = [
    u.stats.people !== entries.length ? `people ${u.stats.people} vs 실제 ${entries.length}` : "",
    u.stats.partyVotes > u.stats.rollCalls
      ? `partyVotes ${u.stats.partyVotes} > rollCalls ${u.stats.rollCalls}`
      : "",
    !skipped || [skipped.notInCongress, skipped.noVotes, skipped.thinRecord].some((n) => typeof n !== "number")
      ? "skipped 가 세 갈래로 나뉘어 있지 않다"
      : "",
  ].filter(Boolean);
  if (bad.length) {
    out.push({
      level: 'fail',
      check: 'unity.stats',
      message: '요약 수치가 실제와 다르다',
      samples: cap(bad),
    });
  }

  const unknown = entries.map(([id]) => id).filter((id) => !knownIds.has(id));
  if (unknown.length) {
    out.push({
      level: 'fail',
      check: 'unity.references',
      message: `데이터셋에 없는 인물 id ${unknown.length}종`,
      samples: cap(unknown),
    });
  }

  // 비율은 0~100 이고 against/votes 와 맞아야 한다. 어긋나면 반올림이 아니라
  // 분자·분모를 다른 곳에서 가져온 것이다. votes 가 0 이면 나눗셈이 NaN 이 되고
  // NaN > 0.06 은 false 라 그냥 통과한다 — 0 을 먼저 막는다.
  const badMath = entries.filter(([, p]) => {
    if (!Number.isFinite(p.rate) || p.rate < 0 || p.rate > 100) return true;
    if (!Number.isFinite(p.votes) || p.votes <= 0) return true;
    if (!Number.isFinite(p.against) || p.against < 0 || p.against > p.votes) return true;
    return Math.abs((p.against / p.votes) * 100 - p.rate) > 0.06;
  });
  if (badMath.length) {
    out.push({
      level: 'fail',
      check: 'unity.arithmetic',
      message: `비율이 against/votes 와 맞지 않는 인물 ${badMath.length}명`,
      samples: cap(badMath.map(([id, p]) => `${id} ${p.rate}% vs ${p.against}/${p.votes}`)),
    });
  }

  // 분모가 얇으면 3건 중 1건이 33% 가 되어 화면 최상위로 올라온다.
  const floor = Math.max(UNITY_MIN_VOTES_FLOOR, u.minVotes);
  const thin = entries.filter(([, p]) => p.votes < floor);
  if (thin.length) {
    out.push({
      level: 'fail',
      check: 'unity.thin',
      message: `정당 표결이 ${u.minVotes}건 미만인데 값이 있는 인물 ${thin.length}명`,
      samples: cap(thin.map(([id, p]) => `${id} ${p.votes}건`)),
    });
  }

  // 화면은 같은 당·같은 원의 중앙값을 곁들여 보여준다. 없으면 비율만 홀로 남아
  // 높은지 낮은지 알 수 없게 된다.
  const noMedian = entries.filter(([, p]) => u.medians[`${p.chamber}|${p.side}`] == null);
  if (noMedian.length) {
    out.push({
      level: 'fail',
      check: 'unity.median',
      message: `비교할 중앙값이 없는 인물 ${noMedian.length}명`,
      samples: cap(noMedian.map(([id, p]) => `${id} ${p.chamber}|${p.side}`)),
    });
  }

  // 막대 축이 데이터보다 작으면 상위 몇 명이 똑같이 가득 찬 막대가 되어 구분이 사라진다.
  const over = entries.filter(([, p]) => p.rate > u.axisMax);
  if (over.length) {
    out.push({
      level: 'fail',
      check: 'unity.axis',
      message: `막대 축(${u.axisMax}%)을 넘는 인물 ${over.length}명 — 막대가 구분되지 않는다`,
      samples: cap(over.map(([id, p]) => `${id} ${p.rate}%`)),
    });
  }

  // 분모를 잘못 잡으면(만장일치 표결까지 넣으면) 이탈이 희석돼 모두가 0% 가 된다.
  // 통과하는데 뜻이 없어지는 종류라 수치로 잡는다.
  const moved = entries.filter(([, p]) => p.rate > 0).length;
  if (moved / entries.length < 0.3) {
    out.push({
      level: 'warn',
      check: 'unity.flat',
      message: `이탈이 0 이 아닌 인물이 ${moved}/${entries.length} 뿐 — 분모가 너무 넓지 않은지 본다`,
    });
  }

  return out;
}
