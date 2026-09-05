/**
 * 데이터 감사 — 결정적 판정.
 *
 * 지금까지 데이터 품질 확인은 매번 임시 스크립트를 짜고 지우는 식이었다. 그래서
 * 같은 종류의 문제가 다시 들어와도 알 수 없었고, 실제로 여러 번 그랬다.
 * 이 명령은 종료 코드로 답한다 — 사람이든 에이전트든 "확인했다" 를 증명할 수 있어야 한다.
 *
 *   npm run audit:data           빠른 검사 (네트워크 없음, 1초 미만)
 *   npm run audit:data -- --links  근거 링크 생존까지 확인 (느림)
 *
 * fs·network 는 여기서만 다룬다. 판정 규칙은 checks.mts 에 있고 단위 테스트가 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, SOURCE_NAME_ALIASES } from '../news-pipeline/config.mts';
import { isAllowedSource } from '../news-pipeline/fetch.mts';
import { outletMix, wireShare } from '../../src/domain/source-mix.ts';
import {
  checkAccuracy,
  checkAllowlist, checkCosponsor, checkCrosswalk, checkDates, checkFunding, checkLobbying, checkDocClaims, checkDuplicates, checkFreshness,
  checkPartyUnity, type UnityFile,
  checkManifest, checkPresentation, checkReferences, checkVerifiable, verdict,
  type AccuracyFile,
  type CosponsorFile, type CrosswalkFile, type Finding, type FundingFile, type LobbyingFile, type SignalRef, type SourceRef,
  checkSignalDuplicates, checkUnclassified, checkSourceAliases,
} from './checks.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WITH_LINKS = process.argv.includes('--links');
const now = new Date();
const findings: Finding[] = [];

// ── 데이터 적재 ──
const dir = CONFIG.paths.signalsDir;
const monthFiles = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}\.json$/.test(n))
  : [];

if (!monthFiles.length) {
  console.error('[audit] 월 파티션이 없다 — 파이프라인이 한 번도 돌지 않았거나 경로가 어긋났다');
  // 여기서는 exit() 가 맞다 — 멈추지 않으면 다음 줄에서 없는 매니페스트를 읽는다.
  // exitCode 만 세우면 실행이 그대로 이어진다.
  process.exit(1);
}

const signals: SignalRef[] = [];
const months: string[] = [];
for (const name of monthFiles) {
  months.push(name.replace('.json', ''));
  const part = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { signals?: SignalRef[] };
  signals.push(...(part.signals ?? []));
}

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
  generatedAt: string | null;
  stats: { total: number };
  firstDate: string | null;
  lastDate: string | null;
  months: string[];
  counts: Record<string, number>;
  /** 매체명 → 아카이브 전체 기준 건수. 화면의 소스 구성이 이 값으로 비율을 낸다 */
  outlets?: Record<string, number>;
};

const sourcesByEdge = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/relationship-sources.json'), 'utf8')
) as Record<string, SourceRef[]>;
const sourceLinks = Object.values(sourcesByEdge).flat();

const knownIds = new Set<string>();
for (const f of fs.readdirSync(CONFIG.paths.politiciansDir)) {
  if (!f.endsWith('.ts')) continue;
  const t = fs.readFileSync(path.join(CONFIG.paths.politiciansDir, f), 'utf8');
  for (const m of t.matchAll(/^\s+id:\s*'([a-z0-9-]+)'/gm)) knownIds.add(m[1]);
}

const relText = fs.readFileSync(path.join(ROOT, 'src/data/relationships.ts'), 'utf8');
const edgeCount = [...relText.matchAll(/\ba:\s*'[a-z0-9-]+',\s*b:\s*'[a-z0-9-]+'/g)].length;

