import fs from 'node:fs';
import { CONFIG } from './config.mts';
import { buildFile, writeOutput, readExisting, accumulate, type SignalsFile } from './merge.mts';
import { validate } from './validate.mts';
import type { Signal } from './extract.mts';

/** 캐시된 신호를 실제 출력으로 승격 (fetch/extract 재실행 없이) */
const dry = process.argv.includes('--dry');
const cachePath = CONFIG.paths.signalsCache;
if (!fs.existsSync(cachePath)) {
  console.error('[finalize] 캐시 없음 — extract 먼저 실행');
  // process.exit() 은 Windows 에서 종료 코드를 뭉갠다 (CLAUDE.md)
  process.exitCode = 1;
}
else {
  const signals: Signal[] = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const file: SignalsFile = buildFile(
    accumulate(readExisting(), signals),
    CONFIG.maxArchive
  );
  // fresh 를 주지 않는다. 이 스크립트는 fetch 없이 캐시를 승격하는 재처리라
  // "수집한 시각" 이 지금이 아니다. 갱신하면 화면 배지가 실제보다 새것으로 나온다 —
  // 예전에 27.7시간 어긋난 적이 있고 그래서 writeOutput 의 기본이 보존이다.
  // 실제 수집은 pipeline.mts 만 fresh 를 준다.
  writeOutput(file, dry);
  validate(file, dry);

}