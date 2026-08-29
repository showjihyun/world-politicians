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

  // 출력이 월별 파티션으로 나뉘었으므로 디렉터리 합계를 잰다
  let sizeKB = 0;
  if (dry) {
    const p = 'scripts/news-pipeline/.dry-output.json';
    sizeKB = fs.existsSync(p) ? Math.round(fs.statSync(p).size / 1024) : 0;
  } else if (fs.existsSync(CONFIG.paths.signalsDir)) {
    for (const name of fs.readdirSync(CONFIG.paths.signalsDir)) {
      sizeKB += fs.statSync(`${CONFIG.paths.signalsDir}/${name}`).size / 1024;
    }
    sizeKB = Math.round(sizeKB);
  }
  console.log(`[validate] signals=${file.signals.length} classified=${file.stats.classified} ally=${file.stats.ally} feud=${file.stats.feud} size=${sizeKB}KB → ${ok ? 'OK' : 'FAILED'}`);
  return ok;
}
