import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractCroppedFrameAt, lumaStats } from '../frames.js';

import type { GateResult } from '../types/gate.js';
import type { PlanDocument } from './plan-types.js';

export interface OverlayPresenceGateInput {
  readonly plan?: PlanDocument | undefined;
  readonly videoPath?: string | undefined;
}

/** Dark plate / badge region mean luma expected under the burn-in theme. */
const MAX_PLATE_MEAN_LUMA = 110;

export async function checkOverlayPresence(
  input: OverlayPresenceGateInput,
): Promise<GateResult> {
  const name = 'overlay-presence';
  const count = input.plan?.annotations?.length ?? 0;

  if (count === 0) {
    return {
      name,
      pass: false,
      message: 'Zero visible overlays — reproduction evidence is empty',
      details: { annotationCount: 0 },
    };
  }

  if (input.videoPath === undefined) {
    return {
      name,
      pass: true,
      message: `${String(count)} annotation(s) present in plan`,
      details: { annotationCount: count, mode: 'plan-only' },
    };
  }

  const samples = sampleTargets(input.plan);
  if (samples.length === 0) {
    return {
      name,
      pass: true,
      message: `${String(count)} annotation(s); no croppable plate regions`,
      details: { annotationCount: count, mode: 'plan-only' },
    };
  }

  const dir = await mkdtemp(join(tmpdir(), 'repro-presence-'));
  try {
    const means: number[] = [];
    for (const [index, sample] of samples.entries()) {
      const cropPath = join(dir, `overlay-${String(index)}.jpg`);
      await extractCroppedFrameAt({
        videoPath: input.videoPath,
        timeMs: sample.timeMs,
        x: sample.x,
        y: sample.y,
        width: sample.width,
        height: sample.height,
        outPath: cropPath,
      });
      const stats = await lumaStats(cropPath);
      means.push(stats.mean);
    }

    const darkEnough = means.filter((mean) => mean <= MAX_PLATE_MEAN_LUMA);
    const pass = darkEnough.length > 0;
    return {
      name,
      pass,
      message: pass
        ? `Overlay pixels present in ${String(darkEnough.length)} crop(s)`
        : 'Planned overlay crops lack burn-in plate contrast in encoded video',
      details: {
        annotationCount: count,
        mode: 'pixel',
        means,
        threshold: MAX_PLATE_MEAN_LUMA,
      },
    };
  } catch (error) {
    return {
      name,
      pass: false,
      message: `Overlay pixel check failed: ${errorMessage(error)}`,
      details: { annotationCount: count, mode: 'pixel' },
    };
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function sampleTargets(plan: PlanDocument | undefined): readonly {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}[] {
  const annotations = plan?.annotations ?? [];
  return annotations.flatMap((annotation) => {
    const component = annotation.component;
    if (
      component !== 'step-badge' &&
      component !== 'plate' &&
      component !== 'callout' &&
      component !== 'console-toast' &&
      component !== 'pause-badge' &&
      component !== 'freeze-banner'
    ) {
      return [];
    }
    const bounds = annotation.bounds;
    const width = bounds?.width ?? bounds?.w ?? 0;
    const height = bounds?.height ?? bounds?.h ?? 0;
    if (bounds === undefined || width < 4 || height < 4) {
      return [];
    }
    const range = annotation.outTimeRange ?? annotation.timeRange;
    if (range === undefined) {
      return [];
    }
    return [
      {
        timeMs: Math.round((range.start + range.end) / 2),
        x: bounds.x,
        y: bounds.y,
        width,
        height,
      },
    ];
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
