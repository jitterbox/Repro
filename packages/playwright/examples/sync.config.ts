import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  testMatch: 'sync.spec.ts',
  webServer: {
    command: 'node sync-server.mjs',
    url: 'http://127.0.0.1:3195',
    reuseExistingServer: true,
  },
});
