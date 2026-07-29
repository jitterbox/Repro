import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { extractFrameAt } from '../frames.js';

import type { PlanDocument } from '../gates/plan-types.js';

export interface CueSample {
  readonly cueId: string;
  readonly atMs: number;
  readonly kind: 'start' | 'mid' | 'end' | 'regular' | 'slate' | 'final';
}

export interface ReviewStoryboardFrame {
  readonly cueId: string;
  readonly kind: CueSample['kind'];
  readonly atMs: number;
  readonly path: string;
}

/**
 * Build cue-aware sample times from a plan, then extract frames for review.
 * This is the Phase 0 review harness — not a substitute for pixel gates.
 */
export function cueSamplesFromPlan(
  plan: PlanDocument,
  durationMs: number,
): readonly CueSample[] {
  const samples: CueSample[] = [
    { atMs: 1_000, cueId: 'slate', kind: 'slate' },
  ];

  for (const annotation of plan.annotations ?? []) {
    const range = annotation.outTimeRange ?? annotation.timeRange;
    if (range === undefined) {
      continue;
    }
    const start = Math.max(0, range.start);
    const end = Math.max(start, range.end);
    const mid = Math.round((start + end) / 2);
    samples.push(
      { atMs: start + 50, cueId: annotation.id, kind: 'start' },
      { atMs: mid, cueId: annotation.id, kind: 'mid' },
      { atMs: Math.max(start, end - 50), cueId: annotation.id, kind: 'end' },
    );
  }

  for (let t = 0; t <= durationMs; t += 1_000) {
    samples.push({ atMs: t, cueId: `t-${String(t)}`, kind: 'regular' });
  }
  samples.push({
    atMs: Math.max(0, durationMs - 1),
    cueId: 'final',
    kind: 'final',
  });

  const seen = new Set<string>();
  return samples.filter((sample) => {
    const key = `${sample.cueId}:${String(sample.atMs)}:${sample.kind}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function extractCueStoryboard(input: {
  readonly videoPath: string;
  readonly plan: PlanDocument;
  readonly durationMs: number;
  readonly outDir: string;
}): Promise<readonly ReviewStoryboardFrame[]> {
  await mkdir(input.outDir, { recursive: true });
  const samples = cueSamplesFromPlan(input.plan, input.durationMs);
  const frames: ReviewStoryboardFrame[] = [];

  for (const [index, sample] of samples.entries()) {
    const path = join(
      input.outDir,
      `${String(index).padStart(3, '0')}-${sample.kind}-${sample.cueId}.jpg`,
    );
    try {
      await extractFrameAt(input.videoPath, sample.atMs, path);
      frames.push({
        atMs: sample.atMs,
        cueId: sample.cueId,
        kind: sample.kind,
        path,
      });
    } catch {
      // Skip undecodable timestamps rather than failing the whole review.
    }
  }

  return frames;
}
