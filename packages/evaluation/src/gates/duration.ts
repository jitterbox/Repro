import { probeDurationMs } from '../frames.js';

import type { GateResult, ReproMode } from '../types/gate.js';
import type { TimelineDocument } from './plan-types.js';

const HARD_MIN_MS = 8000;
const HARD_MAX_MS = 45000;
const FILED_MIN_MS = 15000;
const FILED_MAX_MS = 30000;

export interface DurationGateInput {
  readonly videoPath?: string | undefined;
  readonly timeline?: TimelineDocument | undefined;
  readonly mode?: ReproMode | undefined;
}

export async function checkDuration(
  input: DurationGateInput,
): Promise<GateResult> {
  const name = 'duration';
  const durationMs = await resolveDurationMs(input);

  if (durationMs === undefined) {
    return {
      name,
      pass: true,
      message: 'Duration not available; gate skipped',
      details: { skipped: true },
    };
  }

  if (durationMs < HARD_MIN_MS || durationMs > HARD_MAX_MS) {
    return {
      name,
      pass: false,
      message: `Duration ${durationMs}ms outside hard bounds ${HARD_MIN_MS}-${HARD_MAX_MS}ms`,
      details: { durationMs, hard: [HARD_MIN_MS, HARD_MAX_MS] },
    };
  }

  if (input.mode === 'repro') {
    if (durationMs < FILED_MIN_MS || durationMs > FILED_MAX_MS) {
      return {
        name,
        pass: false,
        message: `Filed repro duration ${durationMs}ms outside ${FILED_MIN_MS}-${FILED_MAX_MS}ms`,
        details: {
          durationMs,
          filed: [FILED_MIN_MS, FILED_MAX_MS],
        },
      };
    }
  }

  return {
    name,
    pass: true,
    message: `Duration ${durationMs}ms within bounds`,
    details: { durationMs },
  };
}

async function resolveDurationMs(
  input: DurationGateInput,
): Promise<number | undefined> {
  if (input.videoPath) {
    return probeDurationMs(input.videoPath);
  }
  return input.timeline?.targetDurationMs;
}
