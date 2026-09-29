import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({
  ...configuration,
  use: {
    ...configuration.use,
    reducedMotion: 'no-preference',
    serviceWorkers: 'allow',
  },
  testMatch: 'scene-*.spec.ts',
  webServer: {
    command: 'node scene-server.mjs',
    url: 'http://127.0.0.1:3207/menu',
    reuseExistingServer: false,
  },
});
