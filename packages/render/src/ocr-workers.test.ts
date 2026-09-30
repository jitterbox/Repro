import type * as Core from '@jitterbox/repro-core';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  active: 0,
  peak: 0,
  calls: [] as string[],
  fail: false,
  model: '',
}));
vi.mock('@jitterbox/repro-core', async (original) => ({
  ...(await original<typeof Core>()),
  runProcess: async (_command: string, args: string[]) => {
    if (args[0] === '--version') return 'tesseract test';
    if (args[0] === '--list-langs')
      return `List of available languages in "${state.model}"`;
    const paths = (await readFile(args[0] ?? '', 'utf8')).trim().split('\n');
    const values = await Promise.all(paths.map((p) => readFile(p, 'utf8')));
    state.calls.push(args[5] ?? '');
    state.peak = Math.max(state.peak, ++state.active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (state.fail && values.includes('8'))
        throw new Error('OCR worker failed');
      const rows = [
        'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      ];
      values.forEach((value, i) => {
        rows.push(`1\t${i + 1}\t0\t0\t0\t0\t0\t0\t800\t600\t-1\t`);
        rows.push(
          `5\t${i + 1}\t1\t1\t1\t1\t10\t10\t200\t20\t95\t${value === '1' ? 'PRIVATE PHRASE' : 'safe'}`,
        );
      });
      await writeFile(`${args[1]}.tsv`, rows.join('\n'));
      return '';
    } finally {
      state.active--;
    }
  },
}));
import { TesseractOcrAdapter } from './redaction.js';

it('batches both OCR modes, drains failures, and reuses exact frames only under the same policy and model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-ocr-workers-'));
  try {
    state.model = root;
    await writeFile(join(root, 'eng.traineddata'), 'model');
    const paths = Array.from({ length: 19 }, (_, i) => join(root, `${i}.png`));
    for (const [i, path] of paths.entries())
      await writeFile(path, String(i === 18 ? 1 : i));
    const input = {
      frameDir: root,
      framePaths: paths,
      videoPath: '',
      sidecarPath: '',
      patterns: ['PRIVATE PHRASE'],
      cacheDir: join(root, 'cache'),
    };
    state.fail = true;
    state.calls = [];
    state.peak = 0;
    await expect(new TesseractOcrAdapter(1).scan(input)).rejects.toThrow(
      'OCR worker failed',
    );
    expect(state.active).toBe(0);
    state.fail = false;
    state.calls = [];
    const result = await new TesseractOcrAdapter(2).scan(input);
    expect(result.audited).toBe(true);
    expect(result.framesScanned).toBe(19);
    expect(result.stats).toMatchObject({ cacheHits: 8, scannedFrames: 10 });
    expect(state.calls.sort()).toEqual(['11', '11', '3', '3']);
    expect(state.peak).toBe(2);
    expect(result.hits).toContainEqual(
      expect.objectContaining({
        text: 'PRIVATE PHRASE',
        mode: '3',
        frame: 1,
        occurrences: [1, 18],
      }),
    );
    state.calls = [];
    expect(
      (await new TesseractOcrAdapter(2).scan(input)).stats?.cacheHits,
    ).toBe(18);
    expect(state.calls).toHaveLength(0);
    const namespace = (await readdir(input.cacheDir))[0];
    assert.ok(namespace);
    const entry = (await readdir(join(input.cacheDir, namespace)))[0];
    assert.ok(entry);
    await writeFile(join(input.cacheDir, namespace, entry), '{broken');
    expect(
      (await new TesseractOcrAdapter(2).scan(input)).stats?.scannedFrames,
    ).toBe(1);
    expect(
      (
        await new TesseractOcrAdapter(2).scan({
          ...input,
          patterns: ['different'],
        })
      ).stats?.scannedFrames,
    ).toBe(18);
    await writeFile(join(root, 'eng.traineddata'), 'new-model');
    expect(
      (await new TesseractOcrAdapter(2).scan(input)).stats?.scannedFrames,
    ).toBe(18);
    expect(() => new TesseractOcrAdapter(9)).toThrow('between 1 and 8');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
