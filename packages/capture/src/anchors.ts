import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import type { Page } from 'playwright';

import type { CaptureEventSink } from './events.js';

export type AnchorBoundary = 'after' | 'before';

export interface CaptureAnchorOptions {
  readonly boundary: AnchorBoundary;
  readonly directory: string;
  readonly label: string;
  readonly page: Page;
  readonly pageId: string;
  readonly sink?: CaptureEventSink;
}

export interface AnchorRecord {
  readonly boundary: AnchorBoundary;
  readonly label: string;
  readonly pageId: string;
  readonly path: string;
  readonly tMono: number;
}

export async function captureAnchor(
  options: CaptureAnchorOptions,
): Promise<AnchorRecord> {
  await mkdir(options.directory, { recursive: true });

  const tMono = performance.now();
  const path = join(options.directory, anchorName(options));

  await options.page.screenshot({
    animations: 'disabled',
    path,
    type: 'png',
  });

  const record = anchorRecord(options, path, tMono);
  emitAnchor(record, options.sink);
  return record;
}

function anchorRecord(
  options: CaptureAnchorOptions,
  path: string,
  tMono: number,
): AnchorRecord {
  return {
    boundary: options.boundary,
    label: options.label,
    pageId: options.pageId,
    path,
    tMono,
  };
}

function emitAnchor(
  record: AnchorRecord,
  sink: CaptureEventSink | undefined,
): void {
  sink?.emitEvent({
    kind: 'anchor.capture',
    pageId: record.pageId,
    payload: {
      boundary: record.boundary,
      label: record.label,
      path: record.path,
    },
    tMono: record.tMono,
  });
}

function anchorName(options: CaptureAnchorOptions): string {
  const safeLabel = options.label.replace(/[^a-z0-9_-]+/giu, '-');
  const id = randomUUID();
  return `${options.boundary}-${safeLabel}-${id}.png`;
}
