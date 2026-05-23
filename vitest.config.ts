import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run TypeScript sources under src/. Without this, vitest also
    // discovers stale `out/**/*.test.js` files emitted by `npm run compile`
    // (the demo scripts use tsc) and tries to import them as CommonJS, which
    // fails since vitest doesn't support require()-style imports.
    include: ['src/**/*.test.ts']
  }
});
