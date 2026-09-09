import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({ ...configuration, testMatch: 'timing.spec.ts' });
