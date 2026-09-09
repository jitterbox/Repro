import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  capabilities,
  describeCapability,
  validateEvidence,
} from '@repro/contracts';
import { runProcess } from '@repro/core';
export { capabilities, describeCapability, validateEvidence };
export const recipes = ['interaction', 'geometry', 'transient'].map((kind) =>
  validateEvidence({
    schemaVersion: '1.0.0',
    id: kind,
    title:
      kind === 'interaction'
        ? 'Checkout accepts the intended pointer action'
        : kind === 'geometry'
          ? 'Content keeps its horizontal position while loading'
          : 'Loading transition preserves the expected content',
    variant: { id: 'before', role: 'before', label: 'Before' },
    claim:
      kind === 'interaction'
        ? 'An invisible overlay intercepts Checkout before the fix; the intended click opens Checkout after it'
        : kind === 'geometry'
          ? 'Loading shifts the content before the fix and preserves its measured starting position after it'
          : 'Loading briefly flashes red before the fix and preserves green content after it',
    expected:
      kind === 'interaction'
        ? 'Clicking Checkout opens Checkout'
        : kind === 'geometry'
          ? 'Content has the same measured x coordinate before and after Load'
          : 'Content never flashes red during loading',
    targets: [
      {
        id: 'target',
        description:
          kind === 'interaction'
            ? 'Checkout button'
            : 'The content panel below Load',
      },
    ],
    steps: [
      {
        id: 'prepare',
        title:
          kind === 'interaction' ? 'Open the cart' : 'Open the content panel',
      },
      {
        id: 'trigger',
        title:
          kind === 'interaction'
            ? 'Click Checkout'
            : 'Load and observe the transition',
        trigger: true,
      },
      {
        id: 'verify',
        title:
          kind === 'interaction'
            ? 'Verify the Checkout heading'
            : kind === 'geometry'
              ? 'Verify the original horizontal position'
              : 'Verify no flash occurred',
      },
    ],
    segments:
      kind === 'transient'
        ? [{ id: 'loading', title: 'Load through completion', step: 'trigger' }]
        : [],
    checkpoints: [
      ...(kind === 'transient'
        ? [
            {
              id: 'during',
              step: 'trigger',
              title: 'Content 100 ms after Load',
              observations: ['screenshot'],
              timing: 'transient',
              frame: {
                segment: 'loading',
                event: {
                  kind: 'probe.pointer:path',
                  match: { phase: 'pointerdown' },
                  occurrence: 0,
                },
                offsetMs: 100,
                maxOffsetMs: 2000 / 30,
              },
            },
          ]
        : []),
      {
        id: 'result',
        step: 'verify',
        title:
          kind === 'interaction'
            ? 'Checkout result after the click'
            : 'Completed loading',
        targets: ['target'],
        observations: [
          'screenshot',
          'bounds',
          'assertion',
          ...(kind === 'interaction' ? ['hit-test'] : []),
        ],
        timing: 'stable',
      },
    ],
    outputs: ['png', 'mp4', 'review'],
    privacy: { strict: true, selectors: [], patterns: [] },
  }),
);
export async function doctor() {
  const checks = await Promise.all([
    check('chromium', async () => {
      await access(chromium.executablePath());
      return chromium.executablePath();
    }),
    check('ffmpeg', () => runProcess('ffmpeg', ['-version'])),
    check('ffprobe', () => runProcess('ffprobe', ['-version'])),
    check('filters', async () => {
      const filters = await runProcess('ffmpeg', ['-hide_banner', '-filters']);
      for (const name of [
        'overlay',
        'subtitles',
        'fps',
        'crop',
        'scale',
        'interleave',
        'drawbox',
      ])
        if (!new RegExp(`\\b${name}\\b`).test(filters))
          throw new Error(`Missing ${name} filter`);
      return 'overlay, subtitles, fps, crop, scale, interleave, drawbox';
    }),
    check('fonts', () => runProcess('fc-match', ['sans-serif'])),
    check('ocr', () => runProcess('tesseract', ['--version'])),
  ]);
  return {
    checks,
    backends: {
      cdp: 'implemented',
      native: 'unavailable-experiment',
      os: 'unsupported',
    },
    strictExportAvailable: checks.some(
      (c) => c.name === 'ocr' && c.status === 'passed',
    ),
  };
}
async function check(name: string, work: () => Promise<string>) {
  try {
    return { name, status: 'passed', detail: (await work()).split('\n')[0] };
  } catch (error) {
    return {
      name,
      status: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
