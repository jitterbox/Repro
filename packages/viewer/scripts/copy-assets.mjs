import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(packageRoot, 'dist');

await mkdir(distDir, { recursive: true });
await copyClean(join(packageRoot, 'public'), join(distDir, 'public'));
await copyClean(join(packageRoot, 'tokens'), join(distDir, 'tokens'));

async function copyClean(source, target) {
  await rm(target, { force: true, recursive: true });
  await cp(source, target, { recursive: true });
}
