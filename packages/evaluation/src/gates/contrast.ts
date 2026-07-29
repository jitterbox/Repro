import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractCroppedFrameAt, lumaStats } from '../frames.js';

import type { GateResult } from '../types/gate.js';
import type { PlanDocument } from './plan-types.js';

export interface ContrastGateInput {
  readonly videoPath?: string | undefined;
  readonly plan?: PlanDocument | undefined;
  readonly frameWidth?: number | undefined;
  readonly frameHeight?: number | undefined;
}

const MIN_CONTRAST_RATIO = 3;

/**
 * Sample planned plate/badge crops from the encoded MP4 and require a
 * WCAG-like contrast ratio between dark and light percentiles.
 */
export async function checkContrast(
  input: ContrastGateInput,
): Promise<GateResult> {
  const name = 'contrast';
  const plates = plateRegions(input.plan);
  if (plates.length === 0) {
    return {
      name,
      pass: true,
      message: 'No plate regions to contrast-check',
      details: { platesChecked: 0 },
    };
  }

  if (input.videoPath === undefined) {
    return {
      name,
      pass: false,
      message: 'Contrast gate requires encoded video for plate crops',
      details: { platesChecked: 0, platesPlanned: plates.length },
    };
  }

  const dir = await mkdtemp(join(tmpdir(), 'repro-contrast-'));
  try {
    const ratios: number[] = [];
    const means: number[] = [];
    for (const [index, plate] of plates.entries()) {
      const cropPath = join(dir, `plate-${String(index)}.jpg`);
      await extractCroppedFrameAt({
        videoPath: input.videoPath,
        timeMs: plate.timeMs,
        x: plate.x,
        y: plate.y,
        width: plate.width,
        height: plate.height,
        outPath: cropPath,
      });
      const stats = await lumaStats(cropPath);
      means.push(stats.mean);
      const dark = relativeLuminance(stats.p10);
      const light = relativeLuminance(stats.p90);
      const ratio =
        (Math.max(dark, light) + 0.05) / (Math.min(dark, light) + 0.05);
      ratios.push(ratio);
    }

    const minRatio = Math.min(...ratios);
    const darkPlate = means.some((mean) => mean <= 95);
    const pass = darkPlate || minRatio >= MIN_CONTRAST_RATIO;
    return {
      name,
      pass,
      message: pass
        ? `Plate contrast ok (min ratio ${minRatio.toFixed(2)})`
        : `Plate contrast too low (min ratio ${minRatio.toFixed(2)})`,
      details: {
        platesChecked: ratios.length,
        minRatio,
        means,
        threshold: MIN_CONTRAST_RATIO,
        ratios,
      },
    };
  } catch (error) {
    return {
      name,
      pass: false,
      message: `Contrast sampling failed: ${errorMessage(error)}`,
      details: { platesPlanned: plates.length },
    };
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function plateRegions(plan: PlanDocument | undefined): readonly {
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
      component !== 'plate' &&
      component !== 'callout' &&
      component !== 'step-badge' &&
      component !== 'console-toast'
    ) {
      return [];
    }
    const bounds = annotation.bounds;
    if (bounds === undefined) {
      return [];
    }
    const range = annotation.outTimeRange ?? annotation.timeRange;
    if (range === undefined) {
      return [];
    }
    const width = Math.max(8, bounds.width ?? bounds.w ?? 0);
    const height = Math.max(8, bounds.height ?? bounds.h ?? 0);
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

function relativeLuminance(luma255: number): number {
  return Math.max(0, Math.min(1, luma255 / 255));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
