import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Yalnizca kaynak testleri. dist/ derlenmis kopyalari icerirse ayni
    // testler iki kez calisir.
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
