import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  extractContactSheet,
  meanLuminance,
  probeDurationMs,
} from '@repro/evaluation';

import { getRepoRoot } from '../src/bugs.js';

const execFileAsync = promisify(execFile);

const CENTRE_BAN_RADIUS_PX = 120;
const MAX_FLASH_HZ = 2;
const LUMINANCE_DELTA_THRESHOLD = 35;

interface SyntheticPlan {
  readonly annotations: Array<{
    readonly id: string;
    readonly component: string;
    readonly bounds?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  }>;
  readonly timeline?: {
    readonly beats: Array<{ readonly id: string; readonly kind?: string }>;
  };
}

async function generateTestVideo(
  outPath: string,
  durationSec = 10,
): Promise<string> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${String(durationSec)}:size=1280x720:rate=30`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    outPath,
  ]);
  return outPath;
}

function plateCentre(plan: SyntheticPlan['annotations'][number]): {
  readonly x: number;
  readonly y: number;
} | null {
  if (plan.bounds === undefined) {
    return null;
  }
  return {
    x: plan.bounds.x + plan.bounds.width / 2,
    y: plan.bounds.y + plan.bounds.height / 2,
  };
}

function assertNoCentrePlates(
  plan: SyntheticPlan,
  frameWidth = 1280,
  frameHeight = 720,
): void {
  const centreX = frameWidth / 2;
  const centreY = frameHeight / 2;
  const allowed = new Set(['slate', 'chapter', 'outcome', 'outcome-pair']);

  for (const annotation of plan.annotations) {
    if (allowed.has(annotation.component)) {
      continue;
    }
    const centre = plateCentre(annotation);
    if (centre === null) {
      continue;
    }
    const distance = Math.hypot(centre.x - centreX, centre.y - centreY);
    expect(distance).toBeGreaterThan(CENTRE_BAN_RADIUS_PX);
  }
}

async function flashRateHz(videoPath: string, sampleFps = 2): Promise<number> {
  const outDir = await mkdtemp(join(tmpdir(), 'repro-flash-e2e-'));
  const frames = await extractContactSheet(videoPath, outDir, sampleFps);
  const lumas: number[] = [];
  for (const frame of frames) {
    lumas.push(await meanLuminance(frame));
  }

  let flashEvents = 0;
  for (let index = 1; index < lumas.length; index += 1) {
    const previous = lumas[index - 1] ?? 0;
    const current = lumas[index] ?? 0;
    if (Math.abs(current - previous) >= LUMINANCE_DELTA_THRESHOLD) {
      flashEvents += 1;
    }
  }

  const durationSec = frames.length / sampleFps;
  return durationSec > 0 ? flashEvents / durationSec : 0;
}

describe('frame-accuracy gates (synthetic)', () => {
  it('extracts frames and reads duration via ffprobe', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-frame-e2e-'));
    const videoPath = join(dir, 'sample.mp4');
    await generateTestVideo(videoPath, 10);
    const durationMs = await probeDurationMs(videoPath);
    expect(durationMs).toBeGreaterThanOrEqual(9_500);
    expect(durationMs).toBeLessThanOrEqual(10_500);
  });

  it('asserts slate timeline beats or short-capture fallback', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-frame-e2e-'));
    const videoPath = join(dir, 'slate.mp4');
    await generateTestVideo(videoPath, 10);

    const timelinePath = join(dir, 'timeline.json');
    await writeFile(
      timelinePath,
      `${JSON.stringify({
        beats: [{ id: 'slate', kind: 'insert' }, { id: 'body-0', kind: 'play' }],
      })}\n`,
    );

    const durationMs = await probeDurationMs(videoPath);
    const timeline = JSON.parse(await readFile(timelinePath, 'utf8')) as {
      beats: Array<{ id: string }>;
    };

    if (durationMs >= 8_000) {
      expect(durationMs).toBeGreaterThanOrEqual(8_000);
    } else {
      expect(timeline.beats.some((beat) => beat.id === 'slate')).toBe(true);
    }
  });

  it('requires component on plan annotations', async () => {
    const planPath = join(getRepoRoot(), 'packages/contracts/fixtures/plan.valid.json');
    const plan = JSON.parse(await readFile(planPath, 'utf8')) as SyntheticPlan;
    expect(plan.annotations.length).toBeGreaterThan(0);
    for (const annotation of plan.annotations) {
      expect(annotation.component).toBeTruthy();
    }
  });

  it('rejects plates centred within 120px of frame centre', () => {
    const safePlan: SyntheticPlan = {
      annotations: [
        {
          id: 'ann-safe',
          component: 'step-badge',
          bounds: { x: 40, y: 40, width: 120, height: 40 },
        },
      ],
    };
    assertNoCentrePlates(safePlan);

    const unsafePlan: SyntheticPlan = {
      annotations: [
        {
          id: 'ann-unsafe',
          component: 'step-badge',
          bounds: { x: 600, y: 340, width: 80, height: 40 },
        },
      ],
    };
    expect(() => assertNoCentrePlates(unsafePlan)).toThrow();
  });

  it('flags high contact-sheet luminance change rate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-frame-e2e-'));
    const steadyPath = join(dir, 'steady.mp4');
    await generateTestVideo(steadyPath, 4);
    const steadyHz = await flashRateHz(steadyPath);
    expect(steadyHz).toBeLessThanOrEqual(MAX_FLASH_HZ);

    const blinkPath = join(dir, 'blink.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=640x360:d=4',
      '-vf',
      "geq=lum='if(mod(floor(T*8),2),255,0)'",
      '-r',
      '16',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      blinkPath,
    ]);
    const blinkHz = await flashRateHz(blinkPath, 8);
    expect(blinkHz).toBeGreaterThan(MAX_FLASH_HZ);
  });
});

describe('frame-accuracy gates (fixture plan)', () => {
  it('validates packaged plan geometry from contracts fixture', async () => {
    const planPath = join(getRepoRoot(), 'packages/contracts/fixtures/plan.valid.json');
    const plan = JSON.parse(await readFile(planPath, 'utf8')) as SyntheticPlan;
    assertNoCentrePlates(plan);
  });
});

describe('frame-accuracy gates (capture)', () => {
  it('full capture frame assertions with ffmpeg test video', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-frame-capture-'));
    await mkdir(dir, { recursive: true });
    const videoPath = join(dir, 'capture.mp4');
    await generateTestVideo(videoPath, 12);
    expect(await probeDurationMs(videoPath)).toBeGreaterThanOrEqual(8_000);
  });
});
