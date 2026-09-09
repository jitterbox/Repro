import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  testMatch: 'diagnostics.spec.ts',
  webServer: {
    command: 'node diagnostics-server.mjs',
    url: 'http://127.0.0.1:3197',
    reuseExistingServer: false,
  },
});