// ── 검사 ──
findings.push(...checkAllowlist(signals, isAllowedSource, 'signals'));
findings.push(...checkAllowlist(sourceLinks, isAllowedSource, 'sources'));
findings.push(...checkDates(signals, 'signals', now));
findings.push(...checkDates(sourceLinks, 'sources', now, '2017-01-01'));
findings.push(...checkFreshness(manifest.generatedAt, manifest.lastDate, now));
findings.push(...checkReferences(signals, knownIds));
findings.push(...checkSignalDuplicates(signals));
findings.push(...checkUnclassified(signals));
findings.push(...checkPresentation(sourceLinks));
findings.push(...checkVerifiable(sourceLinks));
findings.push(...checkDuplicates(sourcesByEdge));
findings.push(...checkSourceAliases(CONFIG.allowedSourceNames, SOURCE_NAME_ALIASES));

// 크로스워크는 이후 단계 전부가 얹히는 바닥이다. 인물이 늘거나 바뀌었는데
// 다시 만들지 않으면 흔들리지 않는 대신 일관되게 틀린 값이 된다.
const cwPath = path.join(ROOT, 'src/data/crosswalk.json');
if (fs.existsSync(cwPath)) {
  const cw = JSON.parse(fs.readFileSync(cwPath, 'utf8')) as CrosswalkFile;
  findings.push(...checkCrosswalk(cw, knownIds));
} else {
  findings.push({
    level: 'warn', check: 'crosswalk.absent',
    message: 'crosswalk.json 이 없다 — npm run crosswalk 로 만든다',
  });
}

// 공동발의 엣지는 측정값이라 사람이 눈으로 확인하지 않는다. 생성이 어긋나도
// 화면에는 그럴듯하게 나오므로 여기서 막는다.
const cosPath = path.join(ROOT, 'src/data/cosponsorship.json');
const cosSrcPath = path.join(ROOT, 'src/data/cosponsorship-sources.json');
if (fs.existsSync(cosPath) && fs.existsSync(cosSrcPath)) {
  const cos = JSON.parse(fs.readFileSync(cosPath, 'utf8')) as CosponsorFile;
  const cosSrc = JSON.parse(fs.readFileSync(cosSrcPath, 'utf8')) as Record<string, SourceRef[]>;
  const curatedPairs = new Set(
    [...relText.matchAll(/\ba:\s*'([a-z0-9-]+)',\s*b:\s*'([a-z0-9-]+)'/g)].map((m) =>
      m[1] < m[2] ? `${m[1]}|${m[2]}` : `${m[2]}|${m[1]}`
    )
  );
  findings.push(...checkCosponsor(cos, knownIds, curatedPairs, cosSrc));
}

// 자금 데이터는 눈으로 검산할 수 없다. 틀려도 화면에는 그럴듯한 금액이 나온다.
const fundPath = path.join(ROOT, 'src/data/funding.json');
if (fs.existsSync(fundPath)) {
  const fund = JSON.parse(fs.readFileSync(fundPath, 'utf8')) as FundingFile;
  findings.push(...checkFunding(fund, knownIds));
}

// 당론 이탈률 — 화면에는 어떤 숫자든 그럴듯한 퍼센트로 나온다.
// 화면이 import 하는 데이터 파일. 없으면 그 층이 통째로 사라지는데,
// 아래 검사들은 전부 existsSync 로 감싸여 있어 조용히 통과한다.
const REQUIRED_DATA = [
  'src/data/crosswalk.json',
  'src/data/cosponsorship.json',
  'src/data/funding.json',
  'src/data/lobbying.json',
  'src/data/party-unity.json',
];
const missingData = REQUIRED_DATA.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
if (missingData.length) {
  findings.push({
    level: 'fail',
    check: 'data.missing',
    message: `화면이 쓰는 데이터 파일 ${missingData.length}개가 없다`,
    samples: missingData,
  });
}

