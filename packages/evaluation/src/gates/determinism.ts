import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { extractContactSheet } from '../frames.js';

import type { GateResult } from '../types/gate.js';

export interface DeterminismGateInput {
  readonly timelinePath?: string | undefined;
  readonly baselineTimelinePath?: string | undefined;
  readonly videoPath?: string | undefined;
  readonly baselineVideoPath?: string | undefined;
}

export async function checkDeterminism(
  input: DeterminismGateInput,
): Promise<GateResult> {
  const name = 'determinism';
  const details: Record<string, unknown> = {};

  if (input.timelinePath && input.baselineTimelinePath) {
    const [current, baseline] = await Promise.all([
      readFile(input.timelinePath),
      readFile(input.baselineTimelinePath),
    ]);
    const timelineIdentical = current.equals(baseline);
    details.timelineByteIdentical = timelineIdentical;
    if (!timelineIdentical) {
      return {
        name,
        pass: false,
        message: 'timeline.json is not byte-identical to baseline',
        details,
      };
    }
  }

  if (input.videoPath && input.baselineVideoPath) {
    const phashDistance = await contactSheetDistance(
      input.videoPath,
      input.baselineVideoPath,
    );
    details.phashDistance = phashDistance;
    details.phashStub = true;
    if (phashDistance > 2) {
      return {
        name,
        pass: false,
        message: `Contact-sheet hash distance ${phashDistance} exceeds stub threshold 2`,
        details,
      };
    }
  }

  if (!details.timelineByteIdentical && details.phashDistance === undefined) {
    return {
      name,
      pass: true,
      message: 'Determinism gate skipped without baseline artifacts',
      details: { skipped: true },
    };
  }

  return {
    name,
    pass: true,
    message: 'Determinism checks passed',
    details,
  };
}

async function contactSheetDistance(
  videoPath: string,
  baselineVideoPath: string,
): Promise<number> {
  const [dirA, dirB] = await Promise.all([
    mkdtemp(join(tmpdir(), 'repro-det-a-')),
    mkdtemp(join(tmpdir(), 'repro-det-b-')),
  ]);
  const [framesA, framesB, statsA, statsB] = await Promise.all([
    extractContactSheet(videoPath, dirA, 1),
    extractContactSheet(baselineVideoPath, dirB, 1),
    stat(videoPath),
    stat(baselineVideoPath),
  ]);

  const hashA = createHash('sha256')
    .update(String(statsA.size))
    .update(String(statsA.mtimeMs))
    .update(framesA.join('|'))
    .digest('hex');
  const hashB = createHash('sha256')
    .update(String(statsB.size))
    .update(String(statsB.mtimeMs))
    .update(framesB.join('|'))
    .digest('hex');

  if (hashA === hashB) {
    return 0;
  }

  let distance = 0;
  for (let index = 0; index < hashA.length; index += 8) {
    if (hashA.slice(index, index + 8) !== hashB.slice(index, index + 8)) {
      distance += 1;
    }
  }
  return distance;
}
