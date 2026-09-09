import { normalizeQualityResult, type QualityResult } from '@repro/contracts';
import { readComposition, readPlan, readTimeline } from './plan-io.js';
import { checkBottomBand } from './bottom-band.js';
import { checkCompare } from './compare.js';
import { checkContrast } from './contrast.js';
import { checkDesignLanguage } from './design-language.js';
import { checkDeterminism } from './determinism.js';
import { checkDuplicateLabels } from './duplicate-labels.js';
import { checkDuration } from './duration.js';
import { checkFlash } from './flash.js';
import { checkHolds } from './holds.js';
import { checkOverlayPresence } from './overlay-presence.js';
import { checkPlacement } from './placement.js';
import { checkRedaction } from './redaction.js';
import { checkSlate } from './slate.js';

import type { DeterministicGateInput, ReproMode } from '../types/gate.js';

export type { GateResult, ReproMode } from '../types/gate.js';
export { checkBottomBand } from './bottom-band.js';
export { checkCompare } from './compare.js';
export { checkContrast } from './contrast.js';
export { checkDesignLanguage } from './design-language.js';
export { checkDeterminism } from './determinism.js';
export { checkDuplicateLabels } from './duplicate-labels.js';
export { checkDuration } from './duration.js';
export { checkFlash } from './flash.js';
export { checkHolds } from './holds.js';
export { checkOverlayPresence } from './overlay-presence.js';
export { checkPlacement } from './placement.js';
export { checkRedaction } from './redaction.js';
export { checkSlate } from './slate.js';

export interface RunDeterministicGatesInput {
  readonly videoPath?: string;
  readonly planPath?: string;
  readonly timelinePath?: string;
  readonly compositionPath?: string;
  readonly baselineTimelinePath?: string;
  readonly baselineVideoPath?: string;
  readonly filename?: string;
  readonly mode?: ReproMode;
  readonly bugId?: string;
  readonly strictRedaction?: boolean;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}

export async function runDeterministicGates(
  input: RunDeterministicGatesInput,
): Promise<{ pass: boolean; results: QualityResult[] }> {
  const context = await loadGateContext(input);
  const results = await Promise.all(
    [
      checkOverlayPresence({
        plan: context.plan,
        videoPath: input.videoPath,
      }),
      checkDuplicateLabels({ plan: context.plan }),
      checkDesignLanguage({ plan: context.plan }),
      checkDuration({
        videoPath: input.videoPath,
        timeline: context.timeline,
        mode: input.mode,
      }),
      checkHolds({ plan: context.plan }),
      checkPlacement({
        plan: context.plan,
        frameWidth: input.frameWidth,
        frameHeight: input.frameHeight,
      }),
      checkBottomBand({
        plan: context.plan,
        frameHeight: input.frameHeight,
      }),
      checkRedaction({
        videoPath: input.videoPath,
        plan: context.plan,
        strictRedaction: input.strictRedaction,
      }),
      checkCompare({
        composition: context.composition,
        videoPath: input.videoPath,
      }),
      checkSlate({
        videoPath: input.videoPath,
        plan: context.plan,
        filename: input.filename,
        bugId: input.bugId,
      }),
      checkContrast({
        videoPath: input.videoPath,
        plan: context.plan,
        frameWidth: input.frameWidth,
        frameHeight: input.frameHeight,
      }),
      checkFlash({ videoPath: input.videoPath }),
      checkDeterminism({
        timelinePath: input.timelinePath,
        baselineTimelinePath: input.baselineTimelinePath,
        videoPath: input.videoPath,
        baselineVideoPath: input.baselineVideoPath,
      }),
    ].map((result) => Promise.resolve(result)),
  );

  const normalized = results.map(normalizeQualityResult);
  return {
    pass: normalized.every(
      (result) => result.status === 'passed' || result.status === 'skipped',
    ),
    results: normalized,
  };
}

async function loadGateContext(input: DeterministicGateInput): Promise<{
  readonly plan: Awaited<ReturnType<typeof readPlan>> | undefined;
  readonly timeline: Awaited<ReturnType<typeof readTimeline>> | undefined;
  readonly composition: Awaited<ReturnType<typeof readComposition>> | undefined;
}> {
  const [plan, timeline, composition] = await Promise.all([
    input.planPath ? readPlan(input.planPath) : Promise.resolve(undefined),
    input.timelinePath
      ? readTimeline(input.timelinePath)
      : Promise.resolve(undefined),
    input.compositionPath
      ? readComposition(input.compositionPath)
      : Promise.resolve(undefined),
  ]);

  return { plan, timeline, composition };
}
