import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,
  testMatch: 'bug-corpus.spec.ts',
  use: { ...base.use, reducedMotion: 'no-preference' },
  webServer: {
    command: 'node bug-corpus-server.mjs',
    url: 'http://127.0.0.1:3208/overflow',
    reuseExistingServer: false,
  },
});
