import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { renderCompare } from './compare-encode.js';

const execFileAsync = promisify(execFile);

async function tinyVideo(path: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=640x360:d=1',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=640x360:d=1',
    '-filter_complex',
    '[0:v][1:v]hstack[v]',
    '-map',
    '[v]',
    '-frames:v',
    '30',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    path,
  ]);
}

describe('renderCompare', () => {
  it('encodes a 1280x720 side-by-side composite with chrome', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-compare-encode-'));
    const videoA = join(dir, 'a.mp4');
    const videoB = join(dir, 'b.mp4');
    await tinyVideo(videoA);
    await tinyVideo(videoB);

    const composition = {
      schemaVersion: '1.0.0',
      bugId: 'BUG-1001',
      layout: 'side-by-side' as const,
      output: { width: 1280, height: 720, fps: 30 },
      panes: {
        a: { runId: 'a', role: 'before' as const, label: 'BEFORE' },
        b: { runId: 'b', role: 'after' as const, label: 'AFTER' },
      },
      sync: {
        strategy: 'anchors-only' as const,
        anchors: [{ stepId: 'save-step', aMs: 0, bMs: 0, outMs: 0 }],
        knots: [[0, 0, 0, 1]] as const,
      },
      deltas: [
        {
          selector: 'btn-save',
          class: 'geometry' as const,
          dx: -12,
          caption: 'Δx=-12px',
        },
      ],
    };

    const result = await renderCompare({
      composition,
      outDir: dir,
      videoA,
      videoB,
    });

    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      result.outputPath,
    ]);
    expect(stdout.trim()).toBe('1280,720');
    await writeFile(join(dir, 'ok'), '1');
  }, 60_000);
});
