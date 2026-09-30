import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
const audit = vi.hoisted(() => vi.fn());
vi.mock('@jitterbox/repro-render', () => ({ enforceOcrAudit: audit }));
import { packageCommand } from './package.js';

it('audits a private snapshot even if the original changes during the audit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-snapshot-'));
  try {
    const viewer = join(root, 'viewer');
    await mkdir(viewer);
    const source = join(root, 'proof.mp4');
    await writeFile(source, 'synthetic safe media');
    audit.mockImplementation(async ({ path }: { path: string }) => {
      expect(path).not.toBe(source);
      const sha256 = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
      await writeFile(source, 'repro-canary-secret-new-content');
      await writeFile(
        `${path}.audit.json`,
        JSON.stringify({ sha256, passed: true, source: 'frame-ocr' }),
      );
    });
    const result = await packageCommand({
      viewerDir: viewer,
      outDir: join(root, 'bundle'),
      assets: [{ kind: 'mp4', path: source }],
    });
    const asset = result.manifest.assets[0];
    expect(asset).toBeDefined();
    if (!asset) throw new Error('Missing exported asset');
    expect(await readFile(join(root, 'bundle', asset.href), 'utf8')).toBe(
      'synthetic safe media',
    );
    expect(asset.sha256).toBe(
      createHash('sha256').update('synthetic safe media').digest('hex'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('rejects a stale audit receipt without replacing an existing package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-stale-audit-'));
  try {
    const viewer = join(root, 'viewer'),
      out = join(root, 'bundle');
    await mkdir(viewer);
    await mkdir(out);
    await writeFile(join(out, 'evidence-manifest.json'), 'previous');
    const source = join(root, 'proof.png');
    await writeFile(source, 'synthetic media');
    audit.mockImplementation(async ({ path }: { path: string }) => {
      await writeFile(
        `${path}.audit.json`,
        JSON.stringify({ sha256: 'stale', passed: true, source: 'frame-ocr' }),
      );
    });
    await expect(
      packageCommand({
        viewerDir: viewer,
        outDir: out,
        assets: [{ kind: 'png', path: source }],
      }),
    ).rejects.toThrow('Audit receipt does not match');
    expect(await readFile(join(out, 'evidence-manifest.json'), 'utf8')).toBe(
      'previous',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('rejects private manifest captions before publishing any package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-private-caption-'));
  try {
    const viewer = join(root, 'viewer');
    await mkdir(viewer);
    await expect(
      packageCommand({
        viewerDir: viewer,
        outDir: join(root, 'bundle'),
        privacyPatterns: ['private-canary'],
        assets: [
          {
            kind: 'png',
            path: join(root, 'unused.png'),
            title: 'private-canary',
          },
        ],
      }),
    ).rejects.toThrow('Sensitive text');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('retains private failure diagnostics after temporary export staging is removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-failed-audit-'));
  try {
    const viewer = join(root, 'viewer'),
      out = join(root, 'bundle');
    await mkdir(viewer);
    const source = join(root, 'proof.png');
    await writeFile(source, 'synthetic media');
    audit.mockImplementation(
      async ({ diagnosticsDir }: { diagnosticsDir: string }) => {
        expect(diagnosticsDir).toBe(`${out}.audit`);
        await mkdir(diagnosticsDir, { recursive: true });
        await writeFile(
          join(diagnosticsDir, 'report.json'),
          '{"passed":false}',
        );
        throw new Error('Strict audit blocked export');
      },
    );
    await expect(
      packageCommand({
        viewerDir: viewer,
        outDir: out,
        assets: [{ kind: 'png', path: source }],
      }),
    ).rejects.toThrow('Strict audit blocked');
    expect(
      JSON.parse(await readFile(`${out}.audit/report.json`, 'utf8')),
    ).toEqual({ passed: false });
    await expect(
      readFile(join(out, 'evidence-manifest.json')),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
