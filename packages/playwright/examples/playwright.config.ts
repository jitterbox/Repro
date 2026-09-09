import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'scenario.spec.ts',
  timeout: 30000,
  use: {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:3198',
    reuseExistingServer: true,
  },
  reporter: [['list'], ['../dist/reporter.js']],
});
