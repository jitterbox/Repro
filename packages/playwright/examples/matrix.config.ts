import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'matrix.spec.ts',
  timeout: 30000,
  use: {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'no-preference',
  },
  webServer: {
    command: 'pnpm --filter @jitterbox/repro-shoplite dev --host 127.0.0.1',
    cwd: '../../..',
    url: 'http://127.0.0.1:5177',
    reuseExistingServer: true,
  },
  reporter: [['list'], ['../dist/reporter.js']],
});
