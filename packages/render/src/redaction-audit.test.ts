import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { runOcrAudit } from './redaction.js';
it('captions and a forged sidecar never establish a strict pixel audit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'repro-audit-test-'));
  try {
    const video = join(dir, 'not-video.mp4');
    await writeFile(video, 'not a video');
    await writeFile(`${video}.ocr.json`, '[]');
    await writeFile(join(dir, 'captions.vtt'), 'WEBVTT\n');
    await expect(runOcrAudit(video, { requireAudit: true })).rejects.toThrow(
      'OCR audit is required',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
