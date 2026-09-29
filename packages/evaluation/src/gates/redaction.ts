import { enforceOcrAudit } from '@jitterbox/repro-render';
import type { GateResult } from '../types/gate.js';
import type { PlanDocument } from './plan-types.js';

export interface RedactionGateInput {
  readonly plan?: PlanDocument | undefined;
  readonly videoPath?: string | undefined;
  readonly strictRedaction?: boolean | undefined;
}

/** Mask geometry describes intent; only an audit of the output verifies it. */
export async function checkRedaction(
  input: RedactionGateInput,
): Promise<GateResult> {
  const name = 'redaction';
  const strict =
    input.strictRedaction === true ||
    input.plan?.config?.redaction?.strict === true;
  if (!strict)
    return {
      name,
      pass: false,
      status: 'skipped',
      message: 'Strict redaction not requested',
    };
  if (!input.videoPath)
    return {
      name,
      pass: false,
      status: 'failed',
      message: 'Required output video is missing',
    };
  try {
    await enforceOcrAudit({
      path: input.videoPath,
      redaction: { strict: true, masks: [] },
      requireAudit: true,
    });
    return {
      name,
      pass: true,
      status: 'passed',
      message: 'All output frames passed OCR audit',
      details: { receipt: `${input.videoPath}.audit.json` },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Output audit failed';
    return {
      name,
      pass: false,
      status: message.includes('could not run') ? 'unsupported' : 'failed',
      message,
    };
  }
}
