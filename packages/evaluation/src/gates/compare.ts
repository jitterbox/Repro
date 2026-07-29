import { probeVideoSize } from '../frames.js';

import type { GateResult } from '../types/gate.js';
import type { CompareComposition } from './plan-types.js';

export interface CompareGateInput {
  readonly composition?: CompareComposition | undefined;
  readonly videoPath?: string | undefined;
}

export async function checkCompare(
  input: CompareGateInput,
): Promise<GateResult> {
  const name = 'compare';
  const composition = input.composition;

  if (!composition) {
    return {
      name,
      pass: true,
      message: 'Compare composition not provided; gate not applicable',
      details: { applicable: false },
    };
  }

  const paneLabels = Object.values(composition.panes ?? {})
    .map((pane) => pane.label)
    .filter(
      (label): label is string =>
        typeof label === 'string' && label.length > 0,
    );

  const deltaCount = composition.deltas?.length ?? 0;
  const missing: string[] = [];
  if (paneLabels.length < 2) {
    missing.push('pane labels');
  }
  if (deltaCount === 0) {
    missing.push('deltas');
  }

  if (missing.length > 0) {
    return {
      name,
      pass: false,
      message: `Compare composition missing ${missing.join(' and ')}`,
      details: { paneLabels, deltaCount },
    };
  }

  if (input.videoPath === undefined) {
    return {
      name,
      pass: false,
      message: 'Compare acceptance requires encoded compare MP4',
      details: { paneLabels, deltaCount, encoded: false },
    };
  }

  try {
    const size = await probeVideoSize(input.videoPath);
    if (size.width !== 1280 || size.height !== 720) {
      return {
        name,
        pass: false,
        message:
          `Compare MP4 must be 1280x720 (got ${String(size.width)}x` +
          `${String(size.height)})`,
        details: { paneLabels, deltaCount, ...size },
      };
    }
  } catch (error) {
    return {
      name,
      pass: false,
      message: `Compare video probe failed: ${errorMessage(error)}`,
      details: { paneLabels, deltaCount },
    };
  }

  return {
    name,
    pass: true,
    message: 'Compare composition and 1280x720 MP4 present',
    details: { paneLabels, deltaCount, encoded: true, width: 1280, height: 720 },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