const unityPath = path.join(ROOT, 'src/data/party-unity.json');
if (fs.existsSync(unityPath)) {
  const unity = JSON.parse(fs.readFileSync(unityPath, 'utf8')) as UnityFile;
  findings.push(...checkPartyUnity(unity, knownIds));
}
// 로비 회전문 — 위험은 수치가 아니라 의미다. 매칭이 헐거워지면 성 하나로 붙는다.
const lobbyPath = path.join(ROOT, 'src/data/lobbying.json');
if (fs.existsSync(lobbyPath)) {
  const lob = JSON.parse(fs.readFileSync(lobbyPath, 'utf8')) as LobbyingFile;
  findings.push(...checkLobbying(lob, knownIds));
}

// LLM 판정의 정확도. 없으면 프롬프트를 고치고 "좋아졌다" 고 믿게 된다.
const accPath = path.join(ROOT, 'scripts/eval/labels.json');
findings.push(
  ...checkAccuracy(
    fs.existsSync(accPath) ? (JSON.parse(fs.readFileSync(accPath, 'utf8')) as AccuracyFile) : null
  )
);

const actualCounts: Record<string, number> = {};
for (const s of signals) for (const p of s.people ?? []) actualCounts[p] = (actualCounts[p] ?? 0) + 1;
findings.push(
  ...checkManifest(manifest, { months, total: signals.length, counts: actualCounts })
);

// 소스 구성 수치는 야간 파이프라인이 **매일** 바꾼다. 화면은 매니페스트에서
// 다시 세지만 README 는 손으로 적혀 있어 며칠이면 낡는다.
//
// 산식은 화면(InsightsPanel)과 **같은 함수를 부른다.** 예전에는 같은 규칙을 여기에
// 다시 적어 뒀는데, 그건 갈라질 자리를 하나 만들어 둔 것이었다 — 갈려도 합계는
// 맞으므로 종료 코드는 0 이고, 감사는 화면에 없는 값을 요구하게 된다.
const mix = outletMix(manifest.outlets ?? {});
const topShare = mix.topShare;
const wire = wireShare(mix);

/**
 * 크로스워크·정확도 수치 — README 의 "어디로 가는가" 와 한계 절이 이 값들을 적는다.
 *
 * 이 넷은 실제로 낡았다. 크로스워크를 확정하며 매칭이 75 → 84 로, 표결 대조가 가능한
 * 엣지가 74 → 145 로 바뀌었는데 README 는 옛 숫자를 그대로 들고 있었다. 어느 검사도
 * 그 문장을 보고 있지 않았기 때문이다.
 */
const cwForDocs = fs.existsSync(cwPath)
  ? (JSON.parse(fs.readFileSync(cwPath, 'utf8')) as CrosswalkFile)
  : null;
const memberByBioguide = new Map((cwForDocs?.members ?? []).map((m) => [m.bioguide, m]));
const matchedPolaris = Object.values(cwForDocs?.polaris ?? {}).filter((v) => v.bioguide);
const withRollCall = matchedPolaris.filter(
  (v) => memberByBioguide.get(v.bioguide!)?.icpsr != null
).length;
const withFec = matchedPolaris.filter(
  (v) => (memberByBioguide.get(v.bioguide!)?.fec ?? []).length > 0
).length;
/** 양쪽 다 호명투표 기록이 있는 엣지 — 표결 데이터가 실제로 닿는 범위 */
const hasRollCall = (id: string): boolean => {
  const bio = cwForDocs?.polaris?.[id]?.bioguide;
  return Boolean(bio && memberByBioguide.get(bio)?.icpsr != null);
};
const bothLegislators = [
  ...relText.matchAll(/\ba:\s*'([a-z0-9-]+)',\s*b:\s*'([a-z0-9-]+)'/g),
].filter((m) => hasRollCall(m[1]) && hasRollCall(m[2])).length;

// 문서 수치는 손으로 갱신해 왔다 — 조용히 낡는 것을 잡는다.
//
// **공백을 먼저 접는다.** 이 검사가 한 번 죽었던 이유가 그것이다 — 문장을 줄바꿈으로
// 다시 감쌌더니 정규식이 빗나갔고, 매칭 0건이 통과로 보고됐다. 패턴을 한 줄로 쓰고
// 문서 쪽을 정규화하면 서식 변경이 검사를 조용히 끄지 못한다.
const docs = ['README.md', 'README.ko.md']
  .filter((f) => fs.existsSync(path.join(ROOT, f)))
  .map((f) => ({
    file: f,
    text: fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/[ \t]*\r?\n[ \t]*/g, ' '),
  }));
