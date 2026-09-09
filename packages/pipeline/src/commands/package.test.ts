import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { packageCommand } from './package.js';
it('keeps a previously valid bundle untouched when a later text audit fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-package-'));
  try {
    const out = join(root, 'bundle'),
      viewer = join(root, 'viewer');
    await mkdir(out);
    await mkdir(viewer);
    await writeFile(join(out, 'evidence-manifest.json'), 'previous bundle');
    const captions = join(root, 'captions.vtt');
    await writeFile(captions, 'WEBVTT\n\nsecret-test-value');
    await expect(
      packageCommand({
        outDir: out,
        viewerDir: viewer,
        privacyPatterns: ['secret-test-value'],
        assets: [{ kind: 'vtt', path: captions }],
      }),
    ).rejects.toThrow('Sensitive text');
    expect(await readFile(join(out, 'evidence-manifest.json'), 'utf8')).toBe(
      'previous bundle',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('audits report text without interpreting fractional timing measurements as card numbers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-report-'));
  try {
    const viewer = join(root, 'viewer');
    await mkdir(viewer);
    const report = {
      schemaVersion: '1.0.0' as const,
      title: 'Checkout proof',
      variants: [
        {
          id: 'before',
          label: 'Before',
          role: 'before' as const,
          outcome: 'bug-reproduced' as const,
          expected: 'Checkout opens',
          durationMs: 1200.7262322812503,
        },
      ],
      chapters: [],
    };
    await expect(
      packageCommand({
        outDir: join(root, 'bundle'),
        viewerDir: viewer,
        report,
      }),
    ).resolves.toBeDefined();
    await expect(
      packageCommand({
        outDir: join(root, 'bundle'),
        viewerDir: viewer,
        report: { ...report, title: 'Account 4111 1111 1111 1111' },
      }),
    ).rejects.toThrow('Sensitive text');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
