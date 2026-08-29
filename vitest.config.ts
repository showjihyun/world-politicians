import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 도메인은 브라우저도 파일시스템도 필요 없다 — 그게 이 층을 나눈 이유다.
    environment: 'node',
    include: ['src/domain/**/*.test.ts', 'scripts/**/*.test.mts'],
    // 도메인이 I/O 를 끌어들이면 테스트가 느려지고 불안정해진다.
    // 여기서 막지 않으면 경계는 문서에만 남는다.
    testTimeout: 5000,
  },
});
