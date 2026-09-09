import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'src/probe-source.ts');
const distFile = resolve(root, 'dist/probe.iife.js');

await mkdir(resolve(root, 'dist'), { recursive: true });

await build({
  bundle: true,
  entryPoints: [entry],
  format: 'iife',
  legalComments: 'none',
  logLevel: 'info',
  outfile: distFile,
  platform: 'browser',
  sourcemap: false,
  target: 'es2022',
  treeShaking: true,
});
