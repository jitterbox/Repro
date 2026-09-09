import { defineConfig } from '@playwright/test';
import configuration from './playwright.config.js';
export default defineConfig({ ...configuration, testMatch: 'checks.spec.ts' });