findings.push(
  ...checkDocClaims(docs, [
    { pattern: /\*\*(\d+) of 266 edges have evidence/, actual: Object.keys(sourcesByEdge).length, label: '근거 보유 엣지' },
    { pattern: /\*\*266개 중 (\d+)개에 근거가 있고/, actual: Object.keys(sourcesByEdge).length, label: '근거 보유 엣지' },
    { pattern: /(\d+) figures\./, actual: knownIds.size, label: '인물 수' },
    { pattern: /(\d+) curated relationships/, actual: edgeCount, label: '관계 수' },
    // 소스 구성.
    //
    // **신호 총계는 일부러 문서에 두지 않는다.** 아카이브는 매일 밤 커지므로 그 수를
    // README 에 적으면 하루 이상 맞을 수 없고, 감사가 매일 경고한다. 늘 켜져 있는 경고는
    // 사람이 읽지 않게 되어 없는 것보다 나쁘다 — 옆의 진짜 경고까지 같이 묻힌다.
    // 총계는 화면(데이터 커버리지 배지·소스 구성)이 매니페스트에서 직접 읽어 보여준다.
    // 아래 셋은 몇 주에 한 번 움직이므로, 경고가 뜨면 그때가 실제로 고칠 때다.
    { pattern: /archive comes from ([\d,]+) outlets/, actual: mix.entries.length, label: '매체 수 (EN)' },
    { pattern: /top five carry (\d+)% of it/, actual: topShare, label: '상위 5곳 비중 (EN)' },
    { pattern: /AP plus Reuters together are ([\d.]+)%/, actual: wire, label: '통신사 비중 (EN)' },
    { pattern: /아카이브 전체는 ([\d,]+)개 매체에서 왔지만/, actual: mix.entries.length, label: '매체 수 (KO)' },
    { pattern: /상위 5곳이 (\d+)%를 차지하고/, actual: topShare, label: '상위 5곳 비중 (KO)' },
    { pattern: /AP 와 Reuters 를 합쳐도 ([\d.]+)%/, actual: wire, label: '통신사 비중 (KO)' },
    // 크로스워크 — 여기가 실제로 낡아 75/56/75/74 를 오래 들고 있던 자리다
    { pattern: /\*\*(\d+) of the 101 figures\s*\n?match a current or former member/, actual: matchedPolaris.length, label: '의원 매칭 (EN)' },
    { pattern: /all (\d+) have roll-call records/, actual: withRollCall, label: '호명투표 보유 (EN)' },
    { pattern: /roll-call records, (\d+) have an FEC id/, actual: withFec, label: 'FEC 보유 (EN)' },
    { pattern: /reaches only the (\d+) relationships/, actual: bothLegislators, label: '양쪽 다 의원인 엣지 (EN)' },
    { pattern: /\*\*101명 중 (\d+)명이 현직 또는 역대 의원과/, actual: matchedPolaris.length, label: '의원 매칭 (KO)' },
    { pattern: /표결 기록은\s*\n?(\d+)명 전원/, actual: withRollCall, label: '호명투표 보유 (KO)' },
    { pattern: /FEC id 는 (\d+)명/, actual: withFec, label: 'FEC 보유 (KO)' },
    { pattern: /266개 중 양쪽 다 의원인 (\d+)개/, actual: bothLegislators, label: '양쪽 다 의원인 엣지 (KO)' },
  ])
);

