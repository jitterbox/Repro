import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(packageRoot, 'dist');

await mkdir(distDir, { recursive: true });
// This module is browser-safe and has no runtime imports. Keep the source in
// contracts while emitting a relative module for portable, unbundled viewers.
await cp(
  join(packageRoot, '../contracts/dist/sync-time.js'),
  join(distDir, 'sync-time.js'),
);
await cp(
  join(packageRoot, '../contracts/dist/sync-time.js.map'),
  join(distDir, 'sync-time.js.map'),
);

await copyClean(join(packageRoot, 'public'), join(distDir, 'public'));
await copyClean(
  join(packageRoot, '../contracts/dist/tokens'),
  join(distDir, 'tokens'),
);

async function copyClean(source, target) {
  await rm(target, { force: true, recursive: true });
  await cp(source, target, { recursive: true });
}
