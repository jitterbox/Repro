import type * as Core from '@jitterbox/repro-core';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
vi.mock('@jitterbox/repro-core', async (original) => ({
  ...(await original<typeof Core>()),
  runProcess: async (command: string, args: string[]) => {
    if (command === 'ffmpeg') {
      await writeFile((args.at(-1) ?? '').replace('%06d', '000001'), 'pixels');
      return '';
    }
    if (command === 'ffprobe')
      return JSON.stringify({ frames: [{ best_effort_timestamp_time: '0' }] });
    throw new Error('Unavailable OCR');
  },
}));
import { inspectOcrAudit, GateError } from './redaction.js';
it('retains frame-linked private findings and incomplete mutation reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-report-')),
    path = join(root, 'proof.mp4');
  try {
    await writeFile(path, 'media');
    const options = {
      requireAudit: true,
      diagnosticsDir: join(root, 'reports'),
      sourceFrameMap: [{ sourceFrameId: 'source-1', sourceMs: 1200 }],
      adapter: {
        scan: () =>
          Promise.resolve({
            audited: true,
            source: 'frame-ocr' as const,
            framesScanned: 1,
            hits: [
              {
                text: 'private',
                confidence: 1,
                detector: 'explicit-pattern',
                frame: 0,
                occurrences: [0],
              },
            ],
          }),
      },
    };
    const result = await inspectOcrAudit(path, options);
    assert.ok(result.reportPath);
    const report = JSON.parse(await readFile(result.reportPath, 'utf8')) as {
      passed: boolean;
      findings: { reviewImage: string }[];
    };
    assert.ok(report.findings[0]);
    expect(report.passed).toBe(false);
    expect(report.findings[0]).toMatchObject({
      outputMs: 0,
      source: { sourceFrameId: 'source-1', sourceMs: 1200 },
    });
    expect(await readFile(report.findings[0].reviewImage, 'utf8')).toBe(
      'pixels',
    );
    const error = await inspectOcrAudit(path, {
      ...options,
      adapter: {
        scan: async () => {
          await writeFile(path, 'changed');
          return {
            audited: true,
            source: 'frame-ocr',
            framesScanned: 1,
            hits: [],
          };
        },
      },
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(GateError);
    if (!(error instanceof GateError) || !error.reportPath)
      throw new Error('Expected audit failure with report');
    expect(error.code).toBe('OCR_ARTIFACT_CHANGED');
    const incomplete: unknown = JSON.parse(
      await readFile(error.reportPath, 'utf8'),
    );
    expect(incomplete).toMatchObject({ status: 'incomplete', passed: false });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