// ── 링크 생존 (옵션) ──
if (WITH_LINKS) {
  process.stdout.write(`[audit] 링크 ${sourceLinks.length}건 생존 확인 중…\n`);
  const dead: string[] = [];
  for (const s of sourceLinks) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(s.url, {
        redirect: 'follow', signal: ctl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 polaris-audit' },
      });
      clearTimeout(t);
      // 403/401/429 는 주요 매체의 크롤러 차단이지 주소 오류가 아니다
      if (r.status === 404 || r.status === 410) dead.push(`${r.status} ${s.source} — ${s.title.slice(0, 40)}`);
    } catch {
      /* 네트워크 요동은 죽은 링크로 치지 않는다 */
    }
  }
  if (dead.length) {
    findings.push({
      level: 'fail', check: 'sources.deadLink',
      message: `사라진 기사 ${dead.length}건`, samples: dead.slice(0, 4),
    });
  }
}

// ── 보고 ──
const dates = signals.map((s) => s.date).filter(Boolean).sort();
console.log('POLARIS 데이터 감사');
console.log('─'.repeat(58));
console.log(`인물 ${knownIds.size} · 관계 ${edgeCount} · 신호 ${signals.length} (${dates[0]} → ${dates[dates.length - 1]})`);
console.log(`파티션 ${months.length}개월 · 근거 엣지 ${Object.keys(sourcesByEdge).length}/${edgeCount} · 링크 ${sourceLinks.length}`);
console.log(`마지막 수집 ${manifest.generatedAt}`);
if (fs.existsSync(cwPath)) {
  const cw = JSON.parse(fs.readFileSync(cwPath, 'utf8')) as CrosswalkFile;
  console.log(`크로스워크 의원 ${cw.stats.members} · POLARIS ${cw.stats.polarisMatched}/${cw.stats.polarisTotal} 매칭`);
}
if (fs.existsSync(cosPath)) {
  const cos = JSON.parse(fs.readFileSync(cosPath, 'utf8')) as CosponsorFile;
  console.log(`공동발의 엣지 ${cos.stats.edges} (신규 ${cos.stats.fresh} · 초당적 ${cos.stats.crossParty}) · ${cos.congress}대 · 기준 ${cos.threshold}건`);
}
if (fs.existsSync(fundPath)) {
  const fund = JSON.parse(fs.readFileSync(fundPath, 'utf8')) as FundingFile;
  const m = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
  console.log(`자금 ${fund.stats.people}명 · 수입 ${m(fund.stats.receipts)} · PAC 직접 ${m(fund.stats.pacDirect)} (${fund.stats.namedSharePct}%)`);
}
if (fs.existsSync(lobbyPath)) {
  const lob = JSON.parse(fs.readFileSync(lobbyPath, 'utf8')) as LobbyingFile;
  console.log(`회전문 ${lob.stats.people}명 · 전직 보좌진 ${lob.stats.matched}명 (${lob.years[0]}~${lob.years[lob.years.length - 1]})`);
}

if (fs.existsSync(unityPath)) {
  const uni = JSON.parse(fs.readFileSync(unityPath, 'utf8')) as UnityFile;
  console.log(`당론 이탈 ${uni.stats.people}명 · 정당표결 ${uni.stats.partyVotes}/${uni.stats.rollCalls} · ${uni.congress}대 · 축 0~${uni.axisMax}%`);
}
console.log('─'.repeat(58));

const v = verdict(findings);
if (!findings.length) {
  console.log('통과 — 문제 없음');
} else {
  for (const f of findings) {
    const tag = f.level === 'fail' ? 'FAIL' : f.level === 'warn' ? 'WARN' : 'INFO';
    console.log(`${tag}  ${f.check}\n      ${f.message}`);
    for (const s of f.samples ?? []) console.log(`        · ${s}`);
  }
  console.log('─'.repeat(58));
  console.log(`FAIL ${v.fail} · WARN ${v.warn}${WITH_LINKS ? '' : '  (링크 생존은 --links)'}`);
}

// process.exit() 대신 exitCode — 강제 종료는 Windows 에서 종료 코드를 뭉갠다
process.exitCode = v.ok ? 0 : 1;
