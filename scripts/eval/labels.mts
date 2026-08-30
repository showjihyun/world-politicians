/**
 * 정확도 라벨 세트 — 표본 추출과 채점.
 *
 *   npm run eval          현재 점수 (라벨을 읽어 채점만)
 *   npm run eval:sample   표본을 뽑아 라벨 파일에 얹는다 (--dry 로 미리보기)
 *
 * 라벨 파일(`scripts/eval/labels.json`)의 `truth` 칸을 사람이 채운다.
 *
 *   truth.polarity     ally | feud | neutral   이 기사가 실제로 말하는 관계
 *   truth.pairCorrect  true | false            배정된 두 사람의 관계에 관한 기사인가
 *
 * 안 채운 행은 채점에서 빠진다. 0 으로 세면 라벨링이 덜 된 것과 모델이 틀린 것이
 * 섞여 점수가 의미를 잃는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../news-pipeline/config.mts';
import {
  hashSeed, mergeLabels, sampleSignals, score, toLabelRow, verdictAgainst,
  type LabelRow, type SignalLike,
} from './labels-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DRY = process.argv.includes('--dry');
const SAMPLE = process.argv.includes('--sample');
const LABELS = path.join(import.meta.dirname, 'labels.json');
const TARGET = 120;
/** 시드를 바꾸면 표본이 통째로 바뀐다 — 라벨을 버리게 되므로 고정한다 */
const SEED = hashSeed('polaris-eval-v1');

interface LabelFile {
  note: string;
  /** 한 번 정한 뒤 떨어지면 감사가 잡는다. 처음에는 null 이다 */
  baseline: { polarity: number | null; pair: number | null };
  rows: LabelRow[];
}

const empty: LabelFile = {
  note:
    'truth 칸을 사람이 채운다. polarity 는 ally|feud|neutral, pairCorrect 는 배정된 두 사람의 ' +
    '관계에 관한 기사인지 여부다. 안 채운 행은 채점에서 빠진다. ' +
    'baseline 은 라벨링이 충분히 쌓인 뒤 그때 점수로 한 번 적는다.',
  baseline: { polarity: null, pair: null },
  rows: [],
};

const file: LabelFile = fs.existsSync(LABELS)
  ? { ...empty, ...(JSON.parse(fs.readFileSync(LABELS, 'utf8')) as Partial<LabelFile>) }
  : empty;

// ── 표본 추가 ──
if (SAMPLE) {
  const dir = CONFIG.paths.signalsDir;
  const signals: SignalLike[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/^\d{4}-\d{2}\.json$/.test(name)) continue;
    const part = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { signals?: SignalLike[] };
    signals.push(...(part.signals ?? []));
  }

  // 허브를 층 기준에 쓴다. feud 146건 중 108건이 trump 관련이라, 나누지 않으면
  // 표본이 통째로 trump 로 쏠려 "허브가 아닌 관계" 의 정확도를 못 잰다.
  const degree = new Map<string, number>();
  for (const s of signals) for (const p of s.pair ?? []) degree.set(p, (degree.get(p) ?? 0) + 1);
  const hubs = new Set(
    [...degree].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id)
  );

  const fresh = sampleSignals(signals, TARGET, hubs, SEED).map(toLabelRow);
  const merged = mergeLabels(file.rows, fresh);
  const added = merged.length - file.rows.length;

  console.log(`신호 ${signals.length} · 허브 ${[...hubs].join(', ')}`);
  console.log(`표본 ${fresh.length} → 새로 추가 ${added} · 라벨 파일 총 ${merged.length}행`);
  if (DRY) {
    console.log('--dry — 쓰지 않았다');
  } else {
    fs.writeFileSync(LABELS, JSON.stringify({ ...file, rows: merged }, null, 2) + String.fromCharCode(10));
    console.log(`${path.relative(ROOT, LABELS)} 기록`);
  }
  console.log('─'.repeat(58));
}

// ── 채점 ──
const s = score(file.rows);
const v = verdictAgainst(s, file.baseline);

console.log('정확도');
console.log('─'.repeat(58));
console.log(`라벨 ${s.labeled}/${file.rows.length}  (미기입 ${s.pending})`);
if (s.polarity.scored) {
  console.log(`극성    ${s.polarity.correct}/${s.polarity.scored} = ${s.polarity.accuracy}%`);
  const wrong = Object.entries(s.polarity.confusion).filter(([k]) => {
    const [want, got] = k.split('→');
    return want !== got;
  });
  if (wrong.length) console.log(`  틀린 방향: ${wrong.map(([k, n]) => `${k} ${n}`).join(' · ')}`);
} else {
  console.log('극성    아직 라벨이 없다');
}
if (s.pair.scored) {
  console.log(`관계쌍  ${s.pair.correct}/${s.pair.scored} = ${s.pair.accuracy}%`);
} else {
  console.log('관계쌍  아직 라벨이 없다');
}
if (file.baseline.polarity === null && s.polarity.scored >= 40) {
  console.log(`기준선이 비어 있다 — 지금 점수(극성 ${s.polarity.accuracy}% · 쌍 ${s.pair.accuracy}%)를`);
  console.log('labels.json 의 baseline 에 적으면 이후 하락을 감사가 잡는다.');
}
console.log('─'.repeat(58));

if (!v.ok) {
  for (const r of v.reasons) console.log(`FAIL  ${r}`);
  process.exitCode = 1;
}
