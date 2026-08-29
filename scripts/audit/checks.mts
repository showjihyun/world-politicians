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

/** 종료 코드 결정 — fail 이 하나라도 있으면 실패다 */
export function verdict(findings: Finding[]): { ok: boolean; fail: number; warn: number } {
  const fail = findings.filter((f) => f.level === 'fail').length;
  const warn = findings.filter((f) => f.level === 'warn').length;
  return { ok: fail === 0, fail, warn };
}
