import type { EvidenceManifest } from './package.js';
import type * as Core from '@repro/core';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  audits: 0,
  version: 'one',
  available: true,
  models: '',
}));
vi.mock('@repro/core', async (original) => ({
  ...(await original<typeof Core>()),
  runProcess: (_command: string, args: string[]) => {
    if (!state.available) return Promise.reject(new Error('missing OCR'));
    return Promise.resolve(
      args.includes('--list-langs')
        ? `List of available languages in "${state.models}" (1):\neng`
        : state.version,
    );
  },
}));
vi.mock('@repro/render', () => ({
  enforceOcrAudit: async ({ path }: { path: string }) => {
    state.audits++;
    if (!state.available) throw new Error('Required OCR is missing');
    const sha256 = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    await writeFile(
      `${path}.audit.json`,
      JSON.stringify({ sha256, passed: true, source: 'frame-ocr' }),
    );
  },
}));
import { packageCommand } from './package.js';

it('synthetic package transport reuses only intact outputs with current inputs, tools and policy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-export-cache-'));
  try {
    const viewer = join(root, 'viewer'),
      out = join(root, 'bundle'),
      source = join(root, 'proof.png');
    state.models = join(root, 'models');
    await mkdir(state.models);
    await writeFile(join(state.models, 'eng.traineddata'), 'synthetic model');
    await mkdir(viewer);
    await writeFile(join(viewer, 'index.html'), 'viewer');
    await writeFile(source, 'synthetic safe media');
    const options = {
      outDir: out,
      viewerDir: viewer,
      assets: [{ kind: 'png' as const, path: source }],
    };
    state.audits = 0;
    state.available = true;
    state.version = 'one';
    expect((await packageCommand(options)).cacheHit).toBe(false);
    expect((await packageCommand(options)).cacheHit).toBe(true);
    expect(state.audits).toBe(1);
    const manifest = JSON.parse(
      await readFile(join(out, 'evidence-manifest.json'), 'utf8'),
    ) as EvidenceManifest;
    await writeFile(
      join(out, manifest.assets[0]?.href ?? 'missing'),
      'corrupt',
    );
    expect((await packageCommand(options)).cacheHit).toBe(false);
    await rm(join(out, `${manifest.assets[0]?.href ?? 'missing'}.audit.json`));
    expect((await packageCommand(options)).cacheHit).toBe(false);
    await writeFile(join(out, 'unexpected.txt'), 'raw diagnostics');
    expect((await packageCommand(options)).cacheHit).toBe(false);
    await writeFile(source, 'changed safe media');
    expect((await packageCommand(options)).cacheHit).toBe(false);
    await writeFile(join(state.models, 'eng.traineddata'), 'changed model');
    expect((await packageCommand(options)).cacheHit).toBe(false);
    state.version = 'two';
    expect((await packageCommand(options)).cacheHit).toBe(false);
    await writeFile(join(viewer, 'index.html'), 'changed viewer');
    expect((await packageCommand(options)).cacheHit).toBe(false);
    expect(
      (
        await packageCommand({
          ...options,
          privacyPatterns: ['private marker'],
        })
      ).cacheHit,
    ).toBe(false);
    state.available = false;
    await expect(packageCommand(options)).rejects.toThrow('OCR is missing');
  } finally {
    state.available = true;
    await rm(root, { recursive: true, force: true });
  }
});
