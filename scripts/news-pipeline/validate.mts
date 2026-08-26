import fs from 'node:fs';
import { loadPeople } from './fetch.mts';
import { CONFIG } from './config.mts';
import type { SignalsFile } from './merge.mts';

export function validate(file: SignalsFile, dry = false): boolean {
  const people = new Set(loadPeople().map((p) => p.id));
  let ok = true;

  if (!file || !Array.isArray(file.signals)) {
    console.error('[validate] signals 배열 없음');
    return false;
  }
  if (file.stats.total !== file.signals.length) {
    console.error('[validate] stats.total 불일치');
    ok = false;
  }
  for (const s of file.signals) {
    if (!s.id || !s.date || !s.title) { ok = false; console.error('[validate] 필수 필드 누락:', s.id); break; }
    for (const pid of s.people ?? []) {
      if (!people.has(pid)) { ok = false; console.error('[validate] 미지 인물 id:', pid); break; }
    }
    if (!ok) break;
  }

  const outPath = dry ? 'scripts/news-pipeline/.dry-output.json' : CONFIG.paths.outJson;
  const sizeKB = fs.existsSync(outPath) ? Math.round(fs.statSync(outPath).size / 1024) : 0;
  console.log(`[validate] signals=${file.signals.length} classified=${file.stats.classified} ally=${file.stats.ally} feud=${file.stats.feud} size=${sizeKB}KB → ${ok ? 'OK' : 'FAILED'}`);
  return ok;
}
