import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  testMatch: 'observations.spec.ts',
  webServer: {
    command: 'node observations-server.mjs',
    url: 'http://127.0.0.1:3191',
    reuseExistingServer: false,
  },
});
