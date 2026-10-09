/**
 * 저장소에 넣지 않는 외부 자산을 받는다.
 *
 * - 음악: Kevin MacLeod "Hitman" (incompetech.com, CC BY 4.0 — 엔드 카드에 표기)
 * - 글꼴: Pretendard 1.3.9 (SIL OFL)
 *
 * 이미 있으면 건너뛴다. --dry 면 받을 목록만 보여준다.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const DRY = process.argv.includes('--dry');

const FILES = [
  ['music/Hitman.mp3', 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Hitman.mp3'],
  ...['Regular', 'Medium', 'Bold', 'ExtraBold', 'Black'].map((w) => [
    `fonts/Pretendard-${w}.woff2`,
    `https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-${w}.woff2`,
  ]),
];

let failed = 0;
for (const [rel, url] of FILES) {
  const dest = join(PUB, rel);
  if (existsSync(dest)) {
    console.log(`skip  ${rel}`);
    continue;
  }
  if (DRY) {
    console.log(`would fetch ${rel} ← ${url}`);
    continue;
  }
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  // 200 이어도 오류 페이지일 수 있다 — 크기로 한 번 더 본다
  if (!res.ok || body.length < 50_000) {
    console.error(`FAIL  ${rel} (${res.status}, ${body.length} bytes)`);
    failed++;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  console.log(`fetch ${rel} (${(body.length / 1e6).toFixed(1)} MB)`);
}
process.exitCode = failed ? 1 : 0;
