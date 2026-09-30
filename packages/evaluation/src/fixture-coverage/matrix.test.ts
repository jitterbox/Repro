import { dirname, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluateCoverage, loadCoverageMatrix } from './matrix.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../..');

describe('design-language coverage matrix', () => {
  it('loads the canonical matrix', async () => {
    const matrix = await loadCoverageMatrix();
    expect(matrix.minInstances).toBe(2);
    expect(matrix.overlayKit.length).toBeGreaterThanOrEqual(15);
    expect(matrix.compareLayouts).toEqual(['side-by-side']);
    expect(
      matrix.overlayKit.every((row) => row.renderer === 'event-plan'),
    ).toBe(true);
  });

  it('evaluates fixture corpus without throwing', async () => {
    const report = await evaluateCoverage({
      fixtureRoot: join(REPO, '.repro/fixture-videos'),
    });
    expect(report.overlay.length).toBeGreaterThan(0);
    expect(report.compare.length).toBe(1);
  });

  it('counts unique scene output with complete pane mapping, not old filenames or missing files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'repro-coverage-'));
    try {
      const matrix = await loadCoverageMatrix();
      const outputPath = join(root, 'proof.mp4');
      const frameMap = join(root, 'frames.json');
      await writeFile(
        outputPath,
        'Media existence is checked; pixels have separate gates.',
      );
      await writeFile(join(root, 'onion_compare.mp4'), 'retired filename');
      const receipt = { renderer: 'hyperframes', frameCount: 1 };
      for (const name of ['one', 'duplicate']) {
        await mkdir(join(root, name));
        await writeFile(
          join(root, name, 'scene-comparison.json'),
          JSON.stringify({ outputPath, frameMap, receipt }),
        );
      }
      const compare = async () =>
        (await evaluateCoverage({ fixtureRoot: root, matrix })).compare;
      expect((await compare())[0]?.found).toBe(0);
      await writeFile(frameMap, JSON.stringify([{ a: {} }]));
      expect((await compare())[0]?.found).toBe(0);
      await writeFile(frameMap, JSON.stringify([{ a: {}, b: {} }]));
      expect((await compare())[0]?.found).toBe(1);
      const unsupported = await evaluateCoverage({
        fixtureRoot: root,
        matrix: { ...matrix, compareLayouts: ['onion'] },
      });
      expect(unsupported.compare[0]?.found).toBe(0);
      await rm(outputPath);
      expect((await compare())[0]?.found).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
