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
import { CONFIG } from '../news-pipeline/config.mts';
import { isAllowedSource } from '../news-pipeline/fetch.mts';
import {
  checkAccuracy,
  checkAllowlist, checkCosponsor, checkCrosswalk, checkDates, checkFunding, checkLobbying, checkDocClaims, checkDuplicates, checkFreshness,
  checkManifest, checkPresentation, checkReferences, checkVerifiable, verdict,
  type AccuracyFile,
  type CosponsorFile, type CrosswalkFile, type Finding, type FundingFile, type LobbyingFile, type SignalRef, type SourceRef,
  checkSignalDuplicates, checkUnclassified,
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

// 문서 수치는 손으로 갱신해 왔다 — 조용히 낡는 것을 잡는다
const docs = ['README.md', 'README.ko.md']
  .filter((f) => fs.existsSync(path.join(ROOT, f)))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
findings.push(
  ...checkDocClaims(docs, [
    { pattern: /\*\*(\d+) of 266 edges have evidence/, actual: Object.keys(sourcesByEdge).length, label: '근거 보유 엣지' },
    { pattern: /\*\*266개 중 (\d+)개에 근거가 있고/, actual: Object.keys(sourcesByEdge).length, label: '근거 보유 엣지' },
    { pattern: /(\d+) figures\./, actual: knownIds.size, label: '인물 수' },
    { pattern: /(\d+) curated relationships/, actual: edgeCount, label: '관계 수' },
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
