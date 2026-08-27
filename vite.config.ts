import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 는 /<repo>/ 하위에서 서빙되므로 빌드 시 base 가 필요하다.
  // 로컬 dev/build 는 그대로 루트를 쓴다.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
