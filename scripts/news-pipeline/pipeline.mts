import fs from 'node:fs';
import { fetchAllArticles } from './fetch.mts';
import { extractSignals } from './extract.mts';
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

  const file: SignalsFile = buildFile(
    accumulate(readExisting(), signals),
    CONFIG.maxArchive
  );
  writeOutput(file, dry);
  validate(file, dry);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[pipeline] FAILED:', e);
    process.exit(1);
  });
