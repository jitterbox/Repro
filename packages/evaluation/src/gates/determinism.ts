import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { runProcess } from '@repro/core';
import { readdir } from 'node:fs/promises';
import type { GateResult } from '../types/gate.js';
export interface DeterminismGateInput {
  readonly timelinePath?: string | undefined;
  readonly baselineTimelinePath?: string | undefined;
  readonly videoPath?: string | undefined;
  readonly baselineVideoPath?: string | undefined;
}
export function compareDecodedPng(a: Buffer, b: Buffer) {
  const left = PNG.sync.read(a),
    right = PNG.sync.read(b);
  if (left.width !== right.width || left.height !== right.height)
    throw new Error('Image dimensions differ');
  const diff = new PNG({ width: left.width, height: left.height });
  const changed = pixelmatch(
    left.data,
    right.data,
    diff.data,
    left.width,
    left.height,
    { threshold: 0.1, includeAA: true },
  );
  return {
    changed,
    total: left.width * left.height,
    ratio: changed / (left.width * left.height),
    diff: PNG.sync.write(diff),
  };
}
export async function checkDeterminism(
  input: DeterminismGateInput,
): Promise<GateResult> {
  const name = 'determinism';
  const details: Record<string, unknown> = {};
  if (input.timelinePath && input.baselineTimelinePath) {
    details.timelineByteIdentical = (await readFile(input.timelinePath)).equals(
      await readFile(input.baselineTimelinePath),
    );
    if (!details.timelineByteIdentical)
      return {
        name,
        pass: false,
        status: 'failed',
        message: 'Timeline differs from baseline',
        details,
      };
  }
  if (input.videoPath && input.baselineVideoPath) {
    const root = await mkdtemp(join(tmpdir(), 'repro-pixels-'));
    try {
      const extract = async (path: string, prefix: string) => {
        await runProcess('ffmpeg', [
          '-v',
          'error',
          '-y',
          '-i',
          path,
          '-vf',
          'fps=1',
          join(root, `${prefix}-%06d.png`),
        ]);
        return (await readdir(root)).filter((p) => p.startsWith(prefix)).sort();
      };
      const a = await extract(input.videoPath, 'a'),
        b = await extract(input.baselineVideoPath, 'b');
      if (!a.length || a.length !== b.length)
        return {
          name,
          pass: false,
          status: 'failed',
          message: 'Missing frames or unequal durations',
        };
      let maxRatio = 0;
      for (let i = 0; i < a.length; i++) {
        const result = compareDecodedPng(
          await readFile(join(root, requireValue(a[i]))),
          await readFile(join(root, requireValue(b[i]))),
        );
        maxRatio = Math.max(maxRatio, result.ratio);
      }
      details.maxChangedPixelRatio = maxRatio;
      details.sampledFrames = a.length;
      details.measurement = 'decoded-rgba-pixelmatch';
      return {
        name,
        pass: maxRatio === 0,
        status: maxRatio === 0 ? 'passed' : 'failed',
        message:
          maxRatio === 0 ? 'Decoded frames match' : 'Decoded frames differ',
        details,
      };
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  if (!('timelineByteIdentical' in details))
    return {
      name,
      pass: false,
      status: 'skipped',
      message: 'No baseline evidence supplied',
      details,
    };
  return {
    name,
    pass: true,
    status: 'passed',
    message: 'Timelines match',
    details,
  };
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
