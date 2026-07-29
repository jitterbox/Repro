import { readFile } from 'node:fs/promises';

import type {
  CompareComposition,
  PlanDocument,
  TimelineDocument,
} from './plan-types.js';

export async function readPlan(path: string): Promise<PlanDocument> {
  return parsePlan(await readFile(path, 'utf8'));
}

export function parsePlan(raw: string): PlanDocument {
  return JSON.parse(raw) as PlanDocument;
}

export async function readTimeline(path: string): Promise<TimelineDocument> {
  return parseTimeline(await readFile(path, 'utf8'));
}

export function parseTimeline(raw: string): TimelineDocument {
  return JSON.parse(raw) as TimelineDocument;
}

export async function readComposition(path: string): Promise<CompareComposition> {
  return parseComposition(await readFile(path, 'utf8'));
}

export function parseComposition(raw: string): CompareComposition {
  return JSON.parse(raw) as CompareComposition;
}

export function bboxWidth(bbox: {
  readonly w?: number;
  readonly width?: number;
}): number {
  return bbox.w ?? bbox.width ?? 0;
}

export function bboxHeight(bbox: {
  readonly h?: number;
  readonly height?: number;
}): number {
  return bbox.h ?? bbox.height ?? 0;
}
