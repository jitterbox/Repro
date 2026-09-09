import { readFileSync } from 'node:fs';

export const PROBE_IIFE = readFileSync(
  new URL('../dist/probe.iife.js', import.meta.url),
  'utf8',
);
