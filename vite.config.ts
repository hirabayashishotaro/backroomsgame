import { defineConfig } from 'vite';

// base './' so the build works when loaded from file:// inside Electron.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
