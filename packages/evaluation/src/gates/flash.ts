import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { extractContactSheet, meanLuminance } from '../frames.js';

import type { GateResult } from '../types/gate.js';

const MAX_FLASH_HZ = 2;
const LUMINANCE_DELTA_THRESHOLD = 35;

export interface FlashGateInput {
  readonly videoPath?: string | undefined;
  readonly sampleFps?: number | undefined;
}

export async function checkFlash(input: FlashGateInput): Promise<GateResult> {
  const name = 'flash';

  if (!input.videoPath) {
    return {
      name,
      pass: true,
      message: 'Flash gate skipped without video',
      details: { skipped: true },
    };
  }

  const sampleFps = input.sampleFps ?? 2;
  const outDir = await mkdtemp(join(tmpdir(), 'repro-flash-'));
  const frames = await extractContactSheet(input.videoPath, outDir, sampleFps);

  if (frames.length < 2) {
    return {
      name,
      pass: true,
      message: 'Insufficient contact-sheet frames for flash analysis',
      details: { frameCount: frames.length },
    };
  }

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
  const flashHz = durationSec > 0 ? flashEvents / durationSec : 0;

  if (flashHz > MAX_FLASH_HZ) {
    return {
      name,
      pass: false,
      message: `Luminance flash rate ${flashHz.toFixed(2)}Hz exceeds ${MAX_FLASH_HZ}Hz`,
      details: { flashHz, flashEvents, durationSec, sampleFps },
    };
  }

  return {
    name,
    pass: true,
    message: `Luminance flash rate ${flashHz.toFixed(2)}Hz within limit`,
    details: { flashHz, flashEvents, durationSec, sampleFps },
  };
}
