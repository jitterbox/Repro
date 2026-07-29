import { access } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { extractFrameAt } from '../frames.js';

import type { GateResult } from '../types/gate.js';
import type { PlanDocument } from './plan-types.js';

export interface SlateGateInput {
  readonly videoPath?: string | undefined;
  readonly plan?: PlanDocument | undefined;
  readonly filename?: string | undefined;
  readonly bugId?: string | undefined;
}

const SLATE_SAMPLE_MS = 1000;

export async function checkSlate(input: SlateGateInput): Promise<GateResult> {
  const name = 'slate';

  if (input.videoPath) {
    const framePath = join(
      await mkdtemp(join(tmpdir(), 'repro-slate-')),
      'slate.jpg',
    );
    try {
      await extractFrameAt(input.videoPath, SLATE_SAMPLE_MS, framePath);
      await access(framePath);
    } catch {
      return {
        name,
        pass: false,
        message: 'No decodable frame at t=1.0s',
      };
    }
  }

  const expectedBugId = resolveExpectedBugId(input);
  if (expectedBugId === undefined) {
    return {
      name,
      pass: true,
      message: 'Slate frame present; bug ID metadata not provided for OCR stub',
      details: { ocr: 'skipped' },
    };
  }

  const planBugId = readPlanBugId(input.plan);
  const filenameBugId = readFilenameBugId(input.filename);
  const planMatchesExpected =
    planBugId === undefined || planBugId === expectedBugId;
  const filenameMatchesExpected =
    filenameBugId === undefined || filenameBugId === expectedBugId;
  const planMatchesFilename =
    planBugId === undefined ||
    filenameBugId === undefined ||
    planBugId === filenameBugId;
  const matches =
    planMatchesExpected && filenameMatchesExpected && planMatchesFilename;

  if (!matches) {
    return {
      name,
      pass: false,
      message: 'Slate bug ID metadata mismatch',
      details: { expectedBugId, planBugId, filenameBugId, ocr: 'metadata-only' },
    };
  }

  return {
    name,
    pass: true,
    message: 'Slate frame present and bug ID metadata agrees',
    details: { expectedBugId, ocr: 'metadata-only' },
  };
}

function resolveExpectedBugId(input: SlateGateInput): string | undefined {
  if (input.bugId) {
    return input.bugId;
  }
  return readPlanBugId(input.plan) ?? readFilenameBugId(input.filename);
}

function readPlanBugId(plan: PlanDocument | undefined): string | undefined {
  const metadata = plan?.metadata;
  if (!metadata) {
    return undefined;
  }
  const bugId = metadata.bugId;
  return typeof bugId === 'string' ? bugId : undefined;
}

function readFilenameBugId(filename: string | undefined): string | undefined {
  if (!filename) {
    return undefined;
  }
  const match = /([A-Z]+-\d+)/u.exec(filename);
  return match?.[1];
}
