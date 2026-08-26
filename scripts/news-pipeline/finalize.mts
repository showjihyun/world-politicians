import fs from 'node:fs';
import { CONFIG } from './config.mts';
import { buildFile, writeOutput, type SignalsFile } from './merge.mts';
import { validate } from './validate.mts';
import type { Signal } from './extract.mts';

/** 캐시된 신호를 실제 출력으로 승격 (fetch/extract 재실행 없이) */
const dry = process.argv.includes('--dry');
const cachePath = CONFIG.paths.signalsCache;
if (!fs.existsSync(cachePath)) {
  console.error('[finalize] 캐시 없음 — extract 먼저 실행');
  process.exit(1);
}
const signals: Signal[] = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const file: SignalsFile = buildFile(signals);
writeOutput(file, dry);
validate(file, dry);
