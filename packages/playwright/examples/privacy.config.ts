import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  testMatch: 'privacy.spec.ts',
  webServer: {
    command: 'node privacy-server.mjs',
    url: 'http://127.0.0.1:3196',
    reuseExistingServer: true,
  },
});
