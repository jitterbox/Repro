import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  testMatch: 'interaction-diagnostics.spec.ts',
  webServer: {
    command: 'node interaction-diagnostics-server.mjs',
    url: 'http://127.0.0.1:3193',
    reuseExistingServer: true,
  },
});
