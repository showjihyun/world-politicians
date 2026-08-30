import fs from 'node:fs';
import { fetchAllArticles } from './fetch.mts';
import { extractSignals, reclassify } from './extract.mts';
import { buildFile, writeOutput, readExisting, accumulate, type SignalsFile } from './merge.mts';
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
  // 합친 뒤 갇힌 것들을 다시 시도한다.
  const merged = await reclassify(accumulate(readExisting(), signals));
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
