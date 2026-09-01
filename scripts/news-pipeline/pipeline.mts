import fs from 'node:fs';
import { fetchAllArticles } from './fetch.mts';
import { extractSignals, reclassify } from './extract.mts';
import { buildFile, writeOutput, readExisting, accumulate, type SignalsFile } from './merge.mts';
import { dedupeByStory } from './core.mts';
import { validate } from './validate.mts';
import { CONFIG } from './config.mts';

const dry = process.argv.includes('--dry');

async function main(): Promise<void> {
  console.log(`=== POLARIS news pipeline ${dry ? '(DRY RUN)' : ''} ===`);
  const articles = await fetchAllArticles();

  let signals;
  const cachePath = CONFIG.paths.signalsCache;
  if (articles.length > 0) {
    signals = await extractSignals(articles);
    fs.writeFileSync(cachePath, JSON.stringify(signals));
  } else {
    console.warn('[pipeline] 수집된 기사 0건 — 네트워크 차단 또는 RSS 실패. 이전 캐시 사용 시도');
    signals = fs.existsSync(cachePath)
      ? (JSON.parse(fs.readFileSync(cachePath, 'utf8')) as typeof signals)
      : [];
  }

  // 새 기사만 분류하면 한 번 실패한 신호는 영원히 미분류로 남는다.
  // 합친 뒤 갇힌 것들을 다시 시도한다. --dry 는 미리보기라 LLM 을 부르지 않는다.
  const accumulated = accumulate(readExisting(), signals);

  // reclassify 뒤에 한 번 더 거른다. 중복 판정 키에 관계쌍이 들어가는데,
  // 미분류 신호는 accumulate 시점에 쌍이 비어 있어 다른 키로 통과한다.
  // reclassify 가 쌍을 붙이는 순간 기존 신호와 같은 키가 되므로, 중간 결과에
  // 걸어 둔 거르기는 최종 데이터를 보장하지 못한다 — 2026-08-31 야간 실행이
  // 이것 때문에 signals.duplicate 로 죽었고 그날 수집분이 커밋되지 못했다.
  const merged = dry ? accumulated : dedupeByStory(await reclassify(accumulated));
  const file: SignalsFile = buildFile(merged, CONFIG.maxArchive);
  writeOutput(file, dry, { fresh: true });
  validate(file, dry);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[pipeline] FAILED:', e);
    process.exit(1);
  });
