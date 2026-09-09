import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { cardCacheKey, closeCompositor, renderCards } from './render.js';
import type { CardSpec } from './types.js';

const slateCard: CardSpec = {
  id: 'slate-1',
  kind: 'slate',
  props: {
    schemaVersion: '1.0.0',
    mode: 'repro',
    bugId: 'BUG-1001',
    title: 'Save button misaligned',
    browser: 'Chromium 131',
    os: 'Linux',
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    appLabel: 'ShopLite Admin',
  },
};

describe('cardCacheKey', () => {
  it('hashes kind and props deterministically', () => {
    const keyA = cardCacheKey(slateCard);
    const keyB = cardCacheKey({ ...slateCard });
    expect(keyA).toBe(keyB);
    expect(keyA).toHaveLength(64);
  });

  it('includes font and browser identity', () => {
    expect(cardCacheKey(slateCard, { fonts: 'first' })).not.toBe(
      cardCacheKey(slateCard, { fonts: 'second' }),
    );
  });

  it('changes when props change', () => {
    const other: CardSpec = {
      ...slateCard,
      props: { ...slateCard.props, bugId: 'BUG-2002' },
    };
    expect(cardCacheKey(other)).not.toBe(cardCacheKey(slateCard));
  });
});

describe('renderCards', () => {
  let outDir = '';

  afterAll(async () => {
    await closeCompositor();
    if (outDir) {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('reuses cache entries for identical props', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'repro-compositor-'));
    const cards: CardSpec[] = [slateCard, { ...slateCard, id: 'slate-2' }];

    const first = await renderCards({ cards, outDir });
    const second = await renderCards({ cards, outDir });

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0]?.path).toBe(second[0]?.path);
    expect(first[1]?.path).toBe(first[0]?.path);
    expect(first[0]?.width).toBe(1280);
    expect(first[0]?.height).toBe(720);
  });

  it('repairs corrupt cached pixels and serves verified hits without launching a browser', async () => {
    if (!outDir) outDir = await mkdtemp(join(tmpdir(), 'repro-compositor-'));
    const first = await renderCards({ cards: [slateCard], outDir });
    const path = requireValue(first[0]).path;
    const original = await readFile(path);
    await writeFile(path, 'corrupted image');
    await renderCards({ cards: [slateCard], outDir });
    expect(await readFile(path)).toEqual(original);
    await closeCompositor();
    const launch = vi
      .spyOn(chromium, 'launch')
      .mockRejectedValue(new Error('A cache hit must not launch Chromium'));
    try {
      await renderCards({ cards: [slateCard], outDir });
      expect(launch).not.toHaveBeenCalled();
    } finally {
      launch.mockRestore();
    }
  });

  it('keeps simultaneous renders isolated on the shared page', async () => {
    if (!outDir) outDir = await mkdtemp(join(tmpdir(), 'repro-compositor-'));
    const other: CardSpec = {
      ...slateCard,
      id: 'other',
      props: { ...slateCard.props, title: 'Distinct scenario title' },
    };
    const expected = await renderCards({
      cards: [slateCard, other],
      outDir: join(outDir, 'reference'),
    });
    const actual = await Promise.all([
      renderCards({ cards: [slateCard], outDir: join(outDir, 'parallel') }),
      renderCards({ cards: [other], outDir: join(outDir, 'parallel') }),
    ]);
    for (let i = 0; i < 2; i++)
      expect(
        await readFile(requireValue(requireValue(actual[i])[0]).path),
      ).toEqual(await readFile(requireValue(expected[i]).path));
  });

  it('writes RGBA PNG when Chromium is available', async () => {
    if (!outDir) {
      outDir = await mkdtemp(join(tmpdir(), 'repro-compositor-'));
    }

    const toast: CardSpec = {
      id: 'toast-1',
      kind: 'console-toast',
      props: {
        level: 'error',
        message: 'TypeError: cannot read property',
        timestamp: '00:04.2',
      },
    };

    const results = await renderCards({
      cards: [toast],
      outDir,
    });

    expect(results[0]).toBeDefined();
    const png = await readFile(requireValue(results[0]).path);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  });
});

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}

it('MIX-PIXEL: compositor pixels obey planner placement at 1x and 2x, including long text', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'repro-placement-'));
  try {
    for (const scale of [1, 2]) {
      const placement = { x: 80, y: 100, width: 350, height: 60 };
      const cards: CardSpec[] = [
        {
          id: 'console',
          kind: 'console-toast',
          props: {
            level: 'error',
            message: 'WWWW '.repeat(100),
            timestamp: '00:01',
          },
          placement,
        },
        {
          id: 'vitals',
          kind: 'vitals-hud',
          props: { summary: 'CLS 0.12; INP 350 ms' },
          placement,
        },
      ];
      const rendered = await renderCards({
        cards: cards.map((card) => ({
          ...card,
          viewport: { width: 800, height: 600, deviceScaleFactor: scale },
        })),
        outDir,
      });
      for (const entry of rendered) {
        const bytes = execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            entry.path,
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgba',
            'pipe:1',
          ],
          { maxBuffer: 16 * 1024 * 1024 },
        );
        expect(bytes.length).toBe(800 * 600 * scale * scale * 4);
        let painted = 0,
          outside = 0;
        for (let y = 0; y < 600 * scale; y++)
          for (let x = 0; x < 800 * scale; x++) {
            if ((bytes[(y * 800 * scale + x) * 4 + 3] ?? 0) < 16) continue;
            painted++;
            if (
              x < placement.x * scale ||
              x >= (placement.x + placement.width) * scale ||
              y < placement.y * scale ||
              y >= (placement.y + placement.height) * scale
            )
              outside++;
          }
        expect(painted).toBeGreaterThan(1000 * scale * scale);
        expect(outside).toBe(0);
      }
    }
  } finally {
    await closeCompositor();
    await rm(outDir, { recursive: true, force: true });
  }
}, 30000);

it('TEXT-OUTCOME: long expected and actual text remain separately visible', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'repro-outcome-text-'));
  try {
    const [result] = await renderCards({
      outDir,
      cards: [
        {
          id: 'long-outcome',
          kind: 'outcome-pair',
          props: {
            expected: 'EXPECTED DETAIL ' + 'W'.repeat(500),
            actual: 'ACTUAL DETAIL ' + 'i'.repeat(500),
          },
          placement: { x: 24, y: 24, width: 520, height: 190 },
        },
      ],
    });
    if (!result) throw new Error('Missing outcome card');
    const text = execFileSync(
      'tesseract',
      [result.path, 'stdout', '--psm', '6'],
      { encoding: 'utf8' },
    );
    expect(text).toContain('EXPECTED');
    expect(text).toContain('ACTUAL');
  } finally {
    await closeCompositor();
    await rm(outDir, { recursive: true, force: true });
  }
}, 30000);
