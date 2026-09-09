import { defineConfig } from '@playwright/test';
import config from './playwright.config.js';
export default defineConfig({ ...config, testMatch: 'discovery.spec.ts' });
