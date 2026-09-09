import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  testMatch: 'transient.spec.ts',
  webServer: {
    command: 'node transient-server.mjs',
    url: 'http://127.0.0.1:3196',
    reuseExistingServer: false,
  },
});
