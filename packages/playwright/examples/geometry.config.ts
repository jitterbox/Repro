import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  testMatch: 'geometry.spec.ts',
  webServer: {
    command: 'node geometry-server.mjs',
    url: 'http://127.0.0.1:3194',
    reuseExistingServer: false,
  },
});
