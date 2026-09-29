import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'walkthrough.spec.ts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  use: {
    actionTimeout: 15000,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    serviceWorkers: 'allow',
    contextOptions: { reducedMotion: 'no-preference' },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  reporter: [['list'], ['../../dist/reporter.js']],
});
