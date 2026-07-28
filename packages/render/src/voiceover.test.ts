import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildNarrationDocument,
  synthesizeVoiceoverSegments,
  writeTranscript,
  writeVtt,
} from './voiceover.js';

describe('voiceover', () => {
  it('builds a canonical narration document with script hash', () => {
    const doc = buildNarrationDocument({
      segments: [
        {
          id: 's1',
          text: 'Click Save',
          timeRange: { end: 1200, start: 0 },
        },
      ],
    });

    expect(doc.model).toBe('kokoro-82m');
    expect(doc.scriptHash).toHaveLength(64);
    expect(doc.voice).toBe('af_heart');
  });

  it('writes VTT and transcript from one narration document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-vo-'));
    try {
      const segments = [
        {
          id: 'cue1',
          text: 'Open cart',
          timeRange: { end: 1500, start: 0 },
        },
      ] as const;
      const doc = buildNarrationDocument({ segments: [...segments] });
      const vttPath = join(dir, 'captions.vtt');
      const transcriptPath = join(dir, 'transcript.md');

      await writeVtt(vttPath, segments);
      await writeTranscript(transcriptPath, doc);

      const vtt = await readFile(vttPath, 'utf8');
      const transcript = await readFile(transcriptPath, 'utf8');
      expect(vtt.startsWith('WEBVTT')).toBe(true);
      expect(vtt).toContain('Open cart');
      expect(transcript).toContain(doc.scriptHash);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it('falls back to silence when Kokoro CLI is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-vo-audio-'));
    try {
      const out = await synthesizeVoiceoverSegments({
        kokoroCommand: 'kokoro-not-installed-xyz',
        outDir: dir,
        segments: [
          {
            id: 'a1',
            text: 'Hello',
            timeRange: { end: 250, start: 0 },
          },
        ],
      });

      expect(out).toHaveLength(1);
      expect(out[0]?.model).toBe('silence-mock');
      expect(out[0]?.audioPath.endsWith('.wav')).toBe(true);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
